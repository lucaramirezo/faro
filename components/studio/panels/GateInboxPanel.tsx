"use client";

// P3 unified HIL surface. ONE sticky panel listing every pending human
// decision: live run-engine approval/clarify gates (resolved INLINE via the
// reused GatePrompt → the unchanged P1 /api/runs/[runId]/answer) and pending
// dream/claim reviews (NAVIGATIONAL only — a deep-link to the unchanged
// sharded /dreams/<runId>; the Inbox NEVER stamps claim_decisions).
//
// Pull, not SSE (PRD §15.3 / P3 NOTES 5): 5s poll + a `faro:gate-resolved`
// CustomEvent refetch. `lib/gate-inbox` is `server-only` — TYPE-ONLY import;
// data arrives via /api/gates. Cleanup mirrors ProjectPanel's live-flag (a
// ref here, since refetch fires from an interval/event outside the effect),
// NOT AbortController.
import { useCallback, useEffect, useRef, useState } from "react";
import { GatePrompt } from "@/components/runs/GatePrompt";
import type { UnifiedGate } from "@/lib/gate-inbox";

const POLL_MS = 5000;

export function GateInboxPanel({ onOpenDream }: { onOpenDream: (runId: string) => void }) {
  const [gates, setGates] = useState<UnifiedGate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const liveRef = useRef(true);

  const refetch = useCallback(() => {
    fetch("/api/gates")
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{ gates?: UnifiedGate[]; error?: string }>)
          : Promise.reject(r.status),
      )
      .then((d) => {
        if (!liveRef.current) return;
        if (d.error) {
          setError(d.error);
        } else {
          setGates(d.gates ?? []);
          setError(null);
        }
      })
      .catch((e) => liveRef.current && setError(`Could not load gates (${e}).`));
  }, []);

  useEffect(() => {
    liveRef.current = true;
    refetch();
    const id = setInterval(refetch, POLL_MS);
    const onResolved = () => refetch();
    window.addEventListener("faro:gate-resolved", onResolved);
    return () => {
      liveRef.current = false;
      clearInterval(id);
      window.removeEventListener("faro:gate-resolved", onResolved);
    };
  }, [refetch]);

  const runGates = gates.filter((g) => g.source === "run");
  const claimGates = gates.filter((g) => g.source === "claim");

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <header className="space-y-0.5">
        <h2 className="text-sm font-semibold tracking-tight">Gate Inbox</h2>
        <p className="text-[11px] text-muted-foreground">
          Every pending human decision — agent-run gates and dream reviews.
        </p>
      </header>

      {error && (
        <p className="text-[11px] text-destructive">
          [error: {error}] — retrying every {POLL_MS / 1000}s
        </p>
      )}

      {gates.length === 0 && !error && (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          All clear. No pending decisions.
        </p>
      )}

      {runGates.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Agent runs ({runGates.length})
          </h3>
          {runGates.map((g) =>
            g.source === "run" ? (
              <div key={g.gateId} className="space-y-1">
                <p className="font-mono text-[10px] text-muted-foreground">{g.title}</p>
                <GatePrompt
                  runId={g.runId}
                  gate={{
                    gateId: g.gateId,
                    kind: g.kind,
                    tool: g.tool,
                    args: g.args,
                    question: g.question,
                  }}
                  onAnswered={() => {
                    // Notify other surfaces (RunView / other Inbox mounts) and
                    // refresh immediately rather than waiting for the poll.
                    window.dispatchEvent(new CustomEvent("faro:gate-resolved"));
                    refetch();
                  }}
                />
              </div>
            ) : null,
          )}
        </section>
      )}

      {claimGates.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Dream reviews ({claimGates.length})
          </h3>
          {claimGates.map((g) =>
            g.source === "claim" ? (
              <div key={g.gateId} className="rounded-lg border border-border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs">{g.title}</p>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground tabular-nums">
                    {g.pendingCount > 0
                      ? `${g.pendingCount}/${g.totalCount} pending`
                      : `${g.totalCount} decided · awaiting Finalize`}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Two-phase review (per-claim verbs + Finalize) — opens the sharded review.
                </p>
                <button
                  type="button"
                  onClick={() => onOpenDream(g.runId)}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:border-ring hover:bg-accent/40"
                >
                  Open review →
                </button>
              </div>
            ) : null,
          )}
        </section>
      )}
    </div>
  );
}
