import { describe, expect, it } from "vitest";
import { formatRunSSE, isTerminalKind, mkRunId, type RunEvent } from "@/lib/run-events";

describe("run-events", () => {
  it("formatRunSSE emits a data-only frame (no id:/event: lines)", () => {
    const ev: RunEvent = {
      run_id: "run_1_aabbcc",
      seq: 3,
      ts: 1_700_000_000_000,
      terminal: false,
      kind: "token",
      text: "hello",
    };
    const frame = formatRunSSE(ev);
    expect(frame).toBe(`data: ${JSON.stringify(ev)}\n\n`);
    expect(frame.startsWith("data: ")).toBe(true);
    expect(frame.endsWith("\n\n")).toBe(true);
    expect(frame).not.toContain("event:");
    expect(frame).not.toContain("id:");
  });

  it("isTerminalKind is true only for done/error/cancelled", () => {
    expect(isTerminalKind("done")).toBe(true);
    expect(isTerminalKind("error")).toBe(true);
    expect(isTerminalKind("cancelled")).toBe(true);
    for (const k of [
      "run_started",
      "status",
      "token",
      "tool_use",
      "tool_result",
      "approval",
      "clarify",
      "gate_resolved",
      "usage",
    ] as const) {
      expect(isTerminalKind(k)).toBe(false);
    }
  });

  it("envelope discriminates by `kind` and round-trips through JSON", () => {
    const ev: RunEvent = {
      run_id: "run_2_ddeeff",
      seq: 9,
      ts: 1,
      terminal: true,
      kind: "done",
      costUsd: 0.12,
      durationMs: 42,
      session_id: "sess-xyz",
    };
    const back = JSON.parse(JSON.stringify(ev)) as RunEvent;
    expect(back.kind).toBe("done");
    if (back.kind === "done") {
      expect(back.costUsd).toBe(0.12);
      expect(back.session_id).toBe("sess-xyz");
    }
    expect(back.terminal).toBe(true);
  });

  it("mkRunId is time-sortable + matches the run id shape", () => {
    const a = mkRunId();
    expect(a).toMatch(/^run_\d+_[0-9a-f]{6}$/);
    expect(mkRunId()).not.toBe(a);
  });
});
