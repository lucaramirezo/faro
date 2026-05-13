import { GitMergeIcon, Scissor01Icon, SparklesIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { PromoteOverride } from "@/components/dreams/PromoteOverride";
import { Badge } from "@/components/ui/badge";
import type { ClaimRow } from "@/lib/claims-types";

const CATEGORY_BADGE: Record<string, string> = {
  merged: "bg-blue-500/20 text-blue-300",
  resolved: "bg-emerald-500/20 text-emerald-300",
  pruned: "bg-amber-500/20 text-amber-300",
  surfaced: "bg-violet-500/20 text-violet-300",
};

const CATEGORY_ICON: Record<string, IconSvgElement> = {
  merged: GitMergeIcon,
  resolved: Tick02Icon,
  pruned: Scissor01Icon,
  surfaced: SparklesIcon,
};

export function ClaimCard({ claim }: { claim: ClaimRow }) {
  const evidenceFirst = claim.evidence[0];
  const evidencePath = evidenceFirst?.path;
  const evidenceLine = evidenceFirst?.lineno;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <Badge
          variant="outline"
          className={`${CATEGORY_BADGE[claim.category] ?? ""} border-0 gap-1`}
        >
          {CATEGORY_ICON[claim.category] && (
            <HugeiconsIcon icon={CATEGORY_ICON[claim.category]} size={10} strokeWidth={2.5} />
          )}
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
      {claim.category === "surfaced" && (
        <PromoteOverride runId={claim.run_id} claimId={claim.claim_id} current={claim.promote_to} />
      )}
    </div>
  );
}
