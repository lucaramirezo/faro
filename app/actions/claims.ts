"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { bulkSetClaimStatusForCategory, CLAIM_CATEGORIES, setClaimStatus } from "@/lib/claims";
import { finalizeDream } from "@/lib/dreams";

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
