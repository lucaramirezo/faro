import {
  BotIcon,
  Brain02Icon,
  CloudIcon,
  Comet01Icon,
  GithubIcon,
} from "@hugeicons/core-free-icons";
import { AccountCard } from "@/components/cost/AccountCard";
import { AuthModePill } from "@/components/cost/AuthModePill";
import { PlanLimits } from "@/components/cost/PlanLimits";
import { SubscriptionCard } from "@/components/cost/SubscriptionCard";
import { getAuthStatusFromCli, getOAuthProfile, getSubscriptionUsage } from "@/lib/anthropic-usage";
import { getActiveBlock, getDaily } from "@/lib/ccusage";
import { requireOpenRouterKey } from "@/lib/env";
import { FALLBACK_PRICING, getPricing } from "@/lib/pricing";
import { getCostsByProvider } from "@/lib/provider-calls";

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
  const [daily, activeBlock, pricing, orCredits, usageResult, profileResult, cliAuth] =
    await Promise.all([
      getDaily(),
      getActiveBlock(),
      getPricing(),
      fetchOpenRouterCredits(),
      getSubscriptionUsage(),
      getOAuthProfile(),
      getAuthStatusFromCli(),
    ]);

  // Phase 4.5 C5: per-provider rollup over the last 7 days from provider_calls.
  // Wrapped in try/catch so a missing/old DB doesn't crash the whole page.
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let tokenApiCostsByProvider: Record<string, number> = {};
  let tokenApiOk = true;
  try {
    tokenApiCostsByProvider = getCostsByProvider({ sinceISO: sevenDaysAgoIso });
  } catch (err) {
    tokenApiOk = false;
    console.warn(
      `[faro] /cost: provider_calls read failed — ${err instanceof Error ? err.message : "unknown"}`,
    );
  }
  const tokenApiTotal = Object.values(tokenApiCostsByProvider).reduce((s, n) => s + n, 0);

  const month = currentMonthIso();
  const monthEntries = daily.filter((d) => d.date.startsWith(month));
  const monthUsd = monthEntries.reduce((s, d) => s + d.totalCost, 0);
  const monthInput = monthEntries.reduce((s, d) => s + d.inputTokens, 0);
  const monthOutput = monthEntries.reduce((s, d) => s + d.outputTokens, 0);
  const monthCacheRead = monthEntries.reduce((s, d) => s + d.cacheReadTokens, 0);
  const monthCacheCreate = monthEntries.reduce((s, d) => s + d.cacheCreationTokens, 0);

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

  // Stitch account info: prefer the OAuth profile (richer), fall back to the
  // CLI status command if the API is unreachable.
  const account = profileResult.profile ?? null;
  const fallbackEmail = cliAuth?.email ?? null;
  const fallbackSub = cliAuth?.subscriptionType ?? null;
  const fallbackOrg = cliAuth?.orgName ?? null;

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Cost</h1>
          <p className="text-sm text-muted-foreground">
            Subscription limits, account identity, and API-equivalent spend.
          </p>
        </div>
        <AuthModePill />
      </header>

      <section className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-[2fr_1fr]">
        <PlanLimits
          fiveHour={usageResult.usage?.fiveHour ?? null}
          sevenDay={usageResult.usage?.sevenDay ?? null}
          sevenDaySonnet={usageResult.usage?.sevenDaySonnet ?? null}
          fetchStatus={usageResult.status}
          errorDetail={usageResult.error}
        />
        <AccountCard
          email={account?.email ?? fallbackEmail}
          displayName={account?.displayName ?? null}
          orgName={account?.orgName ?? fallbackOrg}
          rateLimitTier={account?.rateLimitTier ?? null}
          subscriptionStatus={
            account?.subscriptionStatus ?? (fallbackSub ? `${fallbackSub} (cli)` : null)
          }
          hasClaudeMax={account?.hasClaudeMax ?? fallbackSub === "max"}
          hasClaudePro={account?.hasClaudePro ?? fallbackSub === "pro"}
        />
      </section>

      <section className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <SubscriptionCard
          name="Claude Max"
          icon={Brain02Icon}
          monthlyUsd={CLAUDE_MAX_MONTHLY_USD}
          badge="OAuth · Max"
          status="live"
          primaryStat={{ label: "MTD API-equivalent", value: fmtUsd(apiEquivalent) }}
          secondary={[
            { label: "MTD ccusage cost", value: fmtUsd(monthUsd) },
            {
              label: "5h block (tokens)",
              value: activeBlock?.totalTokens ? activeBlock.totalTokens.toLocaleString() : "—",
            },
            { label: "Input tokens", value: monthInput.toLocaleString() },
            { label: "Output tokens", value: monthOutput.toLocaleString() },
            {
              label: "Cache (r/w)",
              value: `${monthCacheRead.toLocaleString()} / ${monthCacheCreate.toLocaleString()}`,
            },
          ]}
          hint={`Subsidy = API-equivalent − ${fmtUsd(CLAUDE_MAX_MONTHLY_USD)} / mo.`}
        />
        <SubscriptionCard
          name="OpenRouter"
          icon={CloudIcon}
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
          name="Token-API spend (7d)"
          icon={CloudIcon}
          monthlyUsd={null}
          badge="provider_calls"
          status={tokenApiOk ? "live" : "unset"}
          primaryStat={
            tokenApiOk ? { label: "Total (7d)", value: fmtUsd(tokenApiTotal) } : undefined
          }
          secondary={
            tokenApiOk
              ? (["anthropic", "google", "openai"] as const).map((p) => ({
                  label: p,
                  value: fmtUsd(tokenApiCostsByProvider[p] ?? 0),
                }))
              : []
          }
          hint={
            tokenApiOk
              ? "Sonnet rerun + Imagen/gpt-image-1. Chat through Max-sub is unrecorded."
              : "Run `bun run migrate` to create the provider_calls table."
          }
        />
        <SubscriptionCard
          name="ChatGPT Plus"
          icon={BotIcon}
          monthlyUsd={20}
          badge="manual"
          status="manual"
          hint="No first-party usage API — usage tracked manually."
        />
        <SubscriptionCard
          name="Gemini Advanced"
          icon={Comet01Icon}
          monthlyUsd={20}
          badge="manual"
          status="manual"
          hint="No first-party usage API."
        />
        <SubscriptionCard
          name="GitHub Copilot"
          icon={GithubIcon}
          monthlyUsd={10}
          badge="manual"
          status="manual"
          hint="Seat-based, no per-token API."
        />
      </section>
    </div>
  );
}
