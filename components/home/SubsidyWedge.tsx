"use client";

import { CoinsSwapIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const STORAGE_KEY = "faro:home:subsidy-mode";

export interface SubsidyWedgeProps {
  apiEquivalentUsd: number;
  subscriptionUsd: number;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function SubsidyWedge({ apiEquivalentUsd, subscriptionUsd }: SubsidyWedgeProps) {
  const [mode, setMode] = useState<"delta" | "split">("delta");
  useEffect(() => {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "delta" || v === "split") setMode(v);
  }, []);
  const onToggle = () => {
    const next = mode === "delta" ? "split" : "delta";
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
  };
  const delta = apiEquivalentUsd - subscriptionUsd;
  const tone =
    delta > 0
      ? "text-emerald-400"
      : delta > -0.2 * subscriptionUsd
        ? "text-amber-400"
        : "text-rose-400";

  return (
    <Card className="relative overflow-hidden p-4">
      {/* Mesh-hero aurora — subsidy card only (scarcity = premium, PRD §14 #17).
          4-radial CSS gradient stack, mix-blend plus-lighter, no animation,
          no JS. ~0kB beyond globals. Pure visual polish. */}
      <div
        className="absolute inset-0 pointer-events-none mix-blend-plus-lighter opacity-55"
        style={{
          background:
            "radial-gradient(at 20% 20%, oklch(0.72 0.16 50 / 0.55) 0, transparent 50%), " +
            "radial-gradient(at 80% 10%, oklch(0.65 0.13 30 / 0.40) 0, transparent 45%), " +
            "radial-gradient(at 70% 85%, oklch(0.55 0.10 290 / 0.35) 0, transparent 50%), " +
            "radial-gradient(at 30% 70%, oklch(0.60 0.14 200 / 0.30) 0, transparent 45%)",
        }}
        aria-hidden="true"
      />
      <div className="relative flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide inline-flex items-center gap-1.5">
            <HugeiconsIcon icon={CoinsSwapIcon} size={12} strokeWidth={2} className="opacity-70" />
            Subsidy (this week)
          </p>
          {mode === "delta" ? (
            <>
              <p className={`text-2xl font-semibold tabular-nums ${tone}`}>
                {delta >= 0 ? "+" : ""}
                {fmt(delta)}
              </p>
              <p className="text-xs text-muted-foreground">
                API-equivalent {fmt(apiEquivalentUsd)} − subscription {fmt(subscriptionUsd)}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-3">
                <span className="text-base text-muted-foreground">API</span>
                <span className="text-xl font-semibold tabular-nums">{fmt(apiEquivalentUsd)}</span>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-base text-muted-foreground">Sub</span>
                <span className="text-xl font-semibold tabular-nums">{fmt(subscriptionUsd)}</span>
              </div>
            </>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onToggle} className="shrink-0 relative">
          {mode === "delta" ? "split" : "delta"}
        </Button>
      </div>
    </Card>
  );
}
