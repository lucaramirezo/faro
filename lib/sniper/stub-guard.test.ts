import { describe, expect, it } from "vitest";
import { assertNotStub, StubWriteError } from "./stub-guard";

// A "big" prior artifact and a "tiny" stub used across the assertions.
const PRIOR_BIG = `<!DOCTYPE html><html><body>${"<p>filler paragraph of text</p>".repeat(200)}</body></html>`;
const STUB_TINY = "<!DOCTYPE html><html><body><p>stub</p></body></html>";
const NEAR_FULL = `<!DOCTYPE html><html><body>${"<p>nearly the same as prior</p>".repeat(180)}</body></html>`;

describe("assertNotStub", () => {
  it("does not compare when there is no prior artifact (first write)", () => {
    expect(() => assertNotStub(STUB_TINY, null, "sniper-edit", "first.html")).not.toThrow();
  });

  it("passes when new write retains ≥20% of prior (within tolerance)", () => {
    expect(() => assertNotStub(NEAR_FULL, PRIOR_BIG, "sniper-edit", "x.html")).not.toThrow();
  });

  it("throws StubWriteError when sniper write shrinks below 20%", () => {
    expect(() => assertNotStub(STUB_TINY, PRIOR_BIG, "sniper-edit", "x.html")).toThrow(
      StubWriteError,
    );
  });

  it("error carries the sizes + ratio for telemetry", () => {
    try {
      assertNotStub(STUB_TINY, PRIOR_BIG, "sniper-edit", "label.html");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(StubWriteError);
      const e = err as StubWriteError;
      expect(e.label).toBe("label.html");
      expect(e.newBytes).toBeGreaterThan(0);
      expect(e.priorBytes).toBeGreaterThan(e.newBytes);
      expect(e.ratio).toBeLessThan(0.2);
    }
  });

  it("generation source is OFF regardless of ratio", () => {
    expect(() => assertNotStub(STUB_TINY, PRIOR_BIG, "generation", "x.html")).not.toThrow();
  });

  it("zero prior size short-circuits (cannot form a ratio)", () => {
    expect(() => assertNotStub(STUB_TINY, "", "sniper-edit", "x.html")).not.toThrow();
  });

  it("inline→<link> refactor passes when linked-asset bytes counted", () => {
    // Prior is a fat 8KB inline CSS + small HTML.
    const priorInline = `<html><head><style>${"a { color: red; }".repeat(500)}</style></head><body><p>hi</p></body></html>`;
    // New is the same HTML with a tiny external <link> — by raw size, it's well
    // below 20% of prior. With the linked-asset table reporting the extracted
    // 7KB CSS file, normalized bytes line up and the guard passes.
    const newLinked =
      '<html><head><link rel="stylesheet" href="style.css"></head><body><p>hi</p></body></html>';
    const linkedAssets = { "style.css": 7500 };
    expect(() =>
      assertNotStub(newLinked, priorInline, "sniper-edit", "refactor.html", linkedAssets),
    ).not.toThrow();
    // And WITHOUT the asset table, the same refactor trips the guard — proves the
    // normalization is what saves it, not some other accident.
    expect(() => assertNotStub(newLinked, priorInline, "sniper-edit", "refactor.html")).toThrow(
      StubWriteError,
    );
  });
});
