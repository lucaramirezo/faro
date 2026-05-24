import "server-only";
import { normalizeArtifactBytes } from "./normalize";

/**
 * Per-source policy for artifact write guards.
 *
 *   sniper-edit  → minRetainedRatio = 0.2 (reject if new < 20% of prior)
 *   generation   → off  (P1 runs legitimately replace stubs with full pages)
 *
 * See `wiki/decisions/2026-05-20-faro-p4-locked.md` Q4. The 4.6 carryover
 * plan's documented threshold of ">50% regression" was wrong for sniper writes;
 * this implementation follows the locked Q4 value.
 */
export type WriteSource = "sniper-edit" | "generation";

const SNIPER_MIN_RETAINED_RATIO = 0.2;

export class StubWriteError extends Error {
  readonly label: string;
  readonly newBytes: number;
  readonly priorBytes: number;
  readonly ratio: number;

  constructor(label: string, newBytes: number, priorBytes: number, ratio: number) {
    super(
      `Refused write of "${label}": ${newBytes}B is ${(ratio * 100).toFixed(0)}% of prior ${priorBytes}B (below 20% threshold).`,
    );
    this.name = "StubWriteError";
    this.label = label;
    this.newBytes = newBytes;
    this.priorBytes = priorBytes;
    this.ratio = ratio;
  }
}

/**
 * Throws `StubWriteError` when a sniper-edit write would shrink the artifact
 * below the locked threshold. Generation writes are not guarded.
 *
 * `linkedAssetSizes` is an optional map of linked-asset path → byte count so
 * that an inline→`<link>` refactor doesn't trip the threshold.
 */
export function assertNotStub(
  newHtml: string,
  priorHtml: string | null,
  source: WriteSource,
  label: string,
  linkedAssetSizes: Record<string, number> = {},
): void {
  if (source === "generation") return; // off by policy
  if (!priorHtml) return; // first write — nothing to compare against
  const newSize = normalizeArtifactBytes(newHtml, linkedAssetSizes);
  const priorSize = normalizeArtifactBytes(priorHtml, linkedAssetSizes);
  if (priorSize === 0) return; // can't form a ratio
  const ratio = newSize / priorSize;
  if (ratio < SNIPER_MIN_RETAINED_RATIO) {
    throw new StubWriteError(label, newSize, priorSize, ratio);
  }
}
