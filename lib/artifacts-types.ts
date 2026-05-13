import { z } from "zod";

/**
 * Phase 4 — Artifact Studio types.
 *
 * Schema mirrors `artifacts` table in slack_agent/runs/state.db
 * (faro/scripts/migrate.ts, PRD §5.6).
 *
 * artifact_id derivation: sha256(content_hash + run_id ?? '')[:16]
 * Content-addressed snapshots; see faro/.claude/skills/artifacts/DESIGN.md §4.
 */

export const ARTIFACT_MIMES = [
  "text/html",
  "text/markdown",
  "image/svg+xml",
  "application/json",
  "text/x-code",
] as const;

export type Mime = (typeof ARTIFACT_MIMES)[number];

export const ARTIFACT_EMITTERS = [
  "dreams",
  "brief",
  "plan-feature",
  "wiki-lint",
  "ingest",
  "slidev",
  "recommender",
  "manual",
] as const;

export type Emitter = (typeof ARTIFACT_EMITTERS)[number];

export const ARTIFACT_SOURCES = ["drafts", "wiki"] as const;
export type ArtifactSource = (typeof ARTIFACT_SOURCES)[number];

export const ARTIFACT_ID_REGEX = /^[a-f0-9]{16}$/;
export const CONTENT_HASH_REGEX = /^[a-f0-9]{64}$/;

export const ArtifactSchema = z.object({
  artifact_id: z.string().regex(ARTIFACT_ID_REGEX),
  run_id: z.string().nullable(),
  profile_id: z.string(),
  source: z.enum(ARTIFACT_SOURCES),
  mime: z.enum(ARTIFACT_MIMES),
  path: z.string(),
  label: z.string().nullable(),
  emitter: z.enum(ARTIFACT_EMITTERS).nullable(),
  bytes: z.number().int().nonnegative(),
  content_hash: z.string().regex(CONTENT_HASH_REGEX),
  created_at: z.string(),
  promoted_at: z.string().nullable(),
});

export type Artifact = z.infer<typeof ArtifactSchema>;
