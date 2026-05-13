"use client";

import { Copy01Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { RecCandidate } from "@/lib/recommender";

interface RecCardProps {
  candidate: RecCandidate;
}

function buildPrompt(c: RecCandidate): string {
  if (c.promote_to === "wiki") {
    return `/promote-to-wiki ${c.suggestedSlug}  # from dream ${c.run_id}, claim ${c.claim_id}`;
  }
  return `/install-skill ${c.suggestedSlug}  # from dream ${c.run_id}, claim ${c.claim_id}`;
}

export function RecCard({ candidate }: RecCardProps) {
  const [copied, setCopied] = useState(false);
  const evidence = candidate.evidence[0];
  const evidencePath = evidence?.path;
  const evidenceLine = evidence?.lineno;

  const onCopy = async () => {
    const prompt = buildPrompt(candidate);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Copied", {
        description: <code className="text-[11px] break-all">{prompt}</code>,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clipboard write failed");
    }
  };

  const tone =
    candidate.promote_to === "skill"
      ? "bg-violet-500/20 text-violet-300"
      : "bg-emerald-500/20 text-emerald-300";

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-medium font-mono tabular-nums truncate">
            /{candidate.suggestedSlug}
          </p>
          <div className="flex items-center gap-2 text-[11px]">
            <Badge variant="outline" className={`${tone} border-0 gap-1`}>
              <HugeiconsIcon icon={SparklesIcon} size={10} strokeWidth={2.5} />
              {candidate.promote_to}
            </Badge>
            {candidate.run_date && (
              <span className="text-muted-foreground">from dream {candidate.run_date}</span>
            )}
          </div>
        </div>
      </div>

      <p className="text-sm leading-snug text-foreground/90">{candidate.claim_text}</p>

      {evidencePath && (
        <p className="text-[11px] text-muted-foreground font-mono truncate">
          {evidencePath}
          {evidenceLine ? `:${evidenceLine}` : ""}
        </p>
      )}

      <div className="pt-1">
        <Button variant="default" size="sm" onClick={onCopy} className="gap-1.5">
          <HugeiconsIcon icon={Copy01Icon} size={12} strokeWidth={2.5} />
          {copied ? "Copied" : "Copy as prompt"}
        </Button>
      </div>
    </Card>
  );
}
