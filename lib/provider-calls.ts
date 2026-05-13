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
