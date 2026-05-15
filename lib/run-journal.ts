import "server-only";

import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { getProfile } from "@/lib/profiles";
import { isTerminalKind, type RunEvent, type RunStatus } from "@/lib/run-events";

/**
 * Q2 (locked 2026-05-15): JSONL = source of truth; SQLite = a rebuildable
 * index. Each run owns `<agent_root>/drafts/runs/<run_id>/journal.jsonl`,
 * append-only, fsync on the first event and on every gate/terminal event
 * (hermes turn-journal durability boundary @5e518b1c, MIT — design only). The
 * `runs`/`run_events` tables are derived; the journal is never rebuilt from
 * them. Run durability stays off the Python-shared state.db hot path.
 *
 * Single writer = lib/run-engine.ts. The SSE route only reads/tails.
 * Imports `@/lib/profiles` ONLY (db.ts imports this file — one direction, no
 * cycle: see db.ts Task 6 GOTCHA).
 */

const RUN_ID_RE = /^run_\d+_[0-9a-f]+$/;

export function runJournalRoot(): string {
  return join(getProfile().agent_root, "drafts", "runs");
}

export function runDir(runId: string): string {
  return join(runJournalRoot(), runId);
}

export function journalPath(runId: string): string {
  return join(runDir(runId), "journal.jsonl");
}

/**
 * Append one event. `opts.fsync` MUST be set for the first event of a run and
 * for every approval/clarify/terminal event (submit/gate must survive a crash).
 * A new file needs the *directory* fsync'd too, else the dirent can be lost on
 * power loss (hermes turn-journal rationale).
 */
export function appendEvent(runId: string, ev: RunEvent, opts?: { fsync?: boolean }): void {
  const dir = runDir(runId);
  mkdirSync(dir, { recursive: true });
  const file = journalPath(runId);
  appendFileSync(file, `${JSON.stringify(ev)}\n`);
  if (opts?.fsync) {
    const fd = openSync(file, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    // Directory fsync — best-effort; crash-safety of a *new* file. Some
    // platforms reject a dir fd for fsync; durability of the line itself is
    // already guaranteed by the file fsync above.
    try {
      const dfd = openSync(dir, "r");
      try {
        fsyncSync(dfd);
      } finally {
        closeSync(dfd);
      }
    } catch {
      /* dir fsync unsupported on this platform — non-fatal */
    }
  }
}

/**
 * Replay: all events with `seq > afterSeq`, in file order. Tolerates a
 * truncated final line (a crash mid-write) by skipping anything unparseable —
 * NEVER throws on a bad line.
 */
export function readJournalAfter(runId: string, afterSeq: number): RunEvent[] {
  const file = journalPath(runId);
  if (!existsSync(file)) return [];
  const raw = readFileSync(file, "utf8");
  const out: RunEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    let ev: RunEvent;
    try {
      ev = JSON.parse(line) as RunEvent;
    } catch {
      // Truncated/garbled final line after a crash — skip, don't throw.
      continue;
    }
    if (typeof ev?.seq === "number" && ev.seq > afterSeq) out.push(ev);
  }
  return out;
}

/** Read every event of a run (seq order on disk). */
function readAll(runId: string): RunEvent[] {
  return readJournalAfter(runId, Number.NEGATIVE_INFINITY);
}

function deriveStatus(events: RunEvent[]): RunStatus {
  if (events.length === 0) return "queued";
  const last = events[events.length - 1];
  if (last.kind === "done") return "done";
  if (last.kind === "error") return "failed";
  if (last.kind === "cancelled") return "cancelled";
  // Highest-seq explicit status event wins for non-terminal states.
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === "status") return e.status;
    if (e.kind === "approval") return "awaiting_approval";
    if (e.kind === "clarify") return "awaiting_clarify";
  }
  return "running";
}

function tsToSql(ms: number): string {
  // Store UTC ISO (ends with Z) so the 4.5 read-back UTC normalizer
  // (Date.parse(s.replace(' ','T')+(endsWith('Z')?'':'Z'))) is a no-op.
  return new Date(ms).toISOString();
}

export interface ReconcileResult {
  runs: number;
  eventsInserted: number;
}

/**
 * Rebuild the `runs`/`run_events` index from the journals on disk. Idempotent:
 * `run_events` use INSERT OR IGNORE keyed by (run_id,seq) so a second call
 * inserts 0; the `runs` rollup converges to the same derived state. Called once
 * (guarded) from getDb() after ensureSchema. Safe to run repeatedly (dev
 * hot-reload may call it many times).
 */
export function reconcileRunsFromJournals(db: Database.Database): ReconcileResult {
  const root = runJournalRoot();
  if (!existsSync(root)) return { runs: 0, eventsInserted: 0 };

  const upsertRun = db.prepare(`
    INSERT INTO runs (run_id, profile_id, session_id, status, skill_name, title,
                      created_at, ended_at, last_seq, cost_usd, journal_path)
    VALUES (@run_id, @profile_id, @session_id, @status, @skill_name, @title,
            @created_at, @ended_at, @last_seq, @cost_usd, @journal_path)
    ON CONFLICT(run_id) DO UPDATE SET
      profile_id  = excluded.profile_id,
      session_id  = excluded.session_id,
      status      = excluded.status,
      skill_name  = excluded.skill_name,
      title       = excluded.title,
      ended_at    = excluded.ended_at,
      last_seq    = excluded.last_seq,
      cost_usd    = excluded.cost_usd,
      journal_path = excluded.journal_path
  `);
  const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO run_events (run_id, seq, kind, ts, payload)
    VALUES (?, ?, ?, ?, ?)
  `);

  let runs = 0;
  let eventsInserted = 0;

  const reconcileOne = db.transaction((runId: string) => {
    const events = readAll(runId);
    if (events.length === 0) return;
    runs += 1;

    // Pass 1: derive the rollup (no writes).
    let profileId = "lwiki";
    let sessionId: string | null = null;
    let skillName: string | null = null;
    let costUsd: number | null = null;
    for (const e of events) {
      if (e.kind === "run_started") {
        profileId = e.profile_id || profileId;
        sessionId = e.session_id || sessionId;
        skillName = e.skill_name ?? skillName;
      } else if (e.kind === "done") {
        sessionId = e.session_id || sessionId;
        costUsd = e.costUsd ?? costUsd;
      } else if (e.kind === "usage" && costUsd == null) {
        costUsd = e.costUsd ?? costUsd;
      }
    }

    const lastSeq = events.reduce((m, e) => (e.seq > m ? e.seq : m), -1);
    const firstTs = events[0].ts;
    const terminal = events.find((e) => isTerminalKind(e.kind));
    // Upsert the runs row FIRST so the run_events FK anchor exists (foreign_keys
    // = ON) — then insert events.
    upsertRun.run({
      run_id: runId,
      profile_id: profileId,
      session_id: sessionId,
      status: deriveStatus(events),
      skill_name: skillName,
      title: null,
      created_at: tsToSql(firstTs),
      ended_at: terminal ? tsToSql(terminal.ts) : null,
      last_seq: lastSeq,
      cost_usd: costUsd,
      journal_path: journalPath(runId),
    });

    // Pass 2: insert events idempotently (INSERT OR IGNORE keyed by run_id,seq).
    for (const e of events) {
      const res = insertEvent.run(runId, e.seq, e.kind, tsToSql(e.ts), JSON.stringify(e));
      eventsInserted += res.changes;
    }
  });

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !RUN_ID_RE.test(entry.name)) continue;
    if (!existsSync(journalPath(entry.name))) continue;
    reconcileOne(entry.name);
  }
  return { runs, eventsInserted };
}
