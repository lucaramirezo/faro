import { test } from "@playwright/test";

/**
 * Nav e2e (DESIGN.md §6.1 sidebar auto-collapse + §15 nav decisions).
 *
 * Deferred — requires `bunx playwright install chromium` and DOM
 * assertions on `data-state` / `aria-expanded` of the sidebar trigger
 * after navigating to /studio/*. Stub here so the file exists in the
 * suite and CI can add the install step at the time it ships.
 *
 * Acceptance criteria when implemented:
 *   - Visit /home → sidebar default-expanded (sidebar-07 cookie + B1 behavior)
 *   - Click navigate to /studio → sidebar auto-collapses to 48px icons
 *   - User clicks the sidebar trigger to expand → state persists for
 *     session-storage key `faro:studio:sidebar-manual-expand`
 *   - Navigate back to /home and forward to /studio → manual expand
 *     respected for the rest of the session
 *   - Reload after closing tab → flag cleared, default auto-collapse
 *     resumes on /studio entry
 */

test.skip("sidebar auto-collapses on /studio/* and respects manual expand", () => {
  // Implementation deferred — see header for acceptance criteria.
});
