"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type GenerateWikiImageResult, generateWikiImage } from "@/lib/image-gen";

const GenerateImageSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9._-]*$/i, "slug must be kebab-case"),
  prompt: z.string().min(4, "prompt must be at least 4 characters"),
  aspectRatio: z.enum(["1:1", "3:4", "4:3", "9:16", "16:9"]).optional(),
  quality: z.enum(["medium", "high", "standard"]).optional(),
});

/**
 * Server Action invoked by the studio's IllustrateButton modal (Phase 4.5 D5).
 * Wraps `generateWikiImage` so the client doesn't need to round-trip through
 * the JSON `/api/image/generate` route. Triggers a `/studio` revalidation so
 * the gallery picks up the new artifact without a full reload.
 */
export async function generateImageForPageAction(
  formData: FormData,
): Promise<GenerateWikiImageResult> {
  const parsed = GenerateImageSchema.safeParse({
    slug: formData.get("slug"),
    prompt: formData.get("prompt"),
    aspectRatio: formData.get("aspectRatio") || undefined,
    quality: formData.get("quality") || undefined,
  });
  if (!parsed.success) {
    throw new Error(`generateImageForPageAction: ${parsed.error.message}`);
  }
  const result = await generateWikiImage(parsed.data);
  revalidatePath("/studio");
  return result;
}
