"use client";

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
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
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
        <Button variant="ghost" size="sm" onClick={onToggle} className="shrink-0">
          {mode === "delta" ? "split" : "delta"}
        </Button>
      </div>
    </Card>
  );
}
