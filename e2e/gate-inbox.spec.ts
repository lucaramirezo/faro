import { expect, test } from "@playwright/test";

/**
 * P3 HIL gate unification e2e.
 *
 * Three layers (mirrors e2e/studio-dockview.spec.ts conventions):
 *  1. HTTP contract (`request` fixture, no browser, no seed): /api/gates is
 *     wired, returns 200 + JSON `{ gates: [] }`, and the projection never
 *     500s on the real/empty DB (the pipeline_runs-missing guard).
 *  2. Browser (chromium, no seed): the Gate Inbox mounts as a sticky,
 *     non-closable panel in the studio (Task 7 + ensureGateInbox + gateTab).
 *  3. Seeded render (env-gated, plan addendum D "lightweight seed"): with a
 *     seeded run gate + pending dream (e2e/seed-gate-inbox.ts), the Inbox
 *     lists the inline GatePrompt and the dream deep-link. Skipped otherwise
 *     → a documented manual-L4 check (the plan's sanctioned degradation; same
 *     env-gated-skip convention as studio-dockview/dreams-regression). The
 *     "approve actually resumes the SDK" path is manual-L4 (no live SDK in
 *     e2e — plan-sanctioned).
 *
 * Needs a running server (no webServer block in playwright.config.ts) — the
 * ACTUAL convention is the PROD standalone server (NOT `next dev`):
 *   bun run build && (bun run start &) && sleep 4 \
 *     && bun run test:e2e -- gate-inbox
 */

test.describe("P3 /api/gates HTTP contract", () => {
  test("GET /api/gates → 200 + JSON { gates: [...] }", async ({ request }) => {
    const res = await request.get("/api/gates");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/json");
    const body = (await res.json()) as { gates?: unknown };
    expect(Array.isArray(body.gates)).toBe(true);
  });
});

test.describe("P3 Gate Inbox panel (chromium, no seed)", () => {
  test("mounts as a sticky non-closable panel in the studio", async ({ page }) => {
    await page.goto("/studio");
    await expect(page.locator(".dv-dockview")).toBeVisible({ timeout: 15_000 });

    const tabs = page.locator(".dv-default-tab");
    const gateTab = tabs.filter({ hasText: "Gate Inbox" });
    await expect(gateTab).toHaveCount(1);
    // Sticky like Home: hideClose → its tab carries NO close action, unlike
    // the freely-closable Gallery tab.
    await expect(gateTab.locator(".dv-default-tab-action")).toHaveCount(0);
    await expect(tabs.filter({ hasText: "Gallery" }).locator(".dv-default-tab-action")).toHaveCount(
      1,
    );
  });
});

const RUN = process.env.FARO_E2E_GATE_RUN_ID;
const DREAM = process.env.FARO_E2E_GATE_DREAM_ID;
const seeded = RUN && DREAM ? test : test.skip;

test.describe("P3 Gate Inbox seeded render (env-gated → else manual L4)", () => {
  seeded("lists the inline run gate + the navigational dream deep-link", async ({ page }) => {
    if (!RUN || !DREAM) return; // narrows for TS; `seeded` already gated this

    await page.goto("/studio");
    await expect(page.locator(".dv-dockview")).toBeVisible({ timeout: 15_000 });

    // Activate the Gate Inbox tab (renderer:'always' keeps it mounted, but an
    // inactive Dockview panel is display:none — the operator clicks it).
    await page.locator(".dv-default-tab").filter({ hasText: "Gate Inbox" }).click();

    // Run gate → the reused GatePrompt renders an inline Approve (the seeded
    // gate is an `approval` for a Write).
    await expect(page.getByRole("button", { name: /approve/i }).first()).toBeVisible();

    // Claim gate → a navigational deep-link card; clicking it routes to the
    // UNCHANGED sharded review /dreams/<runId> (it does NOT stamp claims).
    const openReview = page.getByRole("button", { name: /open review/i }).first();
    await expect(openReview).toBeVisible();
    await openReview.click();
    await page.waitForURL(new RegExp(`/dreams/${DREAM}`));
    expect(page.url()).toContain(`/dreams/${DREAM}`);
  });
});
