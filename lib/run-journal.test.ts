import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// Temp agent_root + state.db — created BEFORE the SUT imports (vi.hoisted runs
// first). Stub @/lib/profiles so getProfile()/resolveStateDbPath point at the
// throwaway sandbox; the real shared slack_agent state.db is never touched.
const { TMP } = vi.hoisted(() => {
  const { mkdtempSync: mk } = require("node:fs");
  const { tmpdir: td } = require("node:os");
  const { join: j } = require("node:path");
  return { TMP: mk(j(td(), "faro-rj-")) };
});

vi.mock("@/lib/profiles", () => ({
  getProfile: () => ({
    profile: "test",
    display_name: "test",
    agent_root: TMP,
    memory_dir: "memory",
    state_db: "state.db",
    jsonl_root: "jsonl",
    heartbeat_path: "hb",
    owner_logins: [],
    status: "active",
  }),
  resolveStateDbPath: () => join(TMP, "state.db"),
  resolveJsonlRoot: () => join(TMP, "jsonl"),
}));

import { getDb } from "@/lib/db";
import type { RunEvent } from "@/lib/run-events";
import {
  appendEvent,
  journalPath,
  readJournalAfter,
  reconcileRunsFromJournals,
  runDir,
} from "@/lib/run-journal";

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

function ev(runId: string, seq: number, body: Partial<RunEvent> & { kind: string }): RunEvent {
  return { run_id: runId, seq, ts: 1_700_000_000_000 + seq, terminal: false, ...body } as RunEvent;
}

describe("run-journal", () => {
  it("appendEvent → readJournalAfter filters strictly by seq", () => {
    const runId = "run_100_aaa111";
    appendEvent(
      runId,
      ev(runId, 0, { kind: "run_started", profile_id: "test", session_id: "s1", model: "m" }),
      { fsync: true },
    );
    appendEvent(runId, ev(runId, 1, { kind: "token", text: "hi" }));
    appendEvent(
      runId,
      ev(runId, 2, {
        kind: "done",
        costUsd: 0.01,
        durationMs: 5,
        session_id: "s1",
        terminal: true,
      }),
      { fsync: true },
    );

    expect(readJournalAfter(runId, -1).map((e) => e.seq)).toEqual([0, 1, 2]);
    expect(readJournalAfter(runId, 0).map((e) => e.seq)).toEqual([1, 2]);
    expect(readJournalAfter(runId, 99)).toEqual([]);
  });

  it("tolerates a truncated final JSONL line (crash mid-write) — never throws", () => {
    const runId = "run_101_bbb222";
    mkdirSync(runDir(runId), { recursive: true });
    writeFileSync(
      journalPath(runId),
      `${JSON.stringify(ev(runId, 0, { kind: "token", text: "ok" }))}\n{"run_id":"run_101_bbb2`,
    );
    const out = readJournalAfter(runId, -1);
    expect(out).toHaveLength(1);
    expect(out[0].seq).toBe(0);
  });

  it("reconcileRunsFromJournals is idempotent (second call inserts 0)", () => {
    // getDb() FIRST: its one-time internal reconcile fires here over whatever
    // journals already exist (tests 1-2). Writing run_102 AFTER it keeps the
    // explicit-reconcile count below deterministic (internal didn't see it).
    const db = getDb();

    const runId = "run_102_ccc333";
    appendEvent(
      runId,
      ev(runId, 0, {
        kind: "run_started",
        profile_id: "test",
        session_id: "sess-A",
        model: "m",
        skill_name: "saas-landing",
      }),
      { fsync: true },
    );
    appendEvent(runId, ev(runId, 1, { kind: "token", text: "x" }));
    appendEvent(
      runId,
      ev(runId, 2, {
        kind: "done",
        costUsd: 0.05,
        durationMs: 9,
        session_id: "sess-A",
        terminal: true,
      }),
      { fsync: true },
    );

    const first = reconcileRunsFromJournals(db);
    expect(first.eventsInserted).toBeGreaterThanOrEqual(3);
    const second = reconcileRunsFromJournals(db);
    expect(second.eventsInserted).toBe(0);

    const row = db
      .prepare("SELECT status, last_seq, session_id, skill_name FROM runs WHERE run_id = ?")
      .get(runId) as { status: string; last_seq: number; session_id: string; skill_name: string };
    expect(row.status).toBe("done");
    expect(row.last_seq).toBe(2);
    expect(row.session_id).toBe("sess-A");
    expect(row.skill_name).toBe("saas-landing");
  });

  it("reconcile derives awaiting_approval for a gated, non-terminal journal", () => {
    const runId = "run_103_ddd444";
    appendEvent(
      runId,
      ev(runId, 0, { kind: "run_started", profile_id: "test", session_id: "sess-B", model: "m" }),
      { fsync: true },
    );
    appendEvent(
      runId,
      ev(runId, 1, { kind: "approval", gateId: "gate_1", tool: "Bash", args: {} }),
      { fsync: true },
    );
    const db = getDb();
    reconcileRunsFromJournals(db);
    const row = db.prepare("SELECT status, session_id FROM runs WHERE run_id = ?").get(runId) as {
      status: string;
      session_id: string;
    };
    expect(row.status).toBe("awaiting_approval");
    expect(row.session_id).toBe("sess-B");
  });
});
