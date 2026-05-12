import { Badge } from "@/components/ui/badge";
import type { ClaimRow } from "@/lib/claims-types";

const CATEGORY_BADGE: Record<string, string> = {
  merged: "bg-blue-500/20 text-blue-300",
  resolved: "bg-emerald-500/20 text-emerald-300",
  pruned: "bg-amber-500/20 text-amber-300",
  surfaced: "bg-violet-500/20 text-violet-300",
};

export function ClaimCard({ claim }: { claim: ClaimRow }) {
  const evidenceFirst = claim.evidence[0];
  const evidencePath = evidenceFirst?.path;
  const evidenceLine = evidenceFirst?.lineno;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <Badge variant="outline" className={`${CATEGORY_BADGE[claim.category] ?? ""} border-0`}>
          {claim.category}
        </Badge>
        <span className="text-muted-foreground">{claim.section_path}</span>
      </div>
      <p className="text-sm leading-snug text-foreground/95">
        {claim.tweak_text ? (
          <span>
            <span className="line-through text-muted-foreground/60 decoration-muted-foreground/40 mr-1">
              {claim.claim_text}
            </span>
            <span className="text-foreground">{claim.tweak_text}</span>
          </span>
        ) : (
          claim.claim_text
        )}
      </p>
      {evidencePath && (
        <p className="text-[11px] text-muted-foreground font-mono">
          {evidencePath}
          {evidenceLine ? `:${evidenceLine}` : ""}
        </p>
      )}
    </div>
  );
}
