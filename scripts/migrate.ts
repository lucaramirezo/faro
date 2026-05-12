/**
 * Idempotent additive migration for faro.
 * Safe to run repeatedly; no-ops on already-migrated DBs.
 * NEVER drops or renames existing slack_agent tables.
 *
 * Self-contained (no path-alias imports) so Node can run it directly with
 *   node --experimental-strip-types scripts/migrate.ts
 *
 * Mirrors slack_agent/state.py:_ensure_pipeline_columns additive pattern.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { parse as parseYaml } from "yaml";

const PROFILE_SLUG = process.env.FARO_PROFILE_DEFAULT ?? "lwiki";
const PROFILES_DIR = join(process.cwd(), "profiles");

const rawProfile = readFileSync(join(PROFILES_DIR, `${PROFILE_SLUG}.yml`), "utf8");
const profile = parseYaml(rawProfile) as { agent_root: string; state_db: string };

const agentRoot = process.env.FARO_AGENT_ROOT ?? profile.agent_root;
const dbPath = process.env.FARO_STATE_DB ?? join(agentRoot, profile.state_db);

console.log(`[faro] migrate: opening ${dbPath}`);
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("busy_timeout = 5000");
db.pragma("foreign_keys = ON");

db.exec(`
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
`);

function ensureColumn(table: string, column: string, type: string): void {
  const tCols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (tCols.length === 0) {
    console.warn(
      `[faro] migrate: ${table} table does not exist — skipping ALTER for ${column}. ` +
        "This is expected on a fresh DB but unexpected on the real state.db. " +
        "Verify FARO_STATE_DB / FARO_AGENT_ROOT point at the slack_agent's state.db.",
    );
    return;
  }
  if (tCols.some((c) => c.name === column)) {
    console.log(`[faro] migrate: ${table}.${column} already present`);
    return;
  }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  console.log(`[faro] migrate: added ${table}.${column}`);
}

ensureColumn("pipeline_runs", "profile_id", "TEXT NOT NULL DEFAULT 'lwiki'");
ensureColumn("claim_decisions", "parent_claim_id", "TEXT");
ensureColumn("claim_decisions", "superseded_at", "TIMESTAMP");
ensureColumn("claim_decisions", "section_path_canonical", "TEXT");

db.exec(
  "CREATE INDEX IF NOT EXISTS idx_claim_decisions_parent ON claim_decisions(parent_claim_id)",
);
console.log("[faro] migrate: ensured idx_claim_decisions_parent");

const rows = db.prepare("SELECT COUNT(*) as n FROM claim_decisions").get() as { n: number };
console.log(`[faro] migrate: claim_decisions has ${rows.n} rows`);

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all() as { name: string }[];
console.log(`[faro] migrate: tables = [${tables.map((t) => t.name).join(", ")}]`);

db.close();
console.log("[faro] migrate: done");
