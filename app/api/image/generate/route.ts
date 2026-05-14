import "server-only";

import { revalidatePath } from "next/cache";
import { generateWikiImage } from "@/lib/image-gen";

/**
 * POST /api/image/generate — Phase 4.5 D5 image-gen entry.
 *
 * Body shape (JSON):
 *   {
 *     slug: string,            // canonical wiki slug (kebab-case)
 *     prompt: string,          // user-provided generation prompt
 *     aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9",
 *     quality?: string,        // gpt-image-1 toggles "medium" (default) / "high"
 *   }
 *
 * Auth: relies on Tailscale-User-Login at the proxy layer (laptop dev open).
 * No `x-faro-login` enforcement so Claude Code skills can curl this without
 * forging headers — Tailnet-only exposure is the guard.
 */

interface ImageRequestBody {
  slug?: unknown;
  prompt?: unknown;
  aspectRatio?: unknown;
  quality?: unknown;
}

const ALLOWED_ASPECTS = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;

export async function POST(req: Request): Promise<Response> {
  let body: ImageRequestBody;
  try {
    body = (await req.json()) as ImageRequestBody;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body.slug !== "string" || !body.slug) {
    return Response.json({ error: "slug required" }, { status: 400 });
  }
  if (typeof body.prompt !== "string" || body.prompt.trim().length < 4) {
    return Response.json({ error: "prompt must be at least 4 characters" }, { status: 400 });
  }
  const aspect =
    typeof body.aspectRatio === "string" &&
    (ALLOWED_ASPECTS as readonly string[]).includes(body.aspectRatio)
      ? (body.aspectRatio as (typeof ALLOWED_ASPECTS)[number])
      : undefined;
  const quality = typeof body.quality === "string" ? body.quality : undefined;

  try {
    const result = await generateWikiImage({
      slug: body.slug,
      prompt: body.prompt,
      aspectRatio: aspect,
      quality,
    });
    revalidatePath("/studio");
    return Response.json({
      artifactId: result.artifactId,
      path: result.path,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
      bytes: result.bytes,
      provider: result.provider,
      model: result.model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[faro] /api/image/generate failed: ${message}`);
    return Response.json({ error: message }, { status: 500 });
  }
}
