// Adapted from developer-hasm/claude-code-dashboard `src/lib/incremental-scanner.ts`
// and `src/lib/usage-db.ts` (MIT). See LICENSE-third-party.md.
//
// Schema is a verbatim port of upstream. Faro only surfaces (runs7d, lastUsed)
// per skill today; the widened columns (tokens, cost, tool_names) are populated
// for forward-compat so cost-per-skill can be added without a migration.

import "server-only";

import { createReadStream, promises as fs, mkdirSync, type Stats } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import type { SkillUsage } from "@/lib/skills/types";

let _db: Database.Database | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS processed_files (
    path TEXT PRIMARY KEY,
    mtime_ms REAL NOT NULL,
    file_size INTEGER NOT NULL,
    lines_processed INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    message_id TEXT,
    synthetic_key TEXT,
    model TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    tool_names TEXT,
    agent_name TEXT,
    skill_name TEXT,
    cwd TEXT,
    source_file TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_turns_message_id
    ON turns(message_id) WHERE message_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_turns_synthetic_key
    ON turns(synthetic_key) WHERE synthetic_key IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_turns_skill ON turns(skill_name) WHERE skill_name IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_turns_time ON turns(timestamp);
  CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);
`;

function getSkillsDb(agentRoot: string): Database.Database {
  if (_db) return _db;
  const dir = path.join(agentRoot, "faro", "data");
  const file = path.join(dir, "skills.db");
  // node:fs/promises doesn't sync the mkdir before we open the file, so do it
  // synchronously up front.
  mkdirSync(dir, { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  _db = db;
  return db;
}

interface ContentBlock {
  type?: string;
  name?: string;
  input?: unknown;
  [k: string]: unknown;
}

export function extractSkillName(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  for (const block of content as ContentBlock[]) {
    if (!block || typeof block !== "object") continue;
    if (block.type !== "tool_use") continue;
    if (block.name !== "Skill") continue;
    const input = block.input;
    if (input && typeof input === "object") {
      const skill = (input as { skill?: unknown }).skill;
      if (typeof skill === "string") return skill;
    }
    if (typeof input === "string") {
      try {
        const parsed = JSON.parse(input);
        if (parsed && typeof parsed === "object" && typeof parsed.skill === "string") {
          return parsed.skill;
        }
      } catch {
        /* not JSON — skip */
      }
    }
    return null;
  }
  return null;
}

function collectToolNames(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  const names: string[] = [];
  for (const block of content as ContentBlock[]) {
    if (
      block &&
      typeof block === "object" &&
      block.type === "tool_use" &&
      typeof block.name === "string"
    ) {
      names.push(block.name);
    }
  }
  return names;
}

export interface ListJsonlOptions {
  projectsDir?: string;
}

export async function listJsonlFiles(opts: ListJsonlOptions = {}): Promise<string[]> {
  const root = opts.projectsDir ?? path.join(os.homedir(), ".claude", "projects");
  let projects: import("node:fs").Dirent[];
  try {
    projects = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const proj of projects) {
    if (!proj.isDirectory()) continue;
    const dir = path.join(root, proj.name);
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (f.endsWith(".jsonl")) out.push(path.join(dir, f));
    }
  }
  return out;
}

interface ProcessedRow {
  mtime_ms: number;
  file_size: number;
  lines_processed: number;
}

async function ingestFile(db: Database.Database, file: string, stats: Stats): Promise<void> {
  const existing = db
    .prepare("SELECT mtime_ms, file_size, lines_processed FROM processed_files WHERE path = ?")
    .get(file) as ProcessedRow | undefined;
  if (existing && existing.mtime_ms === stats.mtimeMs && existing.file_size === stats.size) {
    return;
  }

  const insertTurn = db.prepare(`
    INSERT OR IGNORE INTO turns (
      session_id, timestamp, message_id, synthetic_key, model,
      input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
      cost_usd, tool_names, agent_name, skill_name, cwd, source_file
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertProcessed = db.prepare(`
    INSERT INTO processed_files (path, mtime_ms, file_size, lines_processed)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      mtime_ms = excluded.mtime_ms,
      file_size = excluded.file_size,
      lines_processed = excluded.lines_processed
  `);

  const stream = createReadStream(file, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let lineCount = 0;
  const txn = db.transaction(() => {
    // body fills synchronously via the readline closure below
  });

  // Buffer all turns then commit in a single transaction (jsonl files are
  // typically << 100MB; if they grow we can chunk later).
  const turns: Array<unknown[]> = [];
  for await (const line of rl) {
    lineCount += 1;
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row.type !== "assistant") continue;
    const message = (row.message ?? {}) as Record<string, unknown>;
    const content = (message.content ?? []) as unknown;
    const skillName = extractSkillName(content);
    const toolNames = collectToolNames(content);
    const usage = (message.usage ?? {}) as Record<string, unknown>;
    const inputTokens = Number(usage.input_tokens ?? 0) || 0;
    const outputTokens = Number(usage.output_tokens ?? 0) || 0;
    const cacheReadTokens = Number(usage.cache_read_input_tokens ?? 0) || 0;
    const cacheCreationTokens = Number(usage.cache_creation_input_tokens ?? 0) || 0;
    const messageId =
      typeof message.id === "string"
        ? (message.id as string)
        : typeof row.uuid === "string"
          ? (row.uuid as string)
          : null;
    const syntheticKey =
      messageId == null
        ? `${row.sessionId ?? ""}|${row.timestamp ?? ""}|${file}|${lineCount}`
        : null;
    turns.push([
      String(row.sessionId ?? ""),
      String(row.timestamp ?? ""),
      messageId,
      syntheticKey,
      typeof message.model === "string" ? message.model : null,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      0, // cost_usd — Faro doesn't price per turn yet
      toolNames.length ? JSON.stringify(toolNames) : null,
      null, // agent_name — upstream-derived metadata, unused here
      skillName,
      typeof row.cwd === "string" ? row.cwd : null,
      file,
    ]);
  }

  db.transaction(() => {
    for (const t of turns) {
      insertTurn.run(...(t as Parameters<typeof insertTurn.run>));
    }
    upsertProcessed.run(file, stats.mtimeMs, stats.size, lineCount);
  })();
  // suppress unused-var lint
  void txn;
}

export interface GetSkillUsageOptions {
  agentRoot: string;
  jsonlRoot?: string;
}

export async function ingestSkillsUsage(opts: GetSkillUsageOptions): Promise<void> {
  const db = getSkillsDb(opts.agentRoot);
  const files = await listJsonlFiles({ projectsDir: opts.jsonlRoot });
  for (const file of files) {
    try {
      const stats = await fs.stat(file);
      await ingestFile(db, file, stats);
    } catch (err) {
      console.warn(`[faro] skills usage: ingest failed for ${file}: ${err}`);
    }
  }
}

// SUPERSEDED-SOURCE NOTE (Bug-6 fix, 2026-05-18): the upstream JSONL→turns
// ingest (ingestSkillsUsage / getSkillsDb / ingestFile / extractSkillName,
// verbatim port) only counts `Skill` tool_use blocks in ~/.claude CLI
// transcripts — faro's own run engine never emits those, so the Skills-card
// "runs (7d) / last used" always read 0 / "−". The card must reflect FARO
// runs, so getSkillUsage now reads faro's `runs` table (run-engine writes
// `runs.skill_name`). `runs.created_at` is UTC ISO (`…Z`); the
// `datetime('now','-7 days')` comparison is lexicographically correct for a
// 7-day window. The upstream ingest apparatus is intentionally retained
// (still exported + unit-tested) for future ~/.claude correlation — it is
// just no longer this card's data source.
export async function getSkillUsage(_opts: GetSkillUsageOptions): Promise<Map<string, SkillUsage>> {
  const db = getDb();
  const lastUsedRows = db
    .prepare(
      "SELECT skill_name AS name, MAX(created_at) AS lastUsed FROM runs WHERE skill_name IS NOT NULL GROUP BY skill_name",
    )
    .all() as Array<{ name: string; lastUsed: string | null }>;
  const runs7dRows = db
    .prepare(
      "SELECT skill_name AS name, COUNT(*) AS runs FROM runs WHERE skill_name IS NOT NULL AND created_at >= datetime('now','-7 days') GROUP BY skill_name",
    )
    .all() as Array<{ name: string; runs: number }>;
  const usage = new Map<string, SkillUsage>();
  for (const r of lastUsedRows) {
    usage.set(r.name, { name: r.name, runs7d: 0, lastUsed: r.lastUsed });
  }
  for (const r of runs7dRows) {
    const existing = usage.get(r.name);
    if (existing) existing.runs7d = r.runs;
    else usage.set(r.name, { name: r.name, runs7d: r.runs, lastUsed: null });
  }
  return usage;
}
