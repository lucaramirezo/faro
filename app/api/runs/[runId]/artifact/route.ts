import { scanArtifacts } from "@/lib/artifacts";
import { getDb } from "@/lib/db";
import { getProfile } from "@/lib/profiles";

/**
 * GET /api/runs/[runId]/artifact → { artifactId } | 404
 *
 * Resolves the generation run's `generated.html` to its content-addressed
 * artifact id so the run view can embed it via the UNCHANGED
 * /studio/raw/[artifactId] route (Q5 — allow-scripts-only CSP, not weakened
 * or duplicated). scanArtifacts is idempotent and indexes the just-written
 * file; scanArtifacts NULLs run_id for non-pipeline_runs runs, so we match on
 * the path segment instead of the run_id column.
 */

export const dynamic = "force-dynamic";

const RUN_ID_RE = /^run_\d+_[0-9a-f]+$/;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await ctx.params;
  if (!RUN_ID_RE.test(runId)) {
    return new Response("invalid run id", { status: 400 });
  }
  try {
    await scanArtifacts({ profile: getProfile() });
  } catch (err) {
    console.error("[faro] runs/artifact: scan failed", err);
  }
  const rows = getDb()
    .prepare(
      "SELECT artifact_id, path FROM artifacts WHERE mime = 'text/html' AND path LIKE '%generated.html'",
    )
    .all() as { artifact_id: string; path: string }[];
  const hit = rows.find((r) => r.path.includes(`/${runId}/`));
  if (!hit) {
    return new Response(`no generated artifact for ${runId}`, { status: 404 });
  }
  return Response.json({ artifactId: hit.artifact_id });
}
