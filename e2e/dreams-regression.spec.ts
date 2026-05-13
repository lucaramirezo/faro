import { test } from "@playwright/test";

/**
 * Dreams regression — guards the carousel hot-fix shipped 2026-05-13
 * (PRD §14 decision #18) + the Slack-approval flow surfacing.
 *
 * Deferred — requires `bunx playwright install chromium` + a seeded
 * dream draft in drafts/dreams/<date>/. Stub here documents the contract
 * the suite needs to enforce, including the *non-regressions* called out
 * in the prime-args hard rules:
 *
 *   - Embla `axis: 'y'` on components/dreams/EmblaCarousel.tsx
 *   - `canScrollPrev` / `canScrollNext` wiring on the up/down buttons
 *   - `h-[360px] shrink-0` (NOT `min-h-[360px]` — that breaks y-axis
 *     snap-stride per #18)
 *   - reInit listener fires when content changes
 *
 * Acceptance criteria when implemented:
 *   1. Seed a dream draft at drafts/dreams/<today>/
 *   2. Navigate to /dreams/<runId>
 *   3. Assert the carousel renders 3+ visible cards stacked vertically
 *   4. Assert the up-button is disabled at top (canScrollPrev = false)
 *   5. Click down-button → first card scrolls out of view
 *   6. Assert the up-button is now enabled
 *   7. Navigate to /studio → confirm the dream-report.html artifact row
 *      surfaces in the gallery (scanArtifacts + getArtifacts contract)
 *   8. Confirm the Slack approval Block Kit message contract is not
 *      regressed (snapshot of slack_agent/approval.py payload schema)
 */

test.skip("dreams carousel + approval flow regression", () => {
  // Implementation deferred — see header for acceptance criteria.
});
