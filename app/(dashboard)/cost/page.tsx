import { AuthModePill } from "@/components/cost/AuthModePill";
import { PlanLimits } from "@/components/cost/PlanLimits";
import { SubscriptionCard } from "@/components/cost/SubscriptionCard";
import { getActiveBlock, getDaily } from "@/lib/ccusage";
import { requireOpenRouterKey } from "@/lib/env";
import { FALLBACK_PRICING, getPricing } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const CLAUDE_MAX_MONTHLY_USD = 200;

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function currentMonthIso(): string {
  return new Date().toISOString().slice(0, 7);
}

interface OpenRouterCredits {
  totalCredits: number;
  totalUsage: number;
}

async function fetchOpenRouterCredits(): Promise<
  { ok: true; data: OpenRouterCredits } | { ok: false; reason: "unset" | "error" }
> {
  let key: string;
  try {
    key = requireOpenRouterKey();
  } catch {
    return { ok: false, reason: "unset" };
  }
  try {
    const res = await fetch("https://openrouter.ai/api/v1/credits", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return { ok: false, reason: "error" };
    const json = (await res.json()) as {
      data?: { total_credits?: number; total_usage?: number };
    };
    return {
      ok: true,
      data: {
        totalCredits: json.data?.total_credits ?? 0,
        totalUsage: json.data?.total_usage ?? 0,
      },
    };
  } catch (err) {
    console.warn(`[faro] openrouter credits: ${err instanceof Error ? err.message : "unknown"}`);
    return { ok: false, reason: "error" };
  }
}

export default async function CostPage() {
  const [daily, activeBlock, pricing, orCredits] = await Promise.all([
    getDaily(),
    getActiveBlock(),
    getPricing(),
    fetchOpenRouterCredits(),
  ]);

  const month = currentMonthIso();
  const monthEntries = daily.filter((d) => d.date.startsWith(month));
  const monthUsd = monthEntries.reduce((s, d) => s + d.totalCost, 0);
  const monthInput = monthEntries.reduce((s, d) => s + d.inputTokens, 0);
  const monthOutput = monthEntries.reduce((s, d) => s + d.outputTokens, 0);
  const monthCacheRead = monthEntries.reduce((s, d) => s + d.cacheReadTokens, 0);
  const monthCacheCreate = monthEntries.reduce((s, d) => s + d.cacheCreationTokens, 0);

  // Equivalent API cost for the same tokens
  const pricingTable = pricing ?? FALLBACK_PRICING;
  let apiEquivalent = 0;
  for (const d of monthEntries) {
    for (const mb of d.modelBreakdowns) {
      const entry =
        pricingTable[mb.modelName as keyof typeof pricingTable] ??
        FALLBACK_PRICING["claude-sonnet-4-6"];
      apiEquivalent += (mb.inputTokens / 1_000_000) * entry.inputPer1m;
      apiEquivalent += (mb.outputTokens / 1_000_000) * entry.outputPer1m;
      if (entry.cacheReadPer1m !== undefined) {
        apiEquivalent += (mb.cacheReadTokens / 1_000_000) * entry.cacheReadPer1m;
      }
      if (entry.cacheCreatePer1m !== undefined) {
        apiEquivalent += (mb.cacheCreationTokens / 1_000_000) * entry.cacheCreatePer1m;
      }
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Cost</h1>
          <p className="text-sm text-muted-foreground">
            Subscriptions, plan headroom, and API-equivalent spend.
          </p>
        </div>
        <AuthModePill />
      </header>
      <section className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <SubscriptionCard
          name="Claude Max"
          monthlyUsd={CLAUDE_MAX_MONTHLY_USD}
          badge="OAuth · Max"
          status="live"
          primaryStat={{ label: "MTD spend", value: fmtUsd(monthUsd) }}
          secondary={[
            { label: "API-equivalent", value: fmtUsd(apiEquivalent) },
            { label: "Input tokens", value: monthInput.toLocaleString() },
            { label: "Output tokens", value: monthOutput.toLocaleString() },
            {
              label: "Cache (r/w)",
              value: `${monthCacheRead.toLocaleString()} / ${monthCacheCreate.toLocaleString()}`,
            },
          ]}
          hint="Subsidy = API-equivalent − monthly fee."
        />
        <SubscriptionCard
          name="OpenRouter"
          monthlyUsd={null}
          badge="Pay-as-you-go"
          status={orCredits.ok ? "live" : "unset"}
          primaryStat={
            orCredits.ok
              ? {
                  label: "Credits remaining",
                  value: fmtUsd(
                    Math.max(0, orCredits.data.totalCredits - orCredits.data.totalUsage),
                  ),
                }
              : undefined
          }
          secondary={
            orCredits.ok
              ? [
                  {
                    label: "Total purchased",
                    value: fmtUsd(orCredits.data.totalCredits),
                  },
                  {
                    label: "Total used",
                    value: fmtUsd(orCredits.data.totalUsage),
                  },
                ]
              : []
          }
          hint={
            orCredits.ok
              ? undefined
              : "Set FARO_OPENROUTER_API_KEY (LoadCredential on pei) to enable live credits."
          }
        />
        <SubscriptionCard
          name="ChatGPT Plus"
          monthlyUsd={20}
          badge="manual"
          status="manual"
          hint="No first-party usage API — usage tracked manually."
        />
        <SubscriptionCard
          name="Gemini Advanced"
          monthlyUsd={20}
          badge="manual"
          status="manual"
          hint="No first-party usage API."
        />
        <SubscriptionCard
          name="GitHub Copilot"
          monthlyUsd={10}
          badge="manual"
          status="manual"
          hint="Seat-based, no per-token API."
        />
      </section>
      <section>
        <PlanLimits
          fiveHourBlockTokens={activeBlock?.totalTokens}
          fiveHourBlockProjectedTokens={activeBlock?.projection?.totalTokens}
          fiveHourBlockRemainingMinutes={activeBlock?.projection?.remainingMinutes}
        />
      </section>
    </div>
  );
}
