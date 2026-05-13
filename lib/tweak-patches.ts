/**
 * Discriminated `TweakPatch` union — the audit-trail shape for a single
 * change applied to a claim. Stored as JSON in `claim_decisions.tweak_patch`
 * (Phase 4.5 B4 migration). The envelope adds `schema_version: 1` so future
 * variants can land without breaking historic rows.
 *
 * `applyTweakPatch` is pure: it returns a new ClaimRow + a one-line history
 * description, with NO DB writes. Persistence happens in the Server Action
 * that wraps it (`app/actions/claims.ts:acceptTweakAction`).
 *
 * The `set-rubric-score` variant has no dedicated column on
 * `claim_decisions` yet (rubrics aren't a wired flow). To preserve the
 * audit-trail intent without scope-creeping a schema change, the score is
 * round-tripped on `reviewer_note` as `[rubric:N/10] ...`. When a real
 * rubric_score column lands (Phase 5), the apply function flips to writing
 * the column directly without changing the patch shape.
 */
import { z } from "zod";
import type { ClaimRow } from "@/lib/claims-types";

export const TWEAK_PATCH_SCHEMA_VERSION = 1 as const;

const ClaimStatusZ = z.enum(["pending", "approved", "denied", "tweaked", "deferred"]);

export const TweakPatchSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("set-text"), text: z.string().min(1) }),
  z.object({
    kind: z.literal("set-rubric-score"),
    score: z.number().int().min(0).max(10),
  }),
  z.object({ kind: z.literal("set-status"), status: ClaimStatusZ }),
  z.object({ kind: z.literal("merge-with"), otherClaimId: z.string().min(1) }),
]);

export type TweakPatch = z.infer<typeof TweakPatchSchema>;

export interface TweakPatchEnvelope {
  schema_version: typeof TWEAK_PATCH_SCHEMA_VERSION;
  patch: TweakPatch;
}

export const TweakPatchEnvelopeSchema = z.object({
  schema_version: z.literal(TWEAK_PATCH_SCHEMA_VERSION),
  patch: TweakPatchSchema,
});

export interface ApplyResult {
  claim: ClaimRow;
  description: string;
}

/**
 * Apply a patch to a claim. Pure — returns a new ClaimRow; no DB side-effects.
 * Throws via Zod if the patch shape is invalid.
 */
export function applyTweakPatch(claim: ClaimRow, patch: TweakPatch): ApplyResult {
  const validated = TweakPatchSchema.parse(patch);
  switch (validated.kind) {
    case "set-text":
      return {
        claim: { ...claim, claim_text: validated.text },
        description: `Set claim text (${validated.text.length} chars)`,
      };
    case "set-status":
      return {
        claim: { ...claim, status: validated.status },
        description: `Status: ${claim.status} → ${validated.status}`,
      };
    case "merge-with":
      return {
        claim: {
          ...claim,
          status: "tweaked",
          parent_claim_id: validated.otherClaimId,
        },
        description: `Marked for merge into ${validated.otherClaimId}`,
      };
    case "set-rubric-score": {
      const prefix = `[rubric:${validated.score}/10]`;
      const note = claim.reviewer_note ? `${prefix} ${claim.reviewer_note}` : prefix;
      return {
        claim: { ...claim, reviewer_note: note },
        description: `Rubric score: ${validated.score}/10 (stored on reviewer_note pending schema)`,
      };
    }
  }
}

export function encodeEnvelope(patch: TweakPatch): string {
  const env: TweakPatchEnvelope = {
    schema_version: TWEAK_PATCH_SCHEMA_VERSION,
    patch,
  };
  return JSON.stringify(env);
}

export function decodeEnvelope(raw: string): TweakPatchEnvelope {
  return TweakPatchEnvelopeSchema.parse(JSON.parse(raw));
}
