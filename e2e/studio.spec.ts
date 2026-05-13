import { expect, test } from "@playwright/test";

/**
 * Studio raw-route + main-route contract tests.
 *
 * These exercise the HTTP contract documented in DESIGN.md §3.2 + §4:
 *
 *   - `/studio`                      → 200, CSP includes 'strict-dynamic' + frame-ancestors 'self'
 *   - `/studio/raw/<valid-id>`       → 200 (when row exists) or 404 (when missing)
 *   - `/studio/raw/<invalid-id>`     → 400 (regex rejection before any IO)
 *   - `/studio/raw/..%2Fetc%2Fpasswd` → 400 (path traversal blocked)
 *
 * API-only via Playwright's `request` fixture — no browser launch needed.
 * Run via:
 *   bun run test:e2e        # laptop dev server
 *   bun run test:e2e:pei    # pei tailnet
 */

const VALID_BUT_MISSING_ID = "0000000000000000"; // 16 hex chars → format passes, row absent

test.describe("studio HTTP contract", () => {
  test("GET /studio renders 200 with CSP", async ({ request }) => {
    const res = await request.get("/studio");
    expect(res.status()).toBe(200);
    const csp = res.headers()["content-security-policy"];
    expect(csp).toBeTruthy();
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'self'");
  });

  test("GET /studio/raw/<valid-missing> returns 404", async ({ request }) => {
    const res = await request.get(`/studio/raw/${VALID_BUT_MISSING_ID}`);
    expect(res.status()).toBe(404);
  });

  test("GET /studio/raw/<invalid-format> returns 400", async ({ request }) => {
    // Underscores and capitals do not match /^[a-f0-9]{16}$/.
    const res = await request.get("/studio/raw/INVALID_NOT_HEX_16");
    expect(res.status()).toBe(400);
  });

  test("GET /studio/raw/<path-traversal> returns 400", async ({ request }) => {
    // Percent-encoded so the server-side validator sees the literal string.
    const res = await request.get("/studio/raw/%2E%2E%2Fetc%2Fpasswd", {
      maxRedirects: 0,
    });
    expect([400, 404]).toContain(res.status()); // 400 from format guard, or 404 if normalized first
  });

  test("GET /api/health returns 200 with status=ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("status", "ok");
    expect(body).toHaveProperty("timestamp");
  });
});
