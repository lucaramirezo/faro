import { describe, expect, it } from "vitest";
import { baseName, nextCursor, scoreMatch } from "@/lib/quick-switch";

describe("quick-switch · scoreMatch (vendored open-design tiers)", () => {
  it("exact basename → 1000", () => {
    expect(scoreMatch("report", "report")).toBe(1000);
    expect(scoreMatch("a/b/report", "report")).toBe(1000); // basename exact
  });
  it("prefix on basename → 500", () => {
    expect(scoreMatch("reporting", "report")).toBe(500);
    expect(scoreMatch("dir/reporting", "report")).toBe(500);
  });
  it("substring on basename → 250", () => {
    expect(scoreMatch("the-report-x", "report")).toBe(250);
  });
  it("substring on full path only → 100", () => {
    expect(scoreMatch("report/index", "report")).toBe(100);
  });
  it("miss → 0", () => {
    expect(scoreMatch("nothing", "zzz")).toBe(0);
  });
  it("is case-insensitive on the name (q pre-lowercased by contract)", () => {
    expect(scoreMatch("REPORT", "report")).toBe(1000);
  });
});

describe("quick-switch · nextCursor (vendored wrap)", () => {
  it("forward wraps", () => {
    expect(nextCursor(0, 3, 1)).toBe(1);
    expect(nextCursor(2, 3, 1)).toBe(0);
  });
  it("backward wraps", () => {
    expect(nextCursor(0, 3, -1)).toBe(2);
    expect(nextCursor(1, 3, -1)).toBe(0);
  });
  it("total <= 0 → 0", () => {
    expect(nextCursor(5, 0, 1)).toBe(0);
    expect(nextCursor(5, -2, -1)).toBe(0);
  });
});

describe("quick-switch · baseName", () => {
  it("returns the segment after the last slash", () => {
    expect(baseName("a/b/c.txt")).toBe("c.txt");
    expect(baseName("noslash")).toBe("noslash");
  });
});
