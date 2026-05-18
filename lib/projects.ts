// Projects model — the operator's grouping key over runs + artifacts.
//
// P2 delete = SOFT ARCHIVE ONLY. Hard delete is intentionally NOT implemented:
// `runs`/`run_events` carry `ON DELETE CASCADE`, so a hard project delete would
// drop those *index* rows — but `reconcileRunsFromJournals` (lib/db.ts) would
// resurrect them from the on-disk JSONL journals on the next boot (the journal
// is the source of truth, P1 Q2), minus their `project_id`. A correct hard
// delete must also tear down the journal + artifact dirs; that is a deliberate
// later-phase item. `archiveProject` is the only destructive op in P2.
import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "@/lib/db";
import { getProfile, type Profile } from "@/lib/profiles";
import { isSafeId } from "@/lib/projects-path";

export interface ProjectRow {
  id: string;
  profile_id: string;
  name: string;
  status: "active" | "archived";
  pending_prompt: string | null;
  metadata_json: string | null;
  created_at: number;
  updated_at: number;
}

const COLS = "id, profile_id, name, status, pending_prompt, metadata_json, created_at, updated_at";

/**
 * Absolute on-disk dir for a project. Always DERIVED from the live profile +
 * id — never stored in the row (the vault relocates laptop↔pei). Throws on an
 * unsafe id (the security-critical guard from lib/projects-path).
 */
export function projectDir(profile: Profile, id: string): string {
  if (!isSafeId(id)) {
    throw new Error(`unsafe project id: ${JSON.stringify(id)}`);
  }
  return join(profile.agent_root, "drafts", "projects", id);
}

/** Active projects for a profile, most-recently-touched first. */
export function listProjects(profileId: string): ProjectRow[] {
  return getDb()
    .prepare(
      `SELECT ${COLS} FROM projects WHERE profile_id = ? AND status = 'active' ORDER BY updated_at DESC`,
    )
    .all(profileId) as ProjectRow[];
}

export function getProject(profileId: string, id: string): ProjectRow | undefined {
  return getDb()
    .prepare(`SELECT ${COLS} FROM projects WHERE profile_id = ? AND id = ?`)
    .get(profileId, id) as ProjectRow | undefined;
}

/**
 * Create a project row and lazily mkdir its on-disk dir. `id` is a v4 UUID
 * (always `isSafeId`-valid). The dir path is derived, never persisted.
 */
export function createProject(
  profileId: string,
  opts: { name: string; pendingPrompt?: string },
): ProjectRow {
  const id = randomUUID();
  const now = Date.now();
  getDb()
    .prepare(`INSERT INTO projects (${COLS}) VALUES (?, ?, ?, 'active', ?, NULL, ?, ?)`)
    .run(id, profileId, opts.name, opts.pendingPrompt ?? null, now, now);
  mkdirSync(projectDir(getProfile(profileId), id), { recursive: true });
  return {
    id,
    profile_id: profileId,
    name: opts.name,
    status: "active",
    pending_prompt: opts.pendingPrompt ?? null,
    metadata_json: null,
    created_at: now,
    updated_at: now,
  };
}

/** Bump recency (called when a project is opened/used). */
export function touchProject(id: string): void {
  getDb().prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(Date.now(), id);
}

/** Soft delete: the only destructive op in P2 (see file header). */
export function archiveProject(id: string): void {
  getDb()
    .prepare("UPDATE projects SET status = 'archived', updated_at = ? WHERE id = ?")
    .run(Date.now(), id);
}
