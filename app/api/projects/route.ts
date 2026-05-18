import { getProfile } from "@/lib/profiles";
import { listProjects } from "@/lib/projects";

/**
 * /api/projects — active projects for the profile (⌘P + Home list source).
 * Tailnet-only via the proxy auth gate (same posture as /api/switch).
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(listProjects(getProfile().profile));
}
