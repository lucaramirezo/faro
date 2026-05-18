import { getDb } from "@/lib/db";
import { getProfile } from "@/lib/profiles";
import { getProject } from "@/lib/projects";

/**
 * /api/projects/[id] — one project + its associated runs & artifacts (by
 * project_id). Read-only; the minimal P2 project surface (no global active-
 * project scoping — that's P3). Tailnet-only via the proxy auth gate.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const profileId = getProfile().profile;
  const project = getProject(profileId, id);
  if (!project) return new Response("project not found", { status: 404 });

  const db = getDb();
  const runs = db
    .prepare(
      "SELECT run_id, status, skill_name, created_at, cost_usd FROM runs WHERE project_id = ? AND profile_id = ? ORDER BY created_at DESC LIMIT 100",
    )
    .all(id, profileId);
  const artifacts = db
    .prepare(
      "SELECT artifact_id, label, path, mime, created_at FROM artifacts WHERE project_id = ? AND profile_id = ? ORDER BY created_at DESC LIMIT 100",
    )
    .all(id, profileId);

  return Response.json({ project, runs, artifacts });
}
