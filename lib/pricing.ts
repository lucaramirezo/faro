import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { env } from "@/lib/env";

/**
 * Model pricing snapshot, refreshed weekly from LiteLLM's
 * ``model_prices_and_context_window.json``. v0.1 ships **Claude-only** because
 * the subsidy KPI we care about is Anthropic Max subscription vs.
 * Anthropic API equivalent. OpenAI / Gemini keys live under provider prefixes
 * (``openai/gpt-5`` etc.) in LiteLLM and have alias drift we don't want to
 * fight at v0.1 — Phase 2 can extend.
 */

export const PRICING_ALLOWLIST = [
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
] as const;

export type PricingKey = (typeof PRICING_ALLOWLIST)[number];

export interface PricingEntry {
  inputPer1m: number;
  outputPer1m: number;
  cacheReadPer1m?: number;
  cacheCreatePer1m?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
}

export type PricingTable = Record<PricingKey, PricingEntry>;

const LITELLM_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const CACHE_PATH = join(process.cwd(), "data", "pricing-cache.json");

/**
 * Hardcoded fallback. Anthropic published rates as of 2026-05 — used if both
 * the cache file is missing AND the network fetch fails. Verified against
 * LiteLLM ``main`` on 2026-05-11.
 */
export const FALLBACK_PRICING: PricingTable = {
  "claude-opus-4-7": {
    inputPer1m: 5.0,
    outputPer1m: 25.0,
    cacheReadPer1m: 0.5,
    cacheCreatePer1m: 6.25,
    maxInputTokens: 1_000_000,
    maxOutputTokens: 128_000,
  },
  "claude-opus-4-6": {
    inputPer1m: 5.0,
    outputPer1m: 25.0,
    cacheReadPer1m: 0.5,
    cacheCreatePer1m: 6.25,
    maxInputTokens: 1_000_000,
    maxOutputTokens: 128_000,
  },
  "claude-sonnet-4-6": {
    inputPer1m: 3.0,
    outputPer1m: 15.0,
    cacheReadPer1m: 0.3,
    cacheCreatePer1m: 3.75,
    maxInputTokens: 1_000_000,
    maxOutputTokens: 64_000,
  },
  "claude-haiku-4-5": {
    inputPer1m: 1.0,
    outputPer1m: 5.0,
    cacheReadPer1m: 0.1,
    cacheCreatePer1m: 1.25,
    maxInputTokens: 200_000,
    maxOutputTokens: 64_000,
  },
};

const RawEntrySchema = z
  .object({
    input_cost_per_token: z.number().optional(),
    output_cost_per_token: z.number().optional(),
    cache_read_input_token_cost: z.number().optional(),
    cache_creation_input_token_cost: z.number().optional(),
    max_input_tokens: z.number().optional(),
    max_output_tokens: z.number().optional(),
  })
  .passthrough();

const PricingEntrySchema = z.object({
  inputPer1m: z.number(),
  outputPer1m: z.number(),
  cacheReadPer1m: z.number().optional(),
  cacheCreatePer1m: z.number().optional(),
  maxInputTokens: z.number().optional(),
  maxOutputTokens: z.number().optional(),
});

const CacheFileSchema = z.object({
  fetched_at: z.string(),
  source: z.string(),
  entries: z.record(z.string(), PricingEntrySchema),
});

function normalizeEntry(raw: z.infer<typeof RawEntrySchema>): PricingEntry | null {
  if (raw.input_cost_per_token === undefined || raw.output_cost_per_token === undefined) {
    return null;
  }
  return {
    inputPer1m: raw.input_cost_per_token * 1_000_000,
    outputPer1m: raw.output_cost_per_token * 1_000_000,
    cacheReadPer1m:
      raw.cache_read_input_token_cost !== undefined
        ? raw.cache_read_input_token_cost * 1_000_000
        : undefined,
    cacheCreatePer1m:
      raw.cache_creation_input_token_cost !== undefined
        ? raw.cache_creation_input_token_cost * 1_000_000
        : undefined,
    maxInputTokens: raw.max_input_tokens,
    maxOutputTokens: raw.max_output_tokens,
  };
}

function buildTableFromLiteLLM(raw: Record<string, unknown>): PricingTable {
  const out = { ...FALLBACK_PRICING };
  for (const key of PRICING_ALLOWLIST) {
    const entry = raw[key];
    if (!entry || typeof entry !== "object") continue;
    const parsed = RawEntrySchema.safeParse(entry);
    if (!parsed.success) continue;
    const normalized = normalizeEntry(parsed.data);
    if (normalized) out[key] = normalized;
  }
  return out;
}

let _memo: PricingTable | null = null;
let _memoUntilMs = 0;

async function loadCacheFile(): Promise<PricingTable | null> {
  try {
    const raw = await readFile(CACHE_PATH, "utf8");
    const parsed = CacheFileSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const result = { ...FALLBACK_PRICING };
    for (const key of PRICING_ALLOWLIST) {
      const entry = parsed.data.entries[key];
      if (entry) result[key] = entry;
    }
    return result;
  } catch {
    return null;
  }
}

async function cacheAgeHours(): Promise<number | null> {
  try {
    const s = await stat(CACHE_PATH);
    return (Date.now() - s.mtimeMs) / (1000 * 60 * 60);
  } catch {
    return null;
  }
}

export async function refreshPricingCache(): Promise<PricingTable> {
  let raw: Record<string, unknown>;
  try {
    const res = await fetch(LITELLM_URL, { cache: "no-store" });
    if (!res.ok) {
      console.warn(`[faro] pricing: fetch returned ${res.status}; using fallback`);
      return FALLBACK_PRICING;
    }
    raw = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.warn(
      `[faro] pricing: fetch failed: ${err instanceof Error ? err.message : "unknown"}; using fallback`,
    );
    return FALLBACK_PRICING;
  }
  const table = buildTableFromLiteLLM(raw);
  try {
    await mkdir(dirname(CACHE_PATH), { recursive: true });
    const payload = {
      fetched_at: new Date().toISOString(),
      source: LITELLM_URL,
      entries: table,
    };
    await writeFile(CACHE_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } catch (err) {
    console.warn(
      `[faro] pricing: cache write failed: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }
  return table;
}

export async function getPricing(): Promise<PricingTable> {
  if (_memo && Date.now() < _memoUntilMs) return _memo;
  const ttlHours = env.FARO_PRICING_REFRESH_HOURS;
  const age = await cacheAgeHours();
  let table: PricingTable;
  if (age !== null && age < ttlHours) {
    table = (await loadCacheFile()) ?? FALLBACK_PRICING;
  } else {
    table = await refreshPricingCache();
  }
  _memo = table;
  _memoUntilMs = Date.now() + Math.min(ttlHours, 1) * 60 * 60 * 1000;
  return table;
}
