import { listPendingGates } from "@/lib/gate-inbox";
import { getProfile } from "@/lib/profiles";

/**
 * GET /api/gates — every pending human decision for the profile, projected
 * into one envelope: live run-engine approval/clarify gates AND pending
 * dream/claim reviews (P3 HIL gate unification).
 *
 * Pull, not SSE (PRD §15.3 / P3 NOTES 5): a 5s poll + a `faro:gate-resolved`
 * CustomEvent refetch is enough for a single operator. Run-gate RESOLUTION
 * still goes to the unchanged P1 /api/runs/[runId]/answer endpoint (locked
 * answer 1, minimal blast radius) — this route is read-only.
 *
 * Tailnet-only via the proxy auth gate (same posture as /api/projects).
 * Structured non-200 error mirrors /api/runs/[runId]/answer.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return Response.json({ gates: listPendingGates(getProfile().profile) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[faro] /api/gates failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
