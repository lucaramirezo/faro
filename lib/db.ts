import Database from "better-sqlite3";
import { getProfile, resolveStateDbPath } from "@/lib/profiles";

let _db: Database.Database | null = null;

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

function ensureSchema(db: Database.Database): void {
  db.exec(SCHEMA_CLAIM_DECISIONS);
  ensureProfileIdColumn(db, "pipeline_runs");
}

function ensureProfileIdColumn(db: Database.Database, table: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === "profile_id")) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'lwiki'`);
}
