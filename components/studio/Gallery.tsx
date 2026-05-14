import Link from "next/link";
import { type Provider, ProviderChip } from "@/components/ui/provider-chip";
import { groupKeyForArtifact } from "@/lib/artifacts";
import type { Artifact, Emitter } from "@/lib/artifacts-types";
import { getProfile } from "@/lib/profiles";
import { cn } from "@/lib/utils";

/**
 * Studio gallery — reverse-chronological list grouped by run_id with sticky
 * group headers. Each row links to /studio/<artifact_id> (deep-link).
 *
 * Layout per DESIGN.md §6.2:
 *   [timestamp · emitter@run_id_short]              ← sticky group header
 *     [chip] label                  relative time ● ← row
 *
 * The emitter is mapped to a ProviderChip color via EMITTER_PROVIDER below —
 * the mapping is metaphorical (emitter:dreams uses anthropic orange because
 * dreams come out of a Claude session; ingest uses linear because of the
 * "ticket flow" connotation; etc.). Pure visual coloring, no semantic claim.
 */

const EMITTER_PROVIDER: Record<Emitter, Provider> = {
  dreams: "anthropic",
  brief: "openai",
  "plan-feature": "gemini",
  "wiki-lint": "slack",
  ingest: "linear",
  slidev: "anthropic",
  recommender: "openrouter",
  imagegen: "gemini-2",
  manual: "github",
};

interface GalleryProps {
  artifacts: Artifact[];
  selectedId: string;
}

export function Gallery({ artifacts, selectedId }: GalleryProps) {
  const profile = getProfile();
  const groups = groupArtifactsByRun(artifacts, profile.agent_root);

  if (groups.size === 0) {
    return <p className="px-3 py-6 text-xs text-muted-foreground">No artifacts yet.</p>;
  }

  return (
    <ol className="divide-y divide-border">
      {Array.from(groups.entries()).map(([groupKey, items]) => {
        const first = items[0];
        const short = groupKey.startsWith("wiki-") ? groupKey : groupKey.slice(0, 8);
        const emitterLabel = first.emitter ?? "manual";
        return (
          <li key={groupKey}>
            <div className="sticky top-0 bg-background/85 backdrop-blur px-3 py-2 text-[11px] font-mono uppercase tracking-wide text-muted-foreground tabular-nums z-10 border-b border-border/40">
              {formatStamp(first.created_at)} · {emitterLabel}@{short}
            </div>
            <ol>
              {items.map((a) => (
                <li key={a.artifact_id}>
                  <Link
                    href={`/studio/${a.artifact_id}`}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent/40 transition-colors",
                      a.artifact_id === selectedId && "bg-accent/60 text-foreground",
                    )}
                  >
                    {a.emitter && (
                      <ProviderChip
                        provider={EMITTER_PROVIDER[a.emitter]}
                        iconOnly
                        aria-label={a.emitter}
                        className="shrink-0 px-1 py-0"
                      />
                    )}
                    <span className="truncate flex-1 min-w-0">{a.label ?? a.artifact_id}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {relativeTime(a.created_at)}
                    </span>
                    <StatusDot promoted={Boolean(a.promoted_at)} />
                  </Link>
                </li>
              ))}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}

function StatusDot({ promoted }: { promoted: boolean }) {
  return (
    <span
      role="status"
      className={cn(
        "h-2 w-2 rounded-full shrink-0",
        promoted ? "bg-emerald-500" : "bg-amber-500/60",
      )}
      aria-label={promoted ? "promoted" : "draft"}
    />
  );
}

function groupArtifactsByRun(artifacts: Artifact[], agentRoot: string): Map<string, Artifact[]> {
  const groups = new Map<string, Artifact[]>();
  for (const a of artifacts) {
    const key = groupKeyForArtifact({ run_id: a.run_id, path: a.path, agentRoot });
    const existing = groups.get(key);
    if (existing) existing.push(a);
    else groups.set(key, [a]);
  }
  return groups;
}

function formatStamp(iso: string): string {
  // SQLite returns ISO-ish "2026-05-13 14:32:00" — render as "2026-05-13 14:32".
  const trimmed = iso.replace(/:\d{2}(\.\d+)?(?:Z)?$/, "");
  return trimmed.replace("T", " ");
}

function relativeTime(iso: string): string {
  const ts = Date.parse(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(ts)) return "—";
  const deltaMs = Date.now() - ts;
  const sec = Math.floor(deltaMs / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}
