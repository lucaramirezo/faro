import "server-only";

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { experimental_generateImage as generateImage } from "ai";
import { deriveArtifactId } from "@/lib/artifacts";
import { getDb } from "@/lib/db";
import { getImagePrice } from "@/lib/pricing";
import { getProfile } from "@/lib/profiles";
import { recordCall } from "@/lib/provider-calls";
import { getImageProvider } from "@/lib/providers";
import { assertUnder } from "@/lib/security";

/**
 * Phase 4.5 D3 — `generateWikiImage` is the single entry point for cover-image
 * generation from the studio. It:
 *
 *   1. Resolves the active feature's provider/model spec from the profile YAML.
 *   2. Calls `experimental_generateImage` (Vercel AI SDK v6).
 *   3. Writes the PNG to `drafts/artifacts/<date>/imagegen-<HHMMSS>/<sha:8>.png`
 *      after `assertUnder(path, agent_root)`.
 *   4. Upserts a row into the `artifacts` table directly (mirrors the
 *      scanArtifacts insert column set) so the gallery sees it immediately
 *      without waiting for the next route scan.
 *   5. Records a `provider_calls` ledger row.
 *
 * Approval flow per decision #6: image lands in `drafts/`, never auto-promoted
 * to wiki. A manual Promote action (existing artifact promote path) moves it
 * to `wiki/artifacts/<slug>/cover.png`.
 */

export interface GenerateWikiImageInput {
  slug: string;
  prompt: string;
  aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
  /** Optional quality override; "high" routes to gpt-image-1 high pricing. */
  quality?: string;
}

export interface GenerateWikiImageResult {
  artifactId: string;
  path: string;
  bytes: number;
  costUsd: number;
  durationMs: number;
  provider: string;
  model: string;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function nowParts(): { date: string; hhmmss: string } {
  const d = new Date();
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    hhmmss: `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`,
  };
}

export async function generateWikiImage(
  input: GenerateWikiImageInput,
): Promise<GenerateWikiImageResult> {
  if (!input.slug || !/^[a-z0-9][a-z0-9._-]*$/i.test(input.slug)) {
    throw new Error(
      "generateWikiImage: slug must match /^[a-z0-9][a-z0-9._-]*$/i (no path separators).",
    );
  }
  if (!input.prompt || input.prompt.trim().length < 4) {
    throw new Error("generateWikiImage: prompt must be at least 4 characters.");
  }

  const profile = getProfile();
  const { spec, model } = getImageProvider("wiki_image");
  const aspect = input.aspectRatio ?? (spec.aspect as GenerateWikiImageInput["aspectRatio"]);

  const started = Date.now();
  const generationArgs: Parameters<typeof generateImage>[0] = {
    model,
    prompt: input.prompt,
    aspectRatio: aspect,
  };
  if (spec.provider === "google") {
    // Imagen 4 rejects person-laden wiki illustrations under default safety
    // settings — keep it off so editorial illustrations don't fail mid-batch.
    generationArgs.providerOptions = {
      google: { personGeneration: "dont_allow" },
    };
  }
  const result = await generateImage(generationArgs);
  const durationMs = Date.now() - started;
  const bytes =
    result.image.uint8Array instanceof Uint8Array
      ? result.image.uint8Array
      : new Uint8Array(result.image.uint8Array);

  const { date, hhmmss } = nowParts();
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const filename = `${contentHash.slice(0, 8)}.png`;
  const relDir = `drafts/artifacts/${date}/imagegen-${hhmmss}-${input.slug}`;
  const absDir = assertUnder(join(profile.agent_root, relDir), profile.agent_root);
  const absPath = assertUnder(join(absDir, filename), profile.agent_root);

  await mkdir(absDir, { recursive: true });
  await writeFile(absPath, bytes);

  const artifactId = deriveArtifactId(contentHash, null);
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO artifacts (
       artifact_id, run_id, profile_id, source, mime, path, label, emitter,
       bytes, content_hash
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    artifactId,
    null,
    profile.profile,
    "drafts",
    "image/png",
    absPath,
    input.slug,
    "imagegen",
    bytes.length,
    contentHash,
  );

  const costUsd = getImagePrice(spec.model, input.quality ?? spec.quality);
  recordCall({
    feature: "wiki_image",
    provider: spec.provider,
    model: spec.model,
    images: 1,
    costUsd,
    durationMs,
    meta: {
      slug: input.slug,
      prompt_chars: input.prompt.length,
      aspect: aspect ?? null,
      quality: input.quality ?? spec.quality ?? null,
      content_sha8: contentHash.slice(0, 8),
    },
  });

  return {
    artifactId,
    path: absPath,
    bytes: bytes.length,
    costUsd,
    durationMs,
    provider: spec.provider,
    model: spec.model,
  };
}
