"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setPromoteToAction } from "@/app/actions/recommender";
import { Button } from "@/components/ui/button";
import type { PromoteTo } from "@/lib/claims-types";

interface PromoteOverrideProps {
  runId: string;
  claimId: string;
  current: PromoteTo;
}

const OPTIONS: Array<{ value: PromoteTo; label: string }> = [
  { value: "skill", label: "Skill" },
  { value: "wiki", label: "Wiki" },
  { value: null, label: "None" },
];

function keyFor(v: PromoteTo): string {
  return v ?? "none";
}

export function PromoteOverride({ runId, claimId, current }: PromoteOverrideProps) {
  const [pending, beginTransition] = useTransition();

  const onPick = (next: PromoteTo) => {
    if (next === current) return;
    beginTransition(async () => {
      try {
        await setPromoteToAction(runId, claimId, next);
        toast.success(`Promote target → ${next ?? "none"}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Promote update failed");
      }
    });
  };

  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-muted-foreground uppercase tracking-wider">Promote to</span>
      <div className="inline-flex rounded-full border border-border/60 bg-muted/30 p-0.5 gap-0.5">
        {OPTIONS.map((opt) => {
          const active = opt.value === current;
          return (
            <Button
              key={keyFor(opt.value)}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onPick(opt.value)}
              disabled={pending}
              className={
                active
                  ? "h-6 px-2.5 text-[11px] rounded-full bg-background text-foreground"
                  : "h-6 px-2.5 text-[11px] rounded-full text-muted-foreground hover:text-foreground"
              }
            >
              {opt.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
