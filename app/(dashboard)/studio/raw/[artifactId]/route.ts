import "server-only";

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { assertArtifactPath, getArtifact } from "@/lib/artifacts";
import { ARTIFACT_ID_REGEX, type Mime } from "@/lib/artifacts-types";
import { getProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

/**
 * Phase 4 — Studio raw-content endpoint.
 *
 * Streams the on-disk artifact at the given id, with defense-in-depth CSP +
 * sandbox + nosniff headers. Path access is guarded by `assertArtifactPath`,
 * which calls `assertUnder()` and refuses any traversal outside the active
 * profile's `agent_root` (DESIGN.md §3, non-negotiable).
 *
 * Used by:
 *  - <iframe sandbox="allow-scripts" src="/studio/raw/<id>"> in HtmlRenderer
 *  - the [Pop out] toolbar button (window.open in a new tab)
 *  - direct hits during smoke tests
 *
 * The route is dynamic; results are not cached at the HTTP layer.
 */

// CSP per DESIGN.md §3.2 — bundle.html artifacts inline their own CSS/JS;
// no external connectivity should ever be needed. `sandbox allow-scripts`
// here is belt-and-suspenders alongside the iframe attribute.
const CSP_HEADER =
  "default-src 'none'; " +
  "script-src 'unsafe-inline'; " +
  "style-src 'unsafe-inline'; " +
  "img-src data: blob:; " +
  "connect-src 'none'; " +
  "sandbox allow-scripts;";

function isDownloadMime(mime: Mime): boolean {
  // text/x-code is download-only when hit directly (pop-out / direct URL).
  // The studio's CodeRenderer reads the bytes server-side via assertArtifactPath
  // and renders them as a Shiki <pre> — it never loads through this route.
  return mime === "text/x-code";
}

function isBinaryMime(mime: Mime): boolean {
  // Phase 4.5 D4: raster image mimes are binary and must NOT carry charset.
  return mime === "image/png" || mime === "image/jpeg" || mime === "image/webp";
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ artifactId: string }> },
): Promise<Response> {
  const { artifactId } = await ctx.params;

  if (!ARTIFACT_ID_REGEX.test(artifactId)) {
    return NextResponse.json({ error: "invalid artifact id" }, { status: 400 });
  }

  const profile = getProfile();
  const artifact = getArtifact(artifactId, profile);
  if (!artifact) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let path: string;
  try {
    path = assertArtifactPath(artifactId, profile);
  } catch (err) {
    console.error("[studio] raw: path traversal blocked:", err);
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let stats: Awaited<ReturnType<typeof stat>>;
  try {
    stats = await stat(path);
  } catch {
    return NextResponse.json({ error: "file missing on disk" }, { status: 404 });
  }

  const contentType = isBinaryMime(artifact.mime)
    ? artifact.mime
    : `${artifact.mime}; charset=utf-8`;
  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Length": String(stats.size),
    "Content-Security-Policy": CSP_HEADER,
    "X-Content-Type-Options": "nosniff",
  });

  if (isDownloadMime(artifact.mime)) {
    const filename = artifact.label ?? `${artifactId}.txt`;
    headers.set("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "")}"`);
  } else {
    headers.set("Content-Disposition", "inline");
  }

  const nodeStream = createReadStream(path);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  return new Response(webStream, { headers });
}
