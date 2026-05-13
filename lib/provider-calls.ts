import "server-only";

import { getDb } from "@/lib/db";
import { getProfile } from "@/lib/profiles";

/**
 * provider_calls ledger — every billable AI call (Sonnet rerun via agent-sdk,
 * Imagen / gpt-image-1 via image-gen) writes one row. Chat through Max-sub
 * OAuth is NOT recorded — the subscription absorbs the cost and including
 * those rows would inflate the /cost dashboard.
 *
 * Schema is created by scripts/migrate.ts; columns mirror LiteLLM's per-call
 * shape but with an open-ended `meta` JSON column (Phase 4.5 decision #4)
 * so call sites can stash whatever's useful (prompt hash, finish reason,
 * aspect ratio, etc.) without a code change for v1. Phase 5 may tighten.
 *
 * Phase 4.5 B4 ships only `recordCall`; C5 backfills the analytics helpers
 * (`getCostsByProvider`, `getRecentCalls`) and the /cost KPI card.
 */

export interface RecordCallInput {
  /** Logical feature key — `"dreams_rerun"`, `"chat"`, `"wiki_image"`, … */
  feature: string;
  /** Provider canonical id — `"anthropic"`, `"google"`, `"openai"`. */
  provider: string;
  /** Model id as billed — e.g. `"claude-sonnet-4-6"`. */
  model: string;
  /** Per-call cost in USD (0 for Max-sub absorbed calls). */
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  images?: number;
  durationMs?: number;
  runId?: string | null;
  /** Arbitrary JSON-serializable extras (open-ended for v1). */
  meta?: Record<string, unknown>;
}

export interface ProviderCallRow {
  id: number;
  ts: string;
  profile: string;
  feature: string;
  provider: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  images: number | null;
  cost_usd: number;
  duration_ms: number | null;
  run_id: string | null;
  meta: string | null;
}

/**
 * Sum cost_usd by provider for the active profile, restricted to rows newer
 * than `sinceISO`. Used by the /cost page's "Token-API spend (Nd)" KPI.
 */
export function getCostsByProvider({ sinceISO }: { sinceISO: string }): Record<string, number> {
  const profile = getProfile();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT provider, SUM(cost_usd) AS total
         FROM provider_calls
        WHERE profile = ? AND ts >= ?
        GROUP BY provider`,
    )
    .all(profile.profile, sinceISO) as Array<{ provider: string; total: number }>;
  const out: Record<string, number> = {};
  for (const r of rows) out[r.provider] = r.total ?? 0;
  return out;
}

/**
 * Most-recent N calls, newest first. Used for the /cost recent-activity view
 * and ad-hoc debugging in dev.
 */
export function getRecentCalls({ limit = 50 }: { limit?: number } = {}): ProviderCallRow[] {
  const profile = getProfile();
  const db = getDb();
  return db
    .prepare(
      `SELECT id, ts, profile, feature, provider, model,
              input_tokens, output_tokens, cached_input_tokens, images,
              cost_usd, duration_ms, run_id, meta
         FROM provider_calls
        WHERE profile = ?
        ORDER BY id DESC
        LIMIT ?`,
    )
    .all(profile.profile, limit) as ProviderCallRow[];
}

export function recordCall(input: RecordCallInput): void {
  const profile = getProfile();
  const db = getDb();
  db.prepare(
    `INSERT INTO provider_calls (
       ts, profile, feature, provider, model,
       input_tokens, output_tokens, cached_input_tokens, images,
       cost_usd, duration_ms, run_id, meta
     ) VALUES (
       ?, ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?, ?
     )`,
  ).run(
    new Date().toISOString(),
    profile.profile,
    input.feature,
    input.provider,
    input.model,
    input.inputTokens ?? null,
    input.outputTokens ?? null,
    input.cachedInputTokens ?? null,
    input.images ?? null,
    input.costUsd,
    input.durationMs ?? null,
    input.runId ?? null,
    input.meta ? JSON.stringify(input.meta) : null,
  );
}
