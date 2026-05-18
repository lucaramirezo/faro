import { getProfile } from "@/lib/profiles";
import { searchSwitchTargets } from "@/lib/quick-switch.server";

/**
 * /api/switch — ⌘P union over projects + artifacts + runs.
 *
 * Auth: Tailscale-User-Login at the proxy (same posture as /api/runs — no
 * extra check; tailnet loopback only). No `import "server-only"` in a route;
 * no middleware (Next 16 middleware→proxy rename pending — do not add one).
 * Results are bounded (cap 50 inside searchSwitchTargets).
 */

export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return Response.json(searchSwitchTargets(getProfile().profile, q));
}
