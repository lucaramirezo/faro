import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { assertUnderReal, isSafeId, validateProjectPath } from "@/lib/projects-path";

describe("projects-path · validateProjectPath (vendored)", () => {
  it("accepts a normal relative path and normalizes backslashes", () => {
    expect(validateProjectPath("a/b/c")).toBe("a/b/c");
    expect(validateProjectPath("a\\b\\c")).toBe("a/b/c");
  });
  it("rejects traversal / dot segments", () => {
    expect(() => validateProjectPath("../escape")).toThrow("invalid file name");
    expect(() => validateProjectPath("a/../b")).toThrow("invalid file name");
    expect(() => validateProjectPath("a/./b")).toThrow("invalid file name");
    expect(() => validateProjectPath("")).toThrow("invalid file name");
  });
  it("rejects NUL, drive letters, and absolute paths", () => {
    expect(() => validateProjectPath("a\0b")).toThrow("invalid file name");
    expect(() => validateProjectPath("C:\\windows")).toThrow("invalid file name");
    expect(() => validateProjectPath("/abs/path")).toThrow("invalid file name");
  });
  it("rejects the reserved .live-artifacts segment", () => {
    expect(() => validateProjectPath("x/.live-artifacts/y")).toThrow("reserved project path");
  });
});

describe("projects-path · isSafeId (security-critical pure-dot guard)", () => {
  it("rejects empty / pure-dot / too-long / illegal chars / non-string", () => {
    for (const bad of ["", ".", "..", "...", "a/b", "a b", "a\0", "a!", "a".repeat(129)]) {
      expect(isSafeId(bad)).toBe(false);
    }
    expect(isSafeId(123)).toBe(false);
    expect(isSafeId(null)).toBe(false);
    expect(isSafeId(undefined)).toBe(false);
  });
  it("accepts safe ids incl. dots-not-alone, up to 128 chars", () => {
    expect(isSafeId("my-project.v2")).toBe(true);
    expect(isSafeId("abc_123-XYZ.v2")).toBe(true);
    expect(isSafeId("a".repeat(128))).toBe(true);
  });
});

describe("projects-path · assertUnderReal (descendant-symlink escape)", () => {
  const ROOT = mkdtempSync(join(tmpdir(), "faro-pp-"));
  const outside = mkdtempSync(join(tmpdir(), "faro-pp-out-"));
  const parent = join(ROOT, "parent");
  mkdirSync(parent, { recursive: true });

  afterAll(() => {
    rmSync(ROOT, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  let symlinkOk = true;
  try {
    symlinkSync(outside, join(parent, "link"), "dir");
  } catch {
    symlinkOk = false;
  }

  (symlinkOk ? it : it.skip)(
    "throws EPATHESCAPE when a descendant symlink escapes the project dir",
    async () => {
      await expect(assertUnderReal(join(parent, "link", "x"), parent)).rejects.toMatchObject({
        code: "EPATHESCAPE",
      });
    },
  );

  it("resolves a legit not-yet-created nested write path under the parent", async () => {
    const real = await assertUnderReal(join(parent, "sub", "deep", "file.html"), parent);
    expect(real.startsWith(parent)).toBe(true);
    expect(real.endsWith(join("sub", "deep", "file.html"))).toBe(true);
  });

  it("throws on a lexical traversal before any realpath work", async () => {
    await expect(assertUnderReal(join(parent, "..", "evil"), parent)).rejects.toThrow();
  });
});
