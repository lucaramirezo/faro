"use client";

// Read-only run status board. Rows arrive as props from studio/page.tsx (the
// P1 runs RSC query) — NOT fetched here. No drag, no dispatch (P2 is read-only
// over the existing runs query; full Kanban dispatch is out of scope). Card
// click opens a Run panel via the injected onOpenRun (the Dockview api).
import type { RunStatus } from "@/lib/run-events";

export interface BoardRun {
  run_id: string;
  status: RunStatus;
  skill_name: string | null;
  created_at: string;
  cost_usd: number | null;
}

type Lane = "Active" | "Gated" | "Done" | "Error";

const LANES: Lane[] = ["Active", "Gated", "Done", "Error"];

function laneFor(status: RunStatus): Lane {
  switch (status) {
    case "awaiting_approval":
    case "awaiting_clarify":
      return "Gated";
    case "done":
      return "Done";
    case "failed":
    case "cancelled":
      return "Error";
    default:
      // queued | running | (any unknown) → Active
      return "Active";
  }
}

// UTC-normalize the SQLite TIMESTAMP before diffing — mandatory or the
// relative time drifts by the CET offset (documented 4.5 lesson; mirrors
// app/(dashboard)/runs/page.tsx:23).
function relativeTime(s: string): string {
  const ms = Date.parse(s.replace(" ", "T") + (s.endsWith("Z") ? "" : "Z"));
  if (Number.isNaN(ms)) return "—";
  const diff = Date.now() - ms;
  const sec = Math.max(0, Math.round(diff / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export function Board({
  runs,
  onOpenRun,
}: {
  runs: BoardRun[];
  onOpenRun: (runId: string) => void;
}) {
  const byLane: Record<Lane, BoardRun[]> = { Active: [], Gated: [], Done: [], Error: [] };
  for (const r of runs) byLane[laneFor(r.status)].push(r);

  return (
    <div className="h-full overflow-auto p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {LANES.map((lane) => (
          <section key={lane} className="min-w-0">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {lane}
              <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-normal text-secondary-foreground">
                {byLane[lane].length}
              </span>
            </h3>
            <div className="space-y-2">
              {byLane[lane].map((r) => (
                <button
                  key={r.run_id}
                  type="button"
                  onClick={() => onOpenRun(r.run_id)}
                  className="block w-full rounded-md border border-border bg-card p-3 text-left text-sm hover:border-ring hover:bg-accent/40"
                >
                  <div className="truncate font-mono text-xs text-muted-foreground">{r.run_id}</div>
                  <div className="mt-1 truncate font-medium">{r.skill_name ?? "—"}</div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{relativeTime(r.created_at)}</span>
                    <span>{r.cost_usd != null ? `$${r.cost_usd.toFixed(2)}` : "—"}</span>
                  </div>
                </button>
              ))}
              {byLane[lane].length === 0 && (
                <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                  None
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
