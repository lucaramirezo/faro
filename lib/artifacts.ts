import "server-only";

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import type Database from "better-sqlite3";
import { revalidatePath, unstable_cache } from "next/cache";
import {
  ARTIFACT_ID_REGEX,
  type Artifact,
  type ArtifactSource,
  type Emitter,
  type Mime,
} from "@/lib/artifacts-types";
import { getDb } from "@/lib/db";
import { getProfile, type Profile } from "@/lib/profiles";
import { assertUnder } from "@/lib/security";

/**
 * Phase 4 — Artifact Studio scanner + read API.
 *
 * Walks `drafts/artifacts/` + `wiki/artifacts/` under the active profile's
 * agent_root, hashes each file, upserts into `artifacts`. Idempotent —
 * same (content_hash + run_id) yields the same artifact_id; rescans skip.
 *
 * Renames or in-place edits hash to a NEW artifact_id (content-addressed
 * snapshots, see DESIGN.md §4).
 *
 * Path operations are guarded by `assertUnder()` — every callsite refuses
 * traversal escapes. Non-negotiable per DESIGN.md §3.
 */

const MIME_BY_EXT: Record<string, Mime> = {
  ".html": "text/html",
  ".htm": "text/html",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ts": "text/x-code",
  ".tsx": "text/x-code",
  ".js": "text/x-code",
  ".jsx": "text/x-code",
  ".py": "text/x-code",
  ".sh": "text/x-code",
  ".yaml": "text/x-code",
  ".yml": "text/x-code",
  ".css": "text/x-code",
  ".sql": "text/x-code",
};

export function mimeFromPath(p: string): Mime | null {
  return MIME_BY_EXT[extname(p).toLowerCase()] ?? null;
}

const EMITTER_PATTERNS: { match: RegExp; emitter: Emitter }[] = [
  { match: /dream[-_]report|\/dreams\//, emitter: "dreams" },
  { match: /brief\.html|\/heartbeat-/, emitter: "brief" },
  { match: /plan-approaches|plan-feature/, emitter: "plan-feature" },
  { match: /triage\.html|wiki-lint/, emitter: "wiki-lint" },
  { match: /ingest-review|\/ingest\//, emitter: "ingest" },
  { match: /\.slidev\.html|\/slidev\//, emitter: "slidev" },
  { match: /\/recommender\//, emitter: "recommender" },
];

export function classifyEmitter(relativePath: string): Emitter {
  for (const { match, emitter } of EMITTER_PATTERNS) {
    if (match.test(relativePath)) return emitter;
  }
  return "manual";
}

export function deriveArtifactId(contentHash: string, runId: string | null): string {
  const seed = `${contentHash}${runId ?? ""}`;
  return createHash("sha256").update(seed).digest("hex").slice(0, 16);
}

export function extractRunIdFromPath(relativePath: string): string | null {
  // drafts/artifacts/<date>/<run_id>/<file...>  -> <run_id>
  // wiki/artifacts/<slug>/<file...>             -> NULL (PRD §5.6: NULL for
  //   hand-promoted wiki artifacts; gallery synthesizes a group key from
  //   the slug at render time so the FK to pipeline_runs(run_id) stays valid).
  const draftsMatch = relativePath.match(/^drafts\/artifacts\/[^/]+\/([^/]+)\//);
  if (draftsMatch) return draftsMatch[1];
  return null;
}

/**
 * Synthetic group key for gallery grouping. Mirrors PRD §5.6: "standalone
 * wiki artifacts grouped under `wiki/<slug>`". The artifacts table stores
 * NULL for wiki run_id (FK-safe); the gallery uses this helper to derive a
 * stable group label for both drafts (= run_id) and wiki (= `wiki-<slug>`).
 *
 * Also handles drafts artifacts whose directory name didn't match a real
 * pipeline_runs row (manual / dogfood drops, run_id set to NULL by the
 * scanner) — falls back to the path's own folder name as the group key.
 */
export function groupKeyForArtifact(args: {
  run_id: string | null;
  path: string;
  agentRoot: string;
}): string {
  if (args.run_id) return args.run_id;
  const rel = relative(args.agentRoot, args.path);
  const wikiMatch = rel.match(/^wiki\/artifacts\/([^/]+)\//);
  if (wikiMatch) return `wiki-${wikiMatch[1]}`;
  const draftsMatch = rel.match(/^drafts\/artifacts\/[^/]+\/([^/]+)\//);
  if (draftsMatch) return `manual-${draftsMatch[1]}`;
  return "manual";
}

async function walkDir(dir: string, out: string[]): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue; // skip dot-dirs
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkDir(full, out);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  } catch {
    // missing dir is fine — artifacts may not exist yet
  }
}

export interface ScanOpts {
  /** Override the active profile (tests). */
  profile?: Profile;
  /** Inject a DB instance (tests). Defaults to `getDb()`. */
  db?: Database.Database;
}

export interface ScanResult {
  scanned: number;
  inserted: number;
  unchanged: number;
  skipped: number;
}

/**
 * Walk drafts/artifacts + wiki/artifacts; upsert each supported file.
 * Returns a count summary. Idempotent — repeated scans skip unchanged rows.
 */
export async function scanArtifacts(opts: ScanOpts = {}): Promise<ScanResult> {
  const p = opts.profile ?? getProfile();
  const db = opts.db ?? getDb();
  const agentRoot = p.agent_root;
  const draftsRoot = join(agentRoot, "drafts", "artifacts");
  const wikiRoot = join(agentRoot, "wiki", "artifacts");

  const files: string[] = [];
  await walkDir(draftsRoot, files);
  await walkDir(wikiRoot, files);

  // Precompute the set of valid run_ids so we can null-out any artifact whose
  // directory name doesn't correspond to a real pipeline_runs row (ad-hoc
  // artifacts like dogfood-* or manual drops). Without this the FK to
  // pipeline_runs(run_id) fires SQLITE_CONSTRAINT_FOREIGNKEY at INSERT time
  // and the scan throws on the first orphan.
  let validRunIds: Set<string>;
  try {
    const rows = db.prepare("SELECT run_id FROM pipeline_runs").all() as { run_id: string }[];
    validRunIds = new Set(rows.map((r) => r.run_id));
  } catch {
    // pipeline_runs may not exist on a fresh DB (slack_agent owns the table);
    // fall back to "no runs known" so all artifacts get run_id = NULL.
    validRunIds = new Set();
  }

  const upsert = db.prepare(`
    INSERT INTO artifacts (
      artifact_id, run_id, profile_id, source, mime, path, label, emitter, bytes, content_hash, promoted_at
    ) VALUES (
      @artifact_id, @run_id, @profile_id, @source, @mime, @path, @label, @emitter, @bytes, @content_hash, @promoted_at
    )
    ON CONFLICT(artifact_id) DO NOTHING
  `);

  let inserted = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const absPath of files) {
    // Defense in depth: never operate on a path outside agent_root.
    assertUnder(absPath, agentRoot);

    const mime = mimeFromPath(absPath);
    if (mime === null) {
      skipped++;
      continue;
    }

    const fileBytes = await readFile(absPath);
    const contentHash = createHash("sha256").update(fileBytes).digest("hex");
    const rel = relative(agentRoot, absPath);
    const rawRunId = extractRunIdFromPath(rel);
    // Null out the run_id when we don't have a matching pipeline_runs row.
    // The gallery still groups via groupKeyForArtifact, which falls back to
    // a wiki-<slug> key from the path when run_id is null.
    const runId = rawRunId && validRunIds.has(rawRunId) ? rawRunId : null;
    const artifactId = deriveArtifactId(contentHash, runId);
    const source: ArtifactSource = rel.startsWith("wiki/") ? "wiki" : "drafts";
    const emitter = classifyEmitter(rel);
    const stats = await stat(absPath);
    // Label = filename. Override at promote time.
    const label = absPath.split("/").pop() ?? null;
    // Wiki artifacts arrive already-promoted (they live in wiki/ by definition).
    const promotedAt = source === "wiki" ? new Date().toISOString() : null;

    const result = upsert.run({
      artifact_id: artifactId,
      run_id: runId,
      profile_id: p.profile,
      source,
      mime,
      path: absPath,
      label,
      emitter,
      bytes: stats.size,
      content_hash: contentHash,
      promoted_at: promotedAt,
    });

    if (result.changes > 0) inserted++;
    else unchanged++;
  }

  if (inserted > 0) {
    // Invalidate the studio gallery cache. Server Actions that mutate
    // promoted_at also call revalidatePath("/studio") — keep the trigger
    // co-located so the page refreshes whenever the row set changes.
    revalidatePath("/studio");
  }

  return { scanned: files.length, inserted, unchanged, skipped };
}

export interface GetArtifactsOpts {
  emitter?: Emitter;
  source?: ArtifactSource;
  /** Defaults to 200. Capped at 1000. */
  limit?: number;
}

const _getArtifactsCached = unstable_cache(
  async (profileId: string, opts: GetArtifactsOpts): Promise<Artifact[]> => {
    const db = getDb();
    const where: string[] = ["profile_id = ?"];
    const params: (string | number)[] = [profileId];
    if (opts.emitter) {
      where.push("emitter = ?");
      params.push(opts.emitter);
    }
    if (opts.source) {
      where.push("source = ?");
      params.push(opts.source);
    }
    const limit = Math.min(opts.limit ?? 200, 1000);
    const rows = db
      .prepare(`
        SELECT artifact_id, run_id, profile_id, source, mime, path, label, emitter,
               bytes, content_hash, created_at, promoted_at
        FROM artifacts
        WHERE ${where.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(...params, limit) as Artifact[];
    return rows;
  },
  ["faro-artifacts-list"],
  { tags: ["artifacts"] },
);

export async function getArtifacts(
  profile?: Profile,
  opts: GetArtifactsOpts = {},
): Promise<Artifact[]> {
  const p = profile ?? getProfile();
  return _getArtifactsCached(p.profile, opts);
}

export function getArtifact(artifactId: string, profile?: Profile): Artifact | null {
  if (!ARTIFACT_ID_REGEX.test(artifactId)) {
    throw new Error(`Invalid artifact_id: ${artifactId}`);
  }
  const p = profile ?? getProfile();
  const db = getDb();
  const row = db
    .prepare(`
      SELECT artifact_id, run_id, profile_id, source, mime, path, label, emitter,
             bytes, content_hash, created_at, promoted_at
      FROM artifacts
      WHERE artifact_id = ? AND profile_id = ?
    `)
    .get(artifactId, p.profile) as Artifact | undefined;
  return row ?? null;
}

/**
 * Returns the on-disk absolute path for `artifactId` AFTER verifying it's
 * still under `profile.agent_root`. Throws on missing artifact or traversal.
 *
 * Every route handler / Server Action that reads artifact bytes MUST call
 * this helper — never construct a path from user input directly.
 */
export function assertArtifactPath(artifactId: string, profile?: Profile): string {
  const a = getArtifact(artifactId, profile);
  if (!a) throw new Error(`Artifact not found: ${artifactId}`);
  const p = profile ?? getProfile();
  return assertUnder(a.path, p.agent_root);
}
