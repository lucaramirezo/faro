/**
 * Lightweight seed for the P3 gate-inbox e2e (plan addendum D — "lightweight
 * seed for render/projection"). Inserts, into an ISOLATED faro DB:
 *   - one `runs` row `awaiting_approval` + its JSONL journal (run_started +
 *     an unresolved `approval` for a `Write`),
 *   - one pending dream (`pipeline_runs` + 2 `claim_decisions`, 1 pending).
 *
 * Self-contained (no path-alias imports) so Node runs it directly, mirroring
 * scripts/migrate.ts. NOT a Playwright globalSetup — that would change every
 * spec's lifecycle (the P2/dreams/nav/studio regressions must stay untouched).
 *
 * Usage (prod build+start, the ACTUAL e2e convention — see
 * e2e/studio-dockview.spec.ts; the plan's "dev server" wording is wrong):
 *   export FARO_STATE_DB=/tmp/faro-e2e-gate.db
 *   export FARO_AGENT_ROOT=/tmp/faro-e2e-gate
 *   node --experimental-strip-types e2e/seed-gate-inbox.ts   # prints the ids
 *   # start the server with the SAME FARO_STATE_DB + FARO_AGENT_ROOT, then:
 *   export FARO_E2E_GATE_RUN_ID=...  FARO_E2E_GATE_DREAM_ID=...
 *   bun run build && (bun run start &) && sleep 4 \
 *     && bun run test:e2e -- gate-inbox
 *
 * NEVER point FARO_STATE_DB at the shared slack_agent/runs/state.db (the
 * P1/P2/P3 DB-isolation invariant — guarded below).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";

const dbPath = process.env.FARO_STATE_DB;
const agentRoot = process.env.FARO_AGENT_ROOT;
if (!dbPath || !agentRoot) {
  console.error("seed-gate-inbox: set FARO_STATE_DB and FARO_AGENT_ROOT to ISOLATED paths first.");
  process.exit(1);
}
if (dbPath.includes("slack_agent")) {
  console.error("seed-gate-inbox: refusing — FARO_STATE_DB points at the shared slack_agent DB.");
  process.exit(1);
}
const profileId = process.env.FARO_PROFILE_DEFAULT ?? "lwiki";

mkdirSync(dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Canonical DDL subset the projection reads (byte-aligned with
// scripts/migrate.ts + lib/db.ts). IF NOT EXISTS → harmless on a re-seed.
db.exec(`
  CREATE TABLE IF NOT EXISTS pipeline_runs (
    run_id TEXT PRIMARY KEY, pipeline TEXT NOT NULL, run_date TEXT, status TEXT,
    draft_dir TEXT, created_at TIMESTAMP, result_summary TEXT,
    decision_token TEXT, profile_id TEXT NOT NULL DEFAULT 'lwiki');
  CREATE TABLE IF NOT EXISTS claim_decisions (
    claim_id TEXT PRIMARY KEY, run_id TEXT NOT NULL,
    profile_id TEXT NOT NULL DEFAULT 'lwiki', category TEXT NOT NULL,
    section_path TEXT NOT NULL, claim_text TEXT NOT NULL, evidence TEXT,
    status TEXT NOT NULL DEFAULT 'pending', tweak_text TEXT, reviewer_note TEXT,
    decided_at TIMESTAMP, decided_by TEXT, parent_claim_id TEXT,
    superseded_at TIMESTAMP, section_path_canonical TEXT, promote_to TEXT,
    tweak_patch TEXT);
  CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY, profile_id TEXT NOT NULL DEFAULT 'lwiki',
    session_id TEXT, status TEXT NOT NULL DEFAULT 'queued', skill_name TEXT,
    title TEXT, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP, last_seq INTEGER NOT NULL DEFAULT -1, cost_usd REAL,
    journal_path TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS run_events (
    run_id TEXT NOT NULL, seq INTEGER NOT NULL, kind TEXT NOT NULL,
    ts TIMESTAMP NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (run_id, seq));
`);

const ts = Date.now();
const RUN_ID = `run_${ts}_e2e001`;
const DREAM_ID = `dream_${ts}_e2e001`;
const GATE_ID = `gate_${ts}_e2e001`;
const journalFile = join(agentRoot, "drafts", "runs", RUN_ID, "journal.jsonl");

db.prepare(
  `INSERT OR REPLACE INTO runs
     (run_id, profile_id, session_id, status, journal_path, created_at, last_seq)
   VALUES (?, ?, ?, 'awaiting_approval', ?, ?, 1)`,
).run(RUN_ID, profileId, "sess-e2e", journalFile, new Date(ts).toISOString());

mkdirSync(dirname(journalFile), { recursive: true });
const ev = (seq: number, body: Record<string, unknown>): string =>
  JSON.stringify({ run_id: RUN_ID, seq, ts: ts + seq, terminal: false, ...body });
writeFileSync(
  journalFile,
  `${ev(0, { kind: "run_started", profile_id: profileId, session_id: "sess-e2e", model: "claude-sonnet-4-6" })}\n${ev(
    1,
    {
      kind: "approval",
      gateId: GATE_ID,
      tool: "Write",
      args: { file_path: "/tmp/e2e.txt", content: "hello" },
    },
  )}\n`,
);

db.prepare(
  `INSERT OR REPLACE INTO pipeline_runs
     (run_id, pipeline, run_date, status, draft_dir, created_at, result_summary)
   VALUES (?, 'dreams', '2026-05-19', 'pending', '/tmp/e2e-draft', ?, 'e2e seeded dream')`,
).run(DREAM_ID, new Date(ts).toISOString());
const insC = db.prepare(
  `INSERT OR REPLACE INTO claim_decisions
     (claim_id, run_id, profile_id, category, section_path, claim_text, evidence, status)
   VALUES (?, ?, ?, 'surfaced', 's/p', 'seeded claim', '[]', ?)`,
);
insC.run(`${DREAM_ID}_c1`, DREAM_ID, profileId, "pending");
insC.run(`${DREAM_ID}_c2`, DREAM_ID, profileId, "approved");

db.close();
console.log("seed-gate-inbox: done");
console.log(`export FARO_E2E_GATE_RUN_ID=${RUN_ID}`);
console.log(`export FARO_E2E_GATE_DREAM_ID=${DREAM_ID}`);
