"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { rerunClaim } from "@/lib/agent-sdk";
import {
  bulkSetClaimStatusForCategory,
  CLAIM_CATEGORIES,
  getClaim,
  setClaimStatus,
} from "@/lib/claims";
import { finalizeDream } from "@/lib/dreams";
import { recordCall } from "@/lib/provider-calls";
import {
  applyTweakPatch,
  encodeEnvelope,
  TweakPatchEnvelopeSchema,
  TweakPatchSchema,
} from "@/lib/tweak-patches";

async function readDecidedBy(): Promise<string> {
  const h = await headers();
  const login = h.get("x-faro-login");
  if (!login) {
    throw new Error("x-faro-login header missing — auth proxy did not set it");
  }
  return login;
}

const DecideSchema = z.object({
  runId: z.string().min(1),
  claimId: z.string().min(1),
  verb: z.enum(["approved", "denied"]),
});

export async function decideClaimAction(formData: FormData): Promise<void> {
  const parsed = DecideSchema.safeParse({
    runId: formData.get("runId"),
    claimId: formData.get("claimId"),
    verb: formData.get("verb"),
  });
  if (!parsed.success) {
    throw new Error(`decideClaimAction: invalid form: ${parsed.error.message}`);
  }
  const decidedBy = await readDecidedBy();
  setClaimStatus({
    runId: parsed.data.runId,
    claimId: parsed.data.claimId,
    status: parsed.data.verb,
    decidedBy,
  });
  revalidatePath(`/dreams/${parsed.data.runId}`);
}

const RerunSchema = z.object({
  runId: z.string().min(1),
  claimId: z.string().min(1),
  instruction: z.string().min(1, "instruction must not be empty"),
});

export interface RerunClaimActionResult {
  proposed: string;
  costUsd: number;
  durationMs: number;
}

/**
 * Sonnet rerun of a single claim via the Claude Agent SDK. Does NOT mutate
 * the DB — callers must round-trip the proposed text through `acceptTweakAction`
 * to persist (diff-before-commit; see B5).
 */
export async function rerunClaimAction(formData: FormData): Promise<RerunClaimActionResult> {
  const parsed = RerunSchema.safeParse({
    runId: formData.get("runId"),
    claimId: formData.get("claimId"),
    instruction: formData.get("instruction"),
  });
  if (!parsed.success) {
    throw new Error(`rerunClaimAction: invalid form: ${parsed.error.message}`);
  }
  await readDecidedBy(); // auth check; result not used since DB stays untouched
  const claim = getClaim(parsed.data.runId, parsed.data.claimId);
  if (!claim) {
    throw new Error(`rerunClaimAction: claim ${parsed.data.claimId} not found`);
  }
  const result = await rerunClaim({
    original: claim.claim_text,
    instruction: parsed.data.instruction,
  });
  recordCall({
    feature: "dreams_rerun",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    costUsd: result.costUsd,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    durationMs: result.durationMs,
    runId: parsed.data.runId,
    meta: { claim_id: parsed.data.claimId, instruction: parsed.data.instruction },
  });
  return {
    proposed: result.proposed,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
  };
}

const AcceptTweakSchema = z.object({
  runId: z.string().min(1),
  claimId: z.string().min(1),
  /** JSON-encoded patch (raw discriminated union, not enveloped). */
  patchJson: z.string().min(1),
});

/**
 * Apply a TweakPatch to a claim — pure transform via `applyTweakPatch`, then
 * persist through the single setClaimStatus write path. Stores the canonical
 * envelope JSON (`{schema_version, patch}`) on `claim_decisions.tweak_patch`
 * for audit-trail recovery.
 */
export async function acceptTweakAction(formData: FormData): Promise<void> {
  const parsed = AcceptTweakSchema.safeParse({
    runId: formData.get("runId"),
    claimId: formData.get("claimId"),
    patchJson: formData.get("patchJson"),
  });
  if (!parsed.success) {
    throw new Error(`acceptTweakAction: invalid form: ${parsed.error.message}`);
  }
  const decidedBy = await readDecidedBy();
  const claim = getClaim(parsed.data.runId, parsed.data.claimId);
  if (!claim) {
    throw new Error(`acceptTweakAction: claim ${parsed.data.claimId} not found`);
  }
  // Accept either an enveloped JSON ({schema_version, patch}) or a bare patch
  // — the UI may post either shape; we re-canonicalize before persisting.
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(parsed.data.patchJson);
  } catch (err) {
    throw new Error(
      `acceptTweakAction: patchJson is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  const envelopeParse = TweakPatchEnvelopeSchema.safeParse(rawJson);
  const patch = envelopeParse.success ? envelopeParse.data.patch : TweakPatchSchema.parse(rawJson);
  const applied = applyTweakPatch(claim, patch);
  const canonicalEnvelope = encodeEnvelope(patch);
  setClaimStatus({
    runId: parsed.data.runId,
    claimId: parsed.data.claimId,
    status: "tweaked",
    decidedBy,
    tweakText: applied.claim.claim_text,
    reviewerNote: applied.claim.reviewer_note,
    tweakPatchJson: canonicalEnvelope,
    parentClaimId: applied.claim.parent_claim_id,
  });
  revalidatePath(`/dreams/${parsed.data.runId}`);
}

const TweakSchema = z.object({
  runId: z.string().min(1),
  claimId: z.string().min(1),
  tweakText: z.string().min(1, "tweak text must not be empty"),
});

export async function tweakClaimAction(formData: FormData): Promise<void> {
  const parsed = TweakSchema.safeParse({
    runId: formData.get("runId"),
    claimId: formData.get("claimId"),
    tweakText: formData.get("tweakText"),
  });
  if (!parsed.success) {
    throw new Error(`tweakClaimAction: invalid form: ${parsed.error.message}`);
  }
  const decidedBy = await readDecidedBy();
  setClaimStatus({
    runId: parsed.data.runId,
    claimId: parsed.data.claimId,
    status: "tweaked",
    decidedBy,
    tweakText: parsed.data.tweakText,
  });
  revalidatePath(`/dreams/${parsed.data.runId}`);
}

const BulkSchema = z.object({
  runId: z.string().min(1),
  category: z.enum(CLAIM_CATEGORIES),
  verb: z.enum(["approved", "denied"]).default("approved"),
});

export async function bulkApproveCategoryAction(formData: FormData): Promise<number> {
  const parsed = BulkSchema.safeParse({
    runId: formData.get("runId"),
    category: formData.get("category"),
    verb: formData.get("verb") ?? "approved",
  });
  if (!parsed.success) {
    throw new Error(`bulkApproveCategoryAction: invalid form: ${parsed.error.message}`);
  }
  const decidedBy = await readDecidedBy();
  const count = bulkSetClaimStatusForCategory({
    runId: parsed.data.runId,
    category: parsed.data.category,
    status: parsed.data.verb,
    decidedBy,
  });
  revalidatePath(`/dreams/${parsed.data.runId}`);
  return count;
}

const RevertSchema = z.object({
  runId: z.string().min(1),
  category: z.enum(CLAIM_CATEGORIES),
});

export async function revertClaimsByCategoryAction(formData: FormData): Promise<number> {
  const parsed = RevertSchema.safeParse({
    runId: formData.get("runId"),
    category: formData.get("category"),
  });
  if (!parsed.success) {
    throw new Error(`revertClaimsByCategoryAction: invalid form: ${parsed.error.message}`);
  }
  const decidedBy = await readDecidedBy();
  const count = bulkSetClaimStatusForCategory({
    runId: parsed.data.runId,
    category: parsed.data.category,
    status: "pending",
    fromStatus: "approved",
    decidedBy,
  });
  revalidatePath(`/dreams/${parsed.data.runId}`);
  return count;
}

const FinalizeSchema = z.object({
  runId: z.string().min(1),
  decisionToken: z.string().min(1),
});

export async function finalizeDreamAction(formData: FormData): Promise<void> {
  const parsed = FinalizeSchema.safeParse({
    runId: formData.get("runId"),
    decisionToken: formData.get("decisionToken"),
  });
  if (!parsed.success) {
    throw new Error(`finalizeDreamAction: invalid form: ${parsed.error.message}`);
  }
  const decidedBy = await readDecidedBy();
  await finalizeDream({
    runId: parsed.data.runId,
    decisionToken: parsed.data.decisionToken,
    decidedBy,
  });
  revalidatePath("/dreams");
  redirect("/dreams");
}
