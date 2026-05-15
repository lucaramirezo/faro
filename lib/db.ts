import Database from "better-sqlite3";
import { getProfile, resolveStateDbPath } from "@/lib/profiles";
import { reconcileRunsFromJournals } from "@/lib/run-journal";

let _db: Database.Database | null = null;
let _reconciled = false;

export function getDb(): Database.Database {
  if (_db) return _db;
  const profile = getProfile();
  const path = resolveStateDbPath(profile);
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  ensureSchema(db);
  // Q2: rebuild the runs/run_events index from the JSONL journals on first
  // open. Guarded + non-fatal — a reconcile failure must never crash getDb()
  // (the journal is still the source of truth; the index just lags).
  if (!_reconciled) {
    _reconciled = true;
    try {
      reconcileRunsFromJournals(db);
    } catch (err) {
      console.error(
        "[faro] db: reconcileRunsFromJournals failed (non-fatal, index may lag):",
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  _db = db;
  return db;
}

const SCHEMA_CLAIM_DECISIONS = `
  CREATE TABLE IF NOT EXISTS claim_decisions (
    claim_id      TEXT PRIMARY KEY,
    run_id        TEXT NOT NULL,
    profile_id    TEXT NOT NULL DEFAULT 'lwiki',
    category      TEXT NOT NULL,
    section_path  TEXT NOT NULL,
    claim_text    TEXT NOT NULL,
    evidence      TEXT,
    status        TEXT NOT NULL DEFAULT 'pending',
    tweak_text    TEXT,
    reviewer_note TEXT,
    decided_at    TIMESTAMP,
    decided_by    TEXT,
    FOREIGN KEY (run_id) REFERENCES pipeline_runs(run_id)
  );
  CREATE INDEX IF NOT EXISTS idx_claim_decisions_run    ON claim_decisions(run_id, profile_id);
  CREATE INDEX IF NOT EXISTS idx_claim_decisions_status ON claim_decisions(status, profile_id);
`;

// P1: mirror of the migrate.ts runs/run_events DDL. ensureSchema is the lazy
// path RSC code hits; it already drifts from migrate.ts (does NOT create
// artifacts/provider_calls — pre-existing, OUT OF P1 SCOPE, left as-is). The
// run engine queries runs/run_events via getDb(), so their DDL MUST exist on
// whichever path opened the DB or fresh-DB RSC crashes. Keep this byte-aligned
// with scripts/migrate.ts.
const SCHEMA_RUNS = `
  CREATE TABLE IF NOT EXISTS runs (
    run_id        TEXT PRIMARY KEY,
    profile_id    TEXT NOT NULL DEFAULT 'lwiki',
    session_id    TEXT,
    status        TEXT NOT NULL DEFAULT 'queued',
    skill_name    TEXT,
    title         TEXT,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at      TIMESTAMP,
    last_seq      INTEGER NOT NULL DEFAULT -1,
    cost_usd      REAL,
    journal_path  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_runs_profile ON runs(profile_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS run_events (
    run_id   TEXT NOT NULL,
    seq      INTEGER NOT NULL,
    kind     TEXT NOT NULL,
    ts       TIMESTAMP NOT NULL,
    payload  TEXT NOT NULL,
    PRIMARY KEY (run_id, seq),
    FOREIGN KEY (run_id) REFERENCES runs(run_id)
  );
`;

function ensureSchema(db: Database.Database): void {
  db.exec(SCHEMA_CLAIM_DECISIONS);
  ensureColumn(db, "pipeline_runs", "profile_id", "TEXT NOT NULL DEFAULT 'lwiki'");
  ensureColumn(db, "claim_decisions", "parent_claim_id", "TEXT");
  ensureColumn(db, "claim_decisions", "superseded_at", "TIMESTAMP");
  ensureColumn(db, "claim_decisions", "section_path_canonical", "TEXT");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_claim_decisions_parent ON claim_decisions(parent_claim_id)",
  );
  db.exec(SCHEMA_RUNS);
}

function ensureColumn(db: Database.Database, table: string, column: string, type: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.length === 0) return;
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
