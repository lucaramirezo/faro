"use client";

// Reuse-only Dockview panel: the shipped P1 RunView, verbatim, zero changes.
// RunView is self-contained (tails its own SSE, reconnect loop, inline gate).
import { RunView } from "@/components/runs/RunView";

export function RunPanel({ runId }: { runId: string }) {
  return (
    <div className="h-full overflow-auto">
      <RunView runId={runId} initialAfterSeq={-1} />
    </div>
  );
}
