import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mock — vi.mock is hoisted by vitest above imports, so the mocked
// `query` is in place before agent-sdk.ts imports it.
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: mockQuery,
}));

// Import AFTER vi.mock so the SUT picks up the mocked query.
import { rerunClaim } from "@/lib/agent-sdk";

function asAsync<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const it of items) yield it;
    },
  };
}

const originalEnv = { ...process.env };

beforeEach(() => {
  mockQuery.mockReset();
  process.env = { ...originalEnv };
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.FARO_CLAUDE_OAUTH_TOKEN_FILE;
});

describe("rerunClaim — success path", () => {
  it("collects the SDKResultSuccess.result string and reports usage + cost", async () => {
    mockQuery.mockReturnValue(
      asAsync([
        {
          type: "result",
          subtype: "success",
          result: "Marc shipped POS on Tuesday.",
          total_cost_usd: 0.0042,
          duration_ms: 1234,
          usage: { input_tokens: 120, output_tokens: 35 },
        },
      ]),
    );

    const out = await rerunClaim({
      original: "Marc shipped the POS module on Tuesday.",
      instruction: "Make it punchier.",
    });

    expect(out.proposed).toBe("Marc shipped POS on Tuesday.");
    expect(out.costUsd).toBeCloseTo(0.0042, 6);
    expect(out.inputTokens).toBe(120);
    expect(out.outputTokens).toBe(35);
    expect(out.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("trims the proposed text", async () => {
    mockQuery.mockReturnValue(
      asAsync([
        {
          type: "result",
          subtype: "success",
          result: "  Marc shipped POS.\n",
          total_cost_usd: 0,
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      ]),
    );
    const out = await rerunClaim({ original: "x", instruction: "y" });
    expect(out.proposed).toBe("Marc shipped POS.");
  });

  it("passes model=claude-sonnet-4-6 and maxTurns=1 with no tools", async () => {
    mockQuery.mockReturnValue(
      asAsync([
        {
          type: "result",
          subtype: "success",
          result: "ok",
          total_cost_usd: 0,
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      ]),
    );
    await rerunClaim({ original: "x", instruction: "y" });
    const call = mockQuery.mock.calls[0]?.[0];
    expect(call.options.model).toBe("claude-sonnet-4-6");
    expect(call.options.maxTurns).toBe(1);
    expect(call.options.allowedTools).toEqual([]);
    expect(call.prompt).toContain("x");
    expect(call.prompt).toContain("y");
  });
});

describe("rerunClaim — error paths", () => {
  it("throws when the SDK reports an error result", async () => {
    mockQuery.mockReturnValue(
      asAsync([
        {
          type: "result",
          subtype: "error_max_turns",
        },
      ]),
    );
    await expect(rerunClaim({ original: "x", instruction: "y" })).rejects.toThrow(
      /SDK reported error/,
    );
  });

  it("throws when no text comes back", async () => {
    mockQuery.mockReturnValue(asAsync([]));
    await expect(rerunClaim({ original: "x", instruction: "y" })).rejects.toThrow(/no text/);
  });

  it("rejects an over-long prompt before calling the SDK", async () => {
    const huge = "a".repeat(5000);
    await expect(rerunClaim({ original: huge, instruction: "make it short" })).rejects.toThrow(
      /soft cap/,
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("refuses to run when ANTHROPIC_API_KEY is set (billing-leak guard)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-leak";
    await expect(rerunClaim({ original: "x", instruction: "y" })).rejects.toThrow(
      /ANTHROPIC_API_KEY is set/,
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
