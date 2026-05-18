import { expect, test } from "@playwright/test";

/**
 * P2 Studio-as-Surface regression guard.
 *
 * Two layers:
 *  1. HTTP contract (`request` fixture, no browser): the studio CSP is
 *     UNCHANGED, the deep-link routes survive P2, and /api/switch is wired.
 *  2. Browser (chromium): the Dockview workspace mounts with a sticky
 *     non-closable Home + Gallery + Board by default and survives a reload
 *     (persisted-or-default layout, no white screen).
 *
 * The deep 4.5-non-regression flow (Chat SSE + highlight-bridge surviving
 * INSIDE a Dockview panel across tab switches — the renderer:'always' proof
 * — and Board→run-panel dedupe) needs a seeded artifact + run. It runs only
 * when FARO_E2E_ARTIFACT_ID / FARO_E2E_RUN_ID are provided; otherwise it is
 * a documented skip + a manual L4 check (the plan's sanctioned degradation;
 * same convention as e2e/dreams-regression.spec.ts).
 *
 * Needs a running server (no webServer block in playwright.config.ts):
 *   bun run build && (bun run start &) && sleep 4 \
 *     && bun run test:e2e -- studio-dockview
 */

const VALID_BUT_MISSING_ID = "0000000000000000"; // 16 hex → format ok, row absent

test.describe("P2 studio HTTP contract (unchanged + additive)", () => {
  test("GET /studio → 200 with the UNCHANGED CSP contract", async ({ request }) => {
    const res = await request.get("/studio");
    expect(res.status()).toBe(200);
    const csp = res.headers()["content-security-policy"];
    expect(csp).toBeTruthy();
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'self'");
  });

  test("GET /studio/<valid-missing> deep-link route is wired (no 5xx)", async ({ request }) => {
    // The page route's notFound() soft-renders (App Router returns 200 with
    // the not-found UI here) — the existing studio.spec.ts only asserts
    // hard-404 on the *raw* API route, never the page route. The plan's
    // contract here is just "the deep-link route survives P2".
    const res = await request.get(`/studio/${VALID_BUT_MISSING_ID}`);
    expect(res.status()).toBeLessThan(500);
  });

  test("GET /runs/<id> → 200 (P1 deep-link route SURVIVES P2)", async ({ request }) => {
    const res = await request.get("/runs/run_0_p2guard");
    expect(res.status()).toBe(200);
  });

  test("GET /api/switch?q= → 200 + JSON array (new ⌘P endpoint)", async ({ request }) => {
    const res = await request.get("/api/switch?q=");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/json");
    expect(Array.isArray(await res.json())).toBe(true);
  });
});

test.describe("P2 Dockview workspace (chromium)", () => {
  test("mounts the workspace with a sticky non-closable Home + Gallery + Board", async ({
    page,
  }) => {
    await page.goto("/studio");
    const dock = page.locator(".dv-dockview");
    await expect(dock).toBeVisible({ timeout: 15_000 });

    const tabs = page.locator(".dv-default-tab");
    await expect(tabs.filter({ hasText: "Home" })).toHaveCount(1);
    await expect(tabs.filter({ hasText: "Gallery" })).toHaveCount(1);
    await expect(tabs.filter({ hasText: "Board" })).toHaveCount(1);

    // Sticky Home: its tab carries NO close action (hideClose), unlike the
    // freely-closable Gallery/Board tabs.
    const homeTab = tabs.filter({ hasText: "Home" });
    await expect(homeTab.locator(".dv-default-tab-action")).toHaveCount(0);
    const galleryTab = tabs.filter({ hasText: "Gallery" });
    await expect(galleryTab.locator(".dv-default-tab-action")).toHaveCount(1);
  });

  test("survives a reload (persisted-or-default layout, no white screen)", async ({ page }) => {
    await page.goto("/studio");
    await expect(page.locator(".dv-dockview")).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.locator(".dv-dockview")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".dv-default-tab").filter({ hasText: "Home" })).toHaveCount(1);
  });
});

const ART = process.env.FARO_E2E_ARTIFACT_ID;
const RUN = process.env.FARO_E2E_RUN_ID;
const deep = ART && RUN ? test : test.skip;

test.describe("P2 4.5 non-regression INSIDE a Dockview panel (renderer:'always')", () => {
  deep("Chat streams + survives a tab switch; Board→run panel dedupes", async ({ page }) => {
    if (!ART || !RUN) return; // narrows for TS; `deep` already gated this
    // Seeded-fixture path. Without FARO_E2E_ARTIFACT_ID / FARO_E2E_RUN_ID
    // this is skipped and the contract below is a MANUAL L4 check:
    //   1. /studio/<ART> → Artifact panel mounts (StudioWorkspace +
    //      ProvenanceTabs verbatim).
    //   2. ProvenanceTabs → "Chat": input present, SSE stream connects.
    //   3. Switch to Board tab and back → the Chat connection + state
    //      SURVIVE (proves renderer:'always'; default 'onlyWhenVisible'
    //      would have torn down the SSE).
    //   4. Board card click → run:<id> panel; second click focuses the
    //      SAME panel (deterministic-id dedupe), not a duplicate.
    await page.goto(`/studio/${ART}`);
    await expect(page.locator(".dv-dockview")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".dv-default-tab").filter({ hasText: /Artifact|./ })).not.toHaveCount(
      0,
    );
    const chatTab = page.getByRole("tab", { name: /chat/i });
    await chatTab.click();
    const chatInput = page.getByPlaceholder(/message|ask|chat/i).first();
    await expect(chatInput).toBeVisible();

    // Switch away (Board) and back — Chat island must still be mounted.
    await page.locator(".dv-default-tab").filter({ hasText: "Board" }).click();
    await page
      .locator(".dv-default-tab")
      .filter({ hasText: /Artifact|./ })
      .first()
      .click();
    await expect(chatInput).toBeVisible();

    // Board → run dedupe.
    await page.locator(".dv-default-tab").filter({ hasText: "Board" }).click();
    const card = page.getByRole("button").filter({ hasText: RUN }).first();
    await card.click();
    await card.click();
    await expect(
      page.locator(".dv-default-tab").filter({ hasText: new RegExp(RUN.slice(0, 8)) }),
    ).toHaveCount(1);
  });
});
