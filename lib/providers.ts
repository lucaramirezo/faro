import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { requireGeminiKey, requireOpenAIKey } from "@/lib/env";
import { getProfile, type ModelSpec } from "@/lib/profiles";

/**
 * Per-feature provider/model lookup (Phase 4.5 D2).
 *
 * Reads `models.<feature>` from the active profile YAML and returns a
 * configured AI SDK image model. The AI SDK reads provider keys from env
 * (`GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`) lazily — we set them
 * via the explicit `apiKey` factory so the lib/env.ts resolver order is
 * honored (env → `FILE` → `$CREDENTIALS_DIRECTORY/<provider>`).
 *
 * Phase 4.5 supports `google` and `openai`. The Zod schema in
 * `lib/profiles.ts:ModelSpecSchema` enforces this set; expanding it (e.g.
 * for Together AI) is a single Zod enum bump + a new branch here.
 */

function getModelSpec(feature: string): ModelSpec {
  const profile = getProfile();
  const spec = profile.models?.[feature];
  if (!spec) {
    throw new Error(
      `No model configured for feature "${feature}". ` +
        `Add a \`models.${feature}\` block to profiles/${profile.profile}.yml.`,
    );
  }
  return spec;
}

/**
 * Return an AI SDK image model client configured for the given feature.
 * The AI SDK's `experimental_generateImage` accepts the returned value as
 * its `model` parameter.
 */
export function getImageProvider(feature: string) {
  const spec = getModelSpec(feature);
  if (spec.provider === "google") {
    const google = createGoogleGenerativeAI({ apiKey: requireGeminiKey() });
    return { spec, model: google.image(spec.model) };
  }
  if (spec.provider === "openai") {
    const openai = createOpenAI({ apiKey: requireOpenAIKey() });
    return { spec, model: openai.image(spec.model) };
  }
  throw new Error(`Unknown provider "${(spec as ModelSpec).provider}" for feature "${feature}"`);
}

/**
 * Convenience: expose the raw model spec without instantiating the SDK
 * client. Useful for cost lookups and UI hints that don't need to call the
 * model.
 */
export function peekModelSpec(feature: string): ModelSpec {
  return getModelSpec(feature);
}
