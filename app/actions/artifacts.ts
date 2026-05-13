"use server";

import { createHash } from "node:crypto";
import { appendFile, copyFile, mkdir } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertArtifactPath, getArtifact } from "@/lib/artifacts";
import { ARTIFACT_ID_REGEX } from "@/lib/artifacts-types";
import { getDb } from "@/lib/db";
import { getProfile } from "@/lib/profiles";
import { assertUnder, gitCommitStateChange } from "@/lib/security";

/**
 * Phase 4 — Studio Server Actions.
 *
 * promoteArtifactAction: copy drafts/artifacts/<...>/<file> into
 * wiki/artifacts/<slug>/<file>, git-commit the new path, set promoted_at,
 * revalidate /studio.
 *
 * recordHighlightAction: append a JSONL audit line under
 * raw/highlights/<date>/<artifact>.jsonl. Fire-and-forget; never throws to
 * the caller (UI sees only `{ ok: true }`).
 */

const PromoteSchema = z.object({
  artifactId: z.string().regex(ARTIFACT_ID_REGEX),
});

export type PromoteResult =
  | { ok: true; alreadyPromoted?: boolean; newPath?: string }
  | { ok: false; error: string };

function slugFromArtifact(args: {
  runId: string | null;
  label: string | null;
  artifactId: string;
}): string {
  if (args.runId) {
    // run_id is already URL-safe (alphanumeric per migrate.ts). Take a short prefix.
    return args.runId.slice(0, 24);
  }
  // Fallback: hash the artifact_id with a date prefix for ad-hoc artifacts.
  const date = new Date().toISOString().slice(0, 10);
  const h = createHash("sha256").update(args.artifactId).digest("hex").slice(0, 8);
  return `${date}-${h}`;
}

export async function promoteArtifactAction(input: { artifactId: string }): Promise<PromoteResult> {
  const parsed = PromoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: `invalid input: ${parsed.error.message}` };
  }
  const profile = getProfile();
  const artifact = getArtifact(parsed.data.artifactId, profile);
  if (!artifact) {
    return { ok: false, error: "artifact not found" };
  }
  if (artifact.source === "wiki" || artifact.promoted_at) {
    return { ok: true, alreadyPromoted: true };
  }

  let srcPath: string;
  try {
    srcPath = assertArtifactPath(parsed.data.artifactId, profile);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "path guard failed" };
  }

  const slug = slugFromArtifact({
    runId: artifact.run_id,
    label: artifact.label,
    artifactId: artifact.artifact_id,
  });
  const filename = basename(artifact.path);
  const wikiArtifactsRoot = join(profile.agent_root, "wiki", "artifacts");
  const destDir = join(wikiArtifactsRoot, slug);
  const destPath = join(destDir, filename);

  // Path guards: destination must live under <agent_root>/wiki/artifacts/<slug>/.
  try {
    assertUnder(destPath, wikiArtifactsRoot);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "dest path guard failed" };
  }

  try {
    await mkdir(destDir, { recursive: true });
    await copyFile(srcPath, destPath);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "copy failed" };
  }

  // Git-commit the new file (Automated-By trailer added by helper).
  const label = artifact.label ?? artifact.artifact_id;
  await gitCommitStateChange({
    paths: [destPath],
    message: `artifact: promote \`${label}\``,
    cwd: profile.agent_root,
  });

  // Mark the row promoted (additive; do not destroy or rename).
  const db = getDb();
  db.prepare(
    `UPDATE artifacts SET promoted_at = datetime('now') WHERE artifact_id = ? AND profile_id = ?`,
  ).run(parsed.data.artifactId, profile.profile);

  revalidatePath("/studio");
  return { ok: true, newPath: relative(profile.agent_root, destPath) };
}

const HighlightSchema = z.object({
  artifactId: z.string().regex(ARTIFACT_ID_REGEX),
  text: z.string().min(1).max(8192),
  selector: z.string().max(512).default(""),
});

export async function recordHighlightAction(input: {
  artifactId: string;
  text: string;
  selector: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = HighlightSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: `invalid input: ${parsed.error.message}` };
  }
  const profile = getProfile();
  const date = new Date().toISOString().slice(0, 10);
  const highlightsRoot = join(profile.agent_root, "raw", "highlights");
  const dir = join(highlightsRoot, date);
  const file = join(dir, `${parsed.data.artifactId}.jsonl`);

  try {
    // Defense in depth: never write outside <agent_root>/raw/highlights/.
    // The file does not exist yet, so assertUnder must operate on dirname.
    assertUnder(dir, highlightsRoot);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "path guard failed" };
  }

  const payload = JSON.stringify({
    ts: new Date().toISOString(),
    artifact_id: parsed.data.artifactId,
    text: parsed.data.text,
    selector: parsed.data.selector,
  });
  const line = `${payload}\n`;

  try {
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, line, "utf8");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "append failed" };
  }
  return { ok: true };
}
