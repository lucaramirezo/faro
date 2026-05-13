"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setClaimPromoteTo } from "@/lib/claims";

const PromoteSchema = z.object({
  runId: z.string().min(1),
  claimId: z.string().min(1),
  promoteTo: z.enum(["skill", "wiki"]).nullable(),
});

export async function setPromoteToAction(
  runId: string,
  claimId: string,
  promoteTo: "skill" | "wiki" | null,
): Promise<void> {
  const parsed = PromoteSchema.safeParse({ runId, claimId, promoteTo });
  if (!parsed.success) {
    throw new Error(`setPromoteToAction: invalid args: ${parsed.error.message}`);
  }
  setClaimPromoteTo({
    runId: parsed.data.runId,
    claimId: parsed.data.claimId,
    promoteTo: parsed.data.promoteTo,
  });
  revalidatePath(`/dreams/${parsed.data.runId}`);
  revalidatePath("/recommender");
}
