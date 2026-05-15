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
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { parse as parseYaml } from "yaml";

const PROFILE_SLUG = process.env.FARO_PROFILE_DEFAULT ?? "lwiki";
const PROFILES_DIR = join(process.cwd(), "profiles");

const rawProfile = readFileSync(join(PROFILES_DIR, `${PROFILE_SLUG}.yml`), "utf8");
const profile = parseYaml(rawProfile) as { agent_root: string; state_db: string };

const agentRoot = process.env.FARO_AGENT_ROOT ?? profile.agent_root;
const dbPath = process.env.FARO_STATE_DB ?? join(agentRoot, profile.state_db);

mkdirSync(dirname(dbPath), { recursive: true });
console.log(`[faro] migrate: opening ${dbPath}`);
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("busy_timeout = 5000");
db.pragma("foreign_keys = ON");

// pipeline_runs is owned by slack_agent on production (pei); slack_agent
// creates it via its own bootstrap. On a fresh laptop dev DB the table is
// missing, so any faro RSC that queries it (home page recent-dreams card,
// Provenance JOIN, etc.) crashes with `SqliteError: no such table`. This
// CREATE TABLE IF NOT EXISTS is a minimal stub: same column names the
// faro queries reference, no destructive impact on a real slack_agent DB
// because IF NOT EXISTS no-ops when the table already exists with more
// columns.
db.exec(`
  CREATE TABLE IF NOT EXISTS pipeline_runs (
    run_id      TEXT PRIMARY KEY,
    pipeline    TEXT NOT NULL,
    run_date    TEXT,
    status      TEXT,
    draft_dir   TEXT,
    profile_id  TEXT NOT NULL DEFAULT 'lwiki'
  );
`);

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

// Phase 4 artifacts index — see faro/.claude/skills/artifacts/DESIGN.md
// artifact_id = sha256(content_hash + run_id)[:16] — content-addressed (DESIGN.md §4).
// Mime enum: 'text/html' | 'text/markdown' | 'image/svg+xml' | 'application/json' | 'text/x-code'
// Source enum: 'drafts' | 'wiki'
db.exec(`
  CREATE TABLE IF NOT EXISTS artifacts (
    artifact_id   TEXT PRIMARY KEY,
    run_id        TEXT,
    profile_id    TEXT NOT NULL DEFAULT 'lwiki',
    source        TEXT NOT NULL,
    mime          TEXT NOT NULL,
    path          TEXT NOT NULL,
    label         TEXT,
    emitter       TEXT,
    bytes         INTEGER NOT NULL,
    content_hash  TEXT NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    promoted_at   TIMESTAMP,
    FOREIGN KEY (run_id) REFERENCES pipeline_runs(run_id)
  );
  CREATE INDEX IF NOT EXISTS idx_artifacts_run     ON artifacts(run_id, profile_id);
  CREATE INDEX IF NOT EXISTS idx_artifacts_emitter ON artifacts(emitter, profile_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_artifacts_source  ON artifacts(source, profile_id, created_at DESC);
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
// promote_to ∈ {'skill', 'wiki', NULL}; NULL = not surfaced or not yet tagged.
// Domain enforced at application layer (Zod in lib/claims.ts).
ensureColumn("claim_decisions", "promote_to", "TEXT");
// Phase 4.5 B4: TweakPatch envelope JSON, `{schema_version, patch}`.
// Application-layer validated; SQLite stores the raw JSON string.
ensureColumn("claim_decisions", "tweak_patch", "TEXT");

db.exec(
  "CREATE INDEX IF NOT EXISTS idx_claim_decisions_parent ON claim_decisions(parent_claim_id)",
);
console.log("[faro] migrate: ensured idx_claim_decisions_parent");

// Phase 4.5 C4: provider_calls — per-API-call ledger for cost accounting.
// Open-ended `meta` JSON column (decision #4); recordCall writes from
// lib/agent-sdk.ts (Sonnet rerun) and lib/image-gen.ts (Imagen / gpt-image-1).
// Chat through Max-sub OAuth does NOT write rows (covered by the subscription).
db.exec(`
  CREATE TABLE IF NOT EXISTS provider_calls (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    ts                    TEXT NOT NULL,
    profile               TEXT NOT NULL,
    feature               TEXT NOT NULL,
    provider              TEXT NOT NULL,
    model                 TEXT NOT NULL,
    input_tokens          INTEGER,
    output_tokens         INTEGER,
    cached_input_tokens   INTEGER,
    images                INTEGER,
    cost_usd              REAL NOT NULL,
    duration_ms           INTEGER,
    run_id                TEXT,
    meta                  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_provider_calls_ts
    ON provider_calls(ts);
  CREATE INDEX IF NOT EXISTS idx_provider_calls_profile_feature
    ON provider_calls(profile, feature, ts);
`);
console.log("[faro] migrate: ensured provider_calls table + indexes");

// P1 Control Station run engine (additive). Q2: SQLite is a *rebuildable
// index* over the JSONL turn-journals — durability lives in the journal, not
// here. Independent of the Patch-B `pipeline_runs` dream lifecycle: do NOT FK
// `runs` to `pipeline_runs` (AGENTS.md deviation 10). IF NOT EXISTS keeps this
// idempotent and harmless on the real shared slack_agent state.db.
db.exec(`
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
`);
console.log("[faro] migrate: ensured runs + run_events tables + index");

const rows = db.prepare("SELECT COUNT(*) as n FROM claim_decisions").get() as { n: number };
console.log(`[faro] migrate: claim_decisions has ${rows.n} rows`);

const artifactRows = db.prepare("SELECT COUNT(*) as n FROM artifacts").get() as { n: number };
console.log(`[faro] migrate: artifacts has ${artifactRows.n} rows`);

const runRows = db.prepare("SELECT COUNT(*) as n FROM runs").get() as { n: number };
console.log(`[faro] migrate: runs has ${runRows.n} rows`);

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all() as { name: string }[];
console.log(`[faro] migrate: tables = [${tables.map((t) => t.name).join(", ")}]`);

db.close();
console.log("[faro] migrate: done");
