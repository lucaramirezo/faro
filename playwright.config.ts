import { defineConfig } from "@playwright/test";

/**
 * Phase 4 e2e config.
 *
 * Two run modes:
 *   - `bun run test:e2e`     → http://localhost:3000 (laptop dev server)
 *   - `bun run test:e2e:pei` → https://pei.taild21074.ts.net:8443 (tailnet)
 *
 * Most specs use the `request` fixture (no browser required) — only specs
 * that test rendering (nav.spec.ts, dreams-regression.spec.ts) need
 * `playwright install`, which is deferred until those specs land
 * end-to-end content.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.FARO_E2E_BASE_URL ?? "http://localhost:3000",
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
  },
});
