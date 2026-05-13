"use server";

import { renderDiffHTML } from "@/lib/shiki-diff";

/**
 * Server Action wrapper for the server-only shiki-diff renderer.
 *
 * The Phase 4.5 TweakEditor needs the diff HTML for inline display before
 * commit. shiki-diff imports the Shiki bundle which is fundamentally a
 * server module; rendering on the server and shipping HTML keeps the
 * client island lean and avoids leaking the highlighter into the client
 * bundle.
 */
export async function renderDiffAction(before: string, after: string): Promise<string> {
  if (typeof before !== "string" || typeof after !== "string") {
    throw new Error("renderDiffAction: before/after must be strings");
  }
  if (before.length > 64 * 1024 || after.length > 64 * 1024) {
    throw new Error("renderDiffAction: inputs are larger than 64KB — refuse to render");
  }
  return renderDiffHTML(before, after);
}
