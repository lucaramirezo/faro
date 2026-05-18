import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunEvent } from "@/lib/run-events";

// Hoisted SDK mock (copy of the agent-sdk.test.ts idiom) + temp sandbox.
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
const { TMP } = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs");
  const { tmpdir } = require("node:os");
  const { join: j } = require("node:path");
  return { TMP: mkdtempSync(j(tmpdir(), "faro-re-")) };
});

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: mockQuery }));
vi.mock("@/lib/profiles", () => ({
  getProfile: () => ({
    profile: "test",
    display_name: "test",
    agent_root: TMP,
    memory_dir: "memory",
    state_db: "state.db",
    jsonl_root: "jsonl",
    heartbeat_path: "hb",
    owner_logins: [],
    status: "active",
  }),
  resolveStateDbPath: () => join(TMP, "state.db"),
  resolveJsonlRoot: () => join(TMP, "jsonl"),
}));

// Import the SUT AFTER vi.mock so it binds the mocked query.
import { getDb } from "@/lib/db";
import { createRun, resolveGate, streamRun } from "@/lib/run-engine";
import { readJournalAfter } from "@/lib/run-journal";

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

function asAsync<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const i of items) yield i;
    },
  };
}

async function drain(gen: AsyncGenerator<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

async function waitFor(pred: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("waitFor: condition not met within timeout");
}

const originalEnv = { ...process.env };

beforeEach(() => {
  mockQuery.mockReset();
  process.env = { ...originalEnv };
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.FARO_CLAUDE_OAUTH_TOKEN_FILE;
});

describe("run-engine — streamRun", () => {
  it("maps a token stream → run_started/token/usage/done with monotonic seq", async () => {
    mockQuery.mockReturnValue(
      asAsync([
        {
          type: "assistant",
          session_id: "sess-1",
          message: {
            content: [
              { type: "text", text: "Hello " },
              { type: "text", text: "world" },
            ],
          },
        },
        {
          type: "result",
          subtype: "success",
          total_cost_usd: 0.02,
          duration_ms: 7,
          usage: { input_tokens: 3, output_tokens: 5 },
        },
      ]),
    );
    const events = await drain(
      streamRun({ mode: "agent", runId: "run_900_aaa000", prompt: "do x" }),
    );
    const kinds = events.map((e) => e.kind);
    expect(kinds[0]).toBe("run_started");
    expect(kinds).toContain("token");
    expect(kinds).toContain("usage");
    expect(kinds.at(-1)).toBe("done");

    const seqs = events.map((e) => e.seq);
    expect(seqs[0]).toBe(0);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));

    const started = events.find((e) => e.kind === "run_started");
    expect(started && "session_id" in started && started.session_id).toBe("sess-1");
    const done = events.find((e) => e.kind === "done");
    expect(done?.terminal).toBe(true);
  });

  it("ANTHROPIC_API_KEY set → guard yields an error envelope, query never called", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-should-not-run";
    const events = await drain(streamRun({ mode: "agent", runId: "run_901_bbb111", prompt: "x" }));
    expect(events.some((e) => e.kind === "error" && /ANTHROPIC_API_KEY/.test(e.message))).toBe(
      true,
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("SDK error result → terminal error envelope, generator does not throw", async () => {
    mockQuery.mockReturnValue(asAsync([{ type: "result", subtype: "error_during_execution" }]));
    const events = await drain(streamRun({ mode: "agent", runId: "run_902_ccc222", prompt: "x" }));
    const err = events.find((e) => e.kind === "error");
    expect(err).toBeTruthy();
    expect(err && "code" in err && err.code).toBe("error_during_execution");
    expect(err?.terminal).toBe(true);
  });

  it("agent mode is PERMISSIVE (single-user override): safe tools allowed, destructive shell denied, NO gate", async () => {
    const perms: Array<{ behavior: string; message?: string }> = [];
    mockQuery.mockImplementation((args: { options: Record<string, unknown> }) => {
      const opts = args.options;
      return (async function* () {
        yield {
          type: "assistant",
          session_id: "sess-G",
          message: { content: [{ type: "text", text: "using tools" }] },
        };
        const cut = opts.canUseTool as
          | ((t: string, i: unknown, o: unknown) => Promise<{ behavior: string; message?: string }>)
          | undefined;
        if (cut) {
          const o = { toolUseID: "t", signal: new AbortController().signal };
          perms.push(await cut("Bash", { command: "ls -la" }, o));
          perms.push(await cut("Bash", { command: "rm -rf /" }, o));
          perms.push(await cut("Read", { file_path: "/x" }, o));
          perms.push(await cut("Write", { file_path: "/x", content: "y" }, o));
        }
        yield {
          type: "result",
          subtype: "success",
          total_cost_usd: 0,
          duration_ms: 1,
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      })();
    });

    const events = await drain(streamRun({ mode: "agent", runId: "run_903_ddd333", prompt: "x" }));
    // ls/Read/Write allowed; only the destructive `rm -rf /` denied.
    expect(perms.map((p) => p.behavior)).toEqual(["allow", "deny", "allow", "allow"]);
    expect(perms[1].message).toMatch(/destructive|safety/i);
    // No HIL gate under the permissive policy: nothing journaled as
    // approval, no awaiting_approval, the run reaches a terminal done.
    const journal = readJournalAfter("run_903_ddd333", -1);
    expect(journal.some((e) => e.kind === "approval")).toBe(false);
    expect(
      events.some((e) => e.kind === "status" && "status" in e && e.status === "awaiting_approval"),
    ).toBe(false);
    expect(events.some((e) => e.terminal)).toBe(true);
    const row = getDb()
      .prepare("SELECT status FROM runs WHERE run_id = ?")
      .get("run_903_ddd333") as { status: string };
    expect(row.status).toBe("done");
  });

  it("resolveGate (dormant machinery, kept) still resumes the SDK session (Options.resume) and continues seq", async () => {
    const RID = "run_904_eee444";
    mockQuery.mockImplementation((args: { options: Record<string, unknown> }) => {
      if (args.options.resume) {
        return asAsync([
          {
            type: "assistant",
            session_id: args.options.resume,
            message: { content: [{ type: "text", text: "resumed and finishing" }] },
          },
          {
            type: "result",
            subtype: "success",
            total_cost_usd: 0.03,
            duration_ms: 4,
            usage: { input_tokens: 2, output_tokens: 2 },
          },
        ]);
      }
      return asAsync([
        {
          type: "assistant",
          session_id: "sess-G",
          message: { content: [{ type: "text", text: "first turn done" }] },
        },
        {
          type: "result",
          subtype: "success",
          total_cost_usd: 0,
          duration_ms: 1,
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      ]);
    });

    // First turn completes normally (permissive policy → no gate); session
    // 'sess-G' is recorded on the runs row.
    await drain(streamRun({ mode: "agent", runId: RID, prompt: "x" }));
    const db = getDb();
    await waitFor(
      () =>
        (db.prepare("SELECT status FROM runs WHERE run_id = ?").get(RID) as { status: string })
          .status === "done",
    );
    const before = (
      db.prepare("SELECT last_seq FROM runs WHERE run_id = ?").get(RID) as { last_seq: number }
    ).last_seq;

    // resolveGate is no longer auto-triggered (gate is dormant under the
    // single-user permissive policy) but is KEPT as a functional resume
    // primitive — drive it directly and assert the resume contract holds.
    const { resumed } = resolveGate({ runId: RID, gateId: "g-manual", decision: "allow" });
    expect(resumed).toBe(true);

    await waitFor(() =>
      Boolean(
        mockQuery.mock.calls.find(
          (c) => (c[0] as { options?: { resume?: string } })?.options?.resume === "sess-G",
        ),
      ),
    );
    const after = (
      db.prepare("SELECT last_seq FROM runs WHERE run_id = ?").get(RID) as { last_seq: number }
    ).last_seq;
    expect(after).toBeGreaterThan(before);
  });

  it("generation mode writes extract-html output where scanArtifacts indexes it", async () => {
    const RID = "run_905_fff555";
    mockQuery.mockReturnValue(
      asAsync([
        {
          type: "assistant",
          session_id: "sess-gen",
          message: {
            content: [
              {
                type: "text",
                text: "Sure:\n```html\n<!DOCTYPE html><html><body>hi</body></html>\n```",
              },
            ],
          },
        },
        {
          type: "result",
          subtype: "success",
          total_cost_usd: 0.01,
          duration_ms: 3,
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      ]),
    );
    const events = await drain(
      streamRun({ mode: "generation", runId: RID, prompt: "gen", systemPrompt: "sys" }),
    );
    expect(events.at(-1)?.kind).toBe("done");
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    const file = join(TMP, "drafts", "artifacts", date, RID, "generated.html");
    expect(readFileSync(file, "utf8")).toBe("<!DOCTYPE html><html><body>hi</body></html>");
    // generation runs tools-OFF: query() got allowedTools:[] and NO canUseTool
    const genCall = mockQuery.mock.calls.at(-1)?.[0] as {
      options: { allowedTools?: unknown[]; canUseTool?: unknown };
    };
    expect(genCall.options.allowedTools).toEqual([]);
    expect(genCall.options.canUseTool).toBeUndefined();
  });

  it("createRun upserts a runs row immediately and returns a run id", async () => {
    mockQuery.mockReturnValue(
      asAsync([
        { type: "result", subtype: "success", total_cost_usd: 0, duration_ms: 1, usage: {} },
      ]),
    );
    const { runId } = createRun({ mode: "agent", prompt: "hello" });
    expect(runId).toMatch(/^run_\d+_[0-9a-f]{6}$/);
    const row = getDb().prepare("SELECT run_id FROM runs WHERE run_id = ?").get(runId);
    expect(row).toBeTruthy();
  });
});
