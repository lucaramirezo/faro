import { NextResponse } from "next/server";
import { getClaimsByRunGrouped } from "@/lib/claims";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  try {
    const grouped = getClaimsByRunGrouped(runId);
    return NextResponse.json({
      runId,
      total: grouped.total,
      pending: grouped.pending,
      decided: grouped.decided,
      byCategory: grouped.byCategory,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[faro] api/dreams/claims: ${msg}`);
    return new NextResponse(msg, { status: 500 });
  }
}
