import "server-only";

/**
 * Strips whitespace runs + HTML comments and adds linked-asset bytes from a
 * caller-provided lookup table. The result is used by `assertNotStub` so that
 * an inline→<link> CSS refactor doesn't trip the stub-guard threshold.
 *
 * `linkedAssetSizes` is keyed by the resolved relative path or `<link>` href.
 * Callers stat each asset and pass the byte counts; we only sum the values
 * found. Missing keys are silently skipped (no asset == no contribution).
 *
 * See `wiki/decisions/2026-05-20-faro-p4-locked.md` Q4 for the normalization
 * rationale.
 */
export function normalizeArtifactBytes(
  html: string,
  linkedAssetSizes: Record<string, number> = {},
): number {
  // 1. Strip HTML comments first — they may contain whitespace we don't want
  //    counted but we also don't want their content to leak into byte size.
  const stripped = html.replace(/<!--[\s\S]*?-->/g, "");
  // 2. Collapse whitespace runs to a single space, then trim.
  const collapsed = stripped.replace(/\s+/g, " ").trim();
  const htmlBytes = Buffer.byteLength(collapsed, "utf8");
  // 3. Sum linked-asset sizes.
  let assetBytes = 0;
  for (const size of Object.values(linkedAssetSizes)) {
    if (typeof size === "number" && size > 0) assetBytes += size;
  }
  return htmlBytes + assetBytes;
}
