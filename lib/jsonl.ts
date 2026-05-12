import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { Profile } from "@/lib/profiles";
import { resolveJsonlRoot } from "@/lib/profiles";

/**
 * Fallback parser for Claude Code session jsonl files at
 * ``~/.claude/projects/<slug>/*.jsonl``. Matches the return shape of
 * ``ccusage daily --json`` so callers don't have to branch on data source.
 *
 * Cost is set to 0 here — callers should price tokens via ``lib/pricing.ts``.
 */

export interface DailySummaryEntry {
  date: string; // YYYY-MM-DD (UTC)
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed: string[];
  modelBreakdowns: Array<{
    modelName: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    cost: number;
  }>;
}

export interface DailySummary {
  daily: DailySummaryEntry[];
}

interface DayBucket {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  modelTotals: Map<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
    }
  >;
}

function parseTimestamp(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t);
}

function asNumber(x: unknown): number {
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
}

function findUsage(
  rec: Record<string, unknown>,
): { usage: Record<string, unknown>; model: string } | null {
  const message =
    (rec.message as Record<string, unknown> | undefined) ??
    (rec.assistantMessage as Record<string, unknown> | undefined);
  const usage =
    (message?.usage as Record<string, unknown> | undefined) ??
    (rec.usage as Record<string, unknown> | undefined);
  if (!usage) return null;
  const model =
    (message?.model as string | undefined) ?? (rec.model as string | undefined) ?? "unknown";
  return { usage, model };
}

async function ingestFile(
  path: string,
  sinceMs: number,
  untilMs: number,
  buckets: Map<string, DayBucket>,
): Promise<void> {
  const stream = createReadStream(path, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line || line[0] !== "{") continue;
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const ts = parseTimestamp(rec.timestamp);
    if (!ts) continue;
    const ms = ts.getTime();
    if (ms < sinceMs || ms > untilMs) continue;
    const hit = findUsage(rec);
    if (!hit) continue;
    const day = ts.toISOString().slice(0, 10);
    let bucket = buckets.get(day);
    if (!bucket) {
      bucket = {
        date: day,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        modelTotals: new Map(),
      };
      buckets.set(day, bucket);
    }
    const inputTokens = asNumber(hit.usage.input_tokens);
    const outputTokens = asNumber(hit.usage.output_tokens);
    const cacheCreationTokens = asNumber(hit.usage.cache_creation_input_tokens);
    const cacheReadTokens = asNumber(hit.usage.cache_read_input_tokens);
    bucket.inputTokens += inputTokens;
    bucket.outputTokens += outputTokens;
    bucket.cacheCreationTokens += cacheCreationTokens;
    bucket.cacheReadTokens += cacheReadTokens;
    let mb = bucket.modelTotals.get(hit.model);
    if (!mb) {
      mb = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      };
      bucket.modelTotals.set(hit.model, mb);
    }
    mb.inputTokens += inputTokens;
    mb.outputTokens += outputTokens;
    mb.cacheCreationTokens += cacheCreationTokens;
    mb.cacheReadTokens += cacheReadTokens;
  }
}

export async function getDailyFromJsonl(
  profile: Profile,
  opts: { since?: Date; until?: Date } = {},
): Promise<DailySummary> {
  const root = resolveJsonlRoot(profile);
  const sinceMs = opts.since?.getTime() ?? Date.now() - 90 * 24 * 60 * 60 * 1000;
  const untilMs = opts.until?.getTime() ?? Date.now();
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch (err) {
    console.warn(
      `[faro] jsonl: cannot read ${root}: ${err instanceof Error ? err.message : "unknown"}`,
    );
    return { daily: [] };
  }
  const files = entries.filter((n) => n.endsWith(".jsonl")).map((n) => join(root, n));
  const buckets = new Map<string, DayBucket>();
  for (const file of files) {
    try {
      await ingestFile(file, sinceMs, untilMs, buckets);
    } catch (err) {
      console.warn(
        `[faro] jsonl: failed to ingest ${file}: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }
  const days = Array.from(buckets.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  const daily = days.map<DailySummaryEntry>((b) => ({
    date: b.date,
    inputTokens: b.inputTokens,
    outputTokens: b.outputTokens,
    cacheCreationTokens: b.cacheCreationTokens,
    cacheReadTokens: b.cacheReadTokens,
    totalTokens: b.inputTokens + b.outputTokens + b.cacheCreationTokens + b.cacheReadTokens,
    totalCost: 0,
    modelsUsed: Array.from(b.modelTotals.keys()).sort(),
    modelBreakdowns: Array.from(b.modelTotals.entries()).map(([modelName, t]) => ({
      modelName,
      inputTokens: t.inputTokens,
      outputTokens: t.outputTokens,
      cacheCreationTokens: t.cacheCreationTokens,
      cacheReadTokens: t.cacheReadTokens,
      cost: 0,
    })),
  }));
  return { daily };
}
