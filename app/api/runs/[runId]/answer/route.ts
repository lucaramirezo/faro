import { resolveGate } from "@/lib/run-engine";

/**
 * POST /api/runs/[runId]/answer  { gateId, decision }
 *
 * Resolves a pending approval/clarify gate (N1). resolveGate journals
 * `gate_resolved` (fsync) then either terminally cancels the run ("deny") or
 * RESUMES the SDK session with a continuation message. The reconnecting
 * RunView picks the resumed events up via the stream's ?after_seq= tail.
 */

export const dynamic = "force-dynamic";

interface AnswerBody {
  gateId?: unknown;
  decision?: unknown;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await ctx.params;
  let parsed: AnswerBody;
  try {
    parsed = (await req.json()) as AnswerBody;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  const { gateId, decision } = parsed;
  if (typeof gateId !== "string" || gateId.length === 0) {
    return new Response("gateId required", { status: 400 });
  }
  if (typeof decision !== "string" || decision.length === 0) {
    return new Response("decision required", { status: 400 });
  }
  const { resumed } = resolveGate({ runId, gateId, decision });
  return Response.json({ ok: true, resumed });
}
