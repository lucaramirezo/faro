import { BotServices } from "@/components/home/BotServices";
import { KpiCard } from "@/components/home/KpiCard";
import { PendingAttention } from "@/components/home/PendingAttention";
import { type RecentDreamRow, RecentDreams } from "@/components/home/RecentDreams";
import { SubsidyWedge } from "@/components/home/SubsidyWedge";
import { getActiveBlock, getDaily, getWeekly } from "@/lib/ccusage";
import { getDb } from "@/lib/db";
import { parseHeartbeat } from "@/lib/heartbeat";
import { FALLBACK_PRICING, getPricing } from "@/lib/pricing";
import { getProfile } from "@/lib/profiles";
import { getAllBotStatuses } from "@/lib/systemd";

export const dynamic = "force-dynamic";

const CLAUDE_MAX_MONTHLY_USD = 200;
const DAYS_PER_MONTH = 30.44;
const SUBSCRIPTION_WEEKLY_USD = CLAUDE_MAX_MONTHLY_USD * (7 / DAYS_PER_MONTH);

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function lastNDaysIso(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function equivalentApiCostThisWeek(): Promise<number> {
  const weekly = await getWeekly();
  if (weekly.length === 0) return 0;
  // Sum all weeks within last 7 days. ccusage returns weekly buckets; take the
  // most recent bucket as "this week" — totalCost already reflects subscription
  // baseline. Convert into hypothetical API cost using pricing table.
  const pricing = (await getPricing()) ?? FALLBACK_PRICING;
  const latest = weekly[weekly.length - 1];
  if (!latest) return 0;
  let usd = 0;
  for (const mb of latest.modelBreakdowns) {
    const entry =
      pricing[mb.modelName as keyof typeof pricing] ?? FALLBACK_PRICING["claude-sonnet-4-6"];
    usd += (mb.inputTokens / 1_000_000) * entry.inputPer1m;
    usd += (mb.outputTokens / 1_000_000) * entry.outputPer1m;
    if (entry.cacheReadPer1m !== undefined) {
      usd += (mb.cacheReadTokens / 1_000_000) * entry.cacheReadPer1m;
    }
    if (entry.cacheCreatePer1m !== undefined) {
      usd += (mb.cacheCreationTokens / 1_000_000) * entry.cacheCreatePer1m;
    }
  }
  return usd;
}

export default async function HomePage() {
  const profile = getProfile();
  const [daily, activeBlock, apiEquivalent, heartbeat, botStatuses] = await Promise.all([
    getDaily(),
    getActiveBlock(),
    equivalentApiCostThisWeek(),
    parseHeartbeat(profile),
    getAllBotStatuses(),
  ]);

  const today = todayIso();
  const last7 = new Set(lastNDaysIso(7));
  const todayEntry = daily.find((d) => d.date === today);
  const weekEntries = daily.filter((d) => last7.has(d.date));

  const todayUsd = todayEntry?.totalCost ?? 0;
  const weekUsd = weekEntries.reduce((s, d) => s + d.totalCost, 0);
  const sparkWeek = weekEntries.map((d, i) => ({ x: d.date ?? i, v: d.totalCost }));

  const db = getDb();
  const recentRows = db
    .prepare(
      `SELECT run_id, run_date, status, draft_dir
         FROM pipeline_runs
        WHERE pipeline = 'dreams'
        ORDER BY created_at DESC
        LIMIT 5`,
    )
    .all() as RecentDreamRow[];

  const pendingCount = db
    .prepare(`SELECT COUNT(*) as n FROM pipeline_runs WHERE pipeline='dreams' AND status='pending'`)
    .get() as { n: number };
  const pendingItems = [
    ...heartbeat.pendingAttention,
    ...(pendingCount.n > 0 ? [`${pendingCount.n} dream(s) pending review — /dreams`] : []),
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="text-sm text-muted-foreground">
          Today's spend, plan headroom, recent dream candidates.
        </p>
      </header>
      <section className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <KpiCard
          label="Today"
          value={fmt(todayUsd)}
          trendLabel={
            activeBlock
              ? `block ${activeBlock.entries ?? 0} entries · ${fmt(activeBlock.costUSD ?? 0)} so far`
              : "no active block"
          }
          sparkData={sparkWeek}
        />
        <KpiCard label="Week" value={fmt(weekUsd)} sparkData={sparkWeek} />
        <SubsidyWedge apiEquivalentUsd={apiEquivalent} subscriptionUsd={SUBSCRIPTION_WEEKLY_USD} />
      </section>
      <section className="grid gap-3 grid-cols-1 lg:grid-cols-2">
        <PendingAttention items={pendingItems} />
        <RecentDreams rows={recentRows} />
      </section>
      <section>
        <BotServices statuses={botStatuses} />
      </section>
    </div>
  );
}
