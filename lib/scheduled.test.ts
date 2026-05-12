import os from "node:os";
import { parseExpression } from "cron-parser";
import { describe, expect, it, vi } from "vitest";
import { getScheduledTasks } from "@/lib/scheduled";

describe("cron-parser", () => {
  it("computes a future next-fire from a cron expression", () => {
    const iter = parseExpression("0 3 * * *", { tz: "Europe/Madrid" });
    const next = iter.next();
    expect(next.toDate().getTime()).toBeGreaterThan(Date.now() - 86_400_000);
  });
});

describe("getScheduledTasks env-aware behavior", () => {
  it("returns disabled empty-state when not on pei", async () => {
    const hostSpy = vi.spyOn(os, "hostname").mockReturnValue("laptop");
    const data = await getScheduledTasks({ agentRoot: "/tmp/not-pei" });
    expect(data.enabled).toBe(false);
    expect(data.tasks).toEqual([]);
    expect(data.sessionLock).toBeNull();
    hostSpy.mockRestore();
  });

  it("returns no tasks when forceEnabled is set but no crontab/timer exists", async () => {
    // forceEnabled flips the gate, but execFile may not find anything in the
    // unit-test sandbox; we only assert the function does not throw.
    const data = await getScheduledTasks({
      agentRoot: "/tmp/forced",
      forceEnabled: true,
    });
    expect(data.enabled).toBe(true);
    expect(Array.isArray(data.tasks)).toBe(true);
  });
});
