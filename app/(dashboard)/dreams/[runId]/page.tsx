import { notFound } from "next/navigation";
import { ReviewTray } from "@/components/dreams/ReviewTray";
import { Badge } from "@/components/ui/badge";
import { getClaimsByRunGrouped, getPipelineRun, materializeClaimRows } from "@/lib/claims";

export const dynamic = "force-dynamic";

export default async function DreamReviewPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = getPipelineRun(runId);
  if (!run) notFound();

  try {
    await materializeClaimRows(runId);
  } catch (err) {
    console.warn(
      `[faro] /dreams/${runId}: materialize failed: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  const grouped = getClaimsByRunGrouped(runId);
  const allClaims = [...grouped.pending, ...grouped.decided];

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight tabular-nums">{runId}</h1>
          <Badge variant="outline">{run.status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {grouped.total} claim{grouped.total === 1 ? "" : "s"} · {grouped.pending.length} pending ·{" "}
          {grouped.decided.length} decided
        </p>
      </header>
      {grouped.total === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No claims to review. (Check that <code>claims.json</code> exists in the draft dir and the
          materialize step ran.)
        </p>
      ) : (
        <ReviewTray runId={runId} decisionToken={run.decision_token} initialClaims={allClaims} />
      )}
    </div>
  );
}
