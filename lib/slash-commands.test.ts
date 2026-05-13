import { describe, expect, it } from "vitest";
import {
  detectSlash,
  filterCommands,
  findCommand,
  parseInvocation,
  SLASH_COMMANDS,
} from "@/lib/slash-commands";

describe("SLASH_COMMANDS registry", () => {
  it("exposes 7 commands with stable ids", () => {
    expect(SLASH_COMMANDS).toHaveLength(7);
    const ids = SLASH_COMMANDS.map((c) => c.id).sort();
    expect(ids).toEqual(
      ["cite", "contradict-check", "merge", "reroll", "retone", "shorten", "split"].sort(),
    );
  });

  it("expand commands carry an `expand` fn; intercept commands do not", () => {
    for (const c of SLASH_COMMANDS) {
      if (c.mode === "expand") expect(c.expand).toBeTypeOf("function");
      else expect(c.expand).toBeUndefined();
    }
  });

  it("each expand fn produces a prompt containing the original claim text", () => {
    const sample = "Marc shipped the POS module on Tuesday.";
    for (const c of SLASH_COMMANDS.filter((x) => x.mode === "expand")) {
      const prompt = c.expand?.(sample, "punchier") ?? "";
      expect(prompt).toContain(sample);
      expect(prompt.toLowerCase()).toContain("return only");
    }
  });
});

describe("detectSlash", () => {
  it("opens the popover when the prefix is exactly /<query>", () => {
    expect(detectSlash("/sh", 3)).toEqual({ tokenStart: 0, query: "sh" });
    expect(detectSlash("/", 1)).toEqual({ tokenStart: 0, query: "" });
  });

  it("does NOT open mid-line (no whitespace prefix exception)", () => {
    expect(detectSlash("make it /sh", 11)).toBeNull();
    // Dates must not trigger.
    expect(detectSlash("2026/05/13", 10)).toBeNull();
  });

  it("does not open once the query contains a space", () => {
    expect(detectSlash("/reroll punchier", 16)).toBeNull();
  });
});

describe("filterCommands", () => {
  it("returns all 7 when query is empty", () => {
    expect(filterCommands("")).toHaveLength(7);
  });

  it("narrows by id substring", () => {
    expect(filterCommands("sh").map((c) => c.id)).toEqual(["shorten"]);
    expect(
      filterCommands("re")
        .map((c) => c.id)
        .sort(),
    ).toEqual(["reroll", "retone"]);
  });

  it("is case-insensitive on labels", () => {
    expect(filterCommands("CONTRADICT").map((c) => c.id)).toEqual(["contradict-check"]);
  });
});

describe("findCommand", () => {
  it("returns the matching command", () => {
    expect(findCommand("reroll")?.mode).toBe("expand");
    expect(findCommand("shorten")?.mode).toBe("intercept");
  });

  it("returns undefined for unknown ids", () => {
    expect(findCommand("nope")).toBeUndefined();
  });
});

describe("parseInvocation", () => {
  it("parses a known command + args", () => {
    const out = parseInvocation("/reroll make it sharper");
    expect(out?.command.id).toBe("reroll");
    expect(out?.args).toBe("make it sharper");
  });

  it("parses a command with no args", () => {
    const out = parseInvocation("/cite");
    expect(out?.command.id).toBe("cite");
    expect(out?.args).toBe("");
  });

  it("rejects unknown commands", () => {
    expect(parseInvocation("/unknown hi")).toBeNull();
  });

  it("rejects non-slash input", () => {
    expect(parseInvocation("hello")).toBeNull();
  });
});
