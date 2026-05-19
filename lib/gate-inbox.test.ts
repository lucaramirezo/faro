import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunEvent, RunEventBody } from "@/lib/run-events";

// Same isolation idiom as run-engine.test.ts: a hoisted temp agent_root +
// fully-mocked profiles so getDb() opens <TMP>/state.db. The shared
// slack_agent/runs/state.db is NEVER touched (P1/P2 DB-isolation invariant).
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
const { TMP } = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs");
  const { tmpdir } = require("node:os");
  const { join: j } = require("node:path");
  return { TMP: mkdtempSync(j(tmpdir(), "faro-gi-")) };
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

// Import SUT + helpers AFTER the mocks so they bind the isolated DB.
import { getDb } from "@/lib/db";
import { listPendingGates, resolveUnifiedGate } from "@/lib/gate-inbox";
import { appendEvent, journalPath } from "@/lib/run-journal";

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

// The slack_agent-owned pipeline_runs in prod is a superset; ensureSchema does
// NOT create it (it's the dreams authority). Mirror the columns the /dreams
// queue query (and so the projection) selects.
function ensurePipelineRuns(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS pipeline_runs (
      run_id         TEXT PRIMARY KEY,
      pipeline       TEXT NOT NULL,
      run_date       TEXT,
      status         TEXT,
      draft_dir      TEXT,
      created_at     TIMESTAMP,
      result_summary TEXT,
      decision_token TEXT,
      profile_id     TEXT NOT NULL DEFAULT 'lwiki'
    );
  `);
}

function seedRun(runId: string, status: string, profileId = "test"): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO runs
         (run_id, profile_id, session_id, status, journal_path, created_at, last_seq)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(runId, profileId, "sess-x", status, journalPath(runId), new Date().toISOString(), 20);
}

function seedJournal(runId: string, bodies: RunEventBody[], baseTs = 1_700_000_000_000): void {
  bodies.forEach((body, i) => {
    const ev = { run_id: runId, seq: i, ts: baseTs + i, terminal: false, ...body } as RunEvent;
    appendEvent(runId, ev);
  });
}

function seedDream(
  runId: string,
  status: string,
  claims: Array<{ claimId: string; status: string }>,
  createdAt = "2026-05-19 10:00:00",
): void {
  ensurePipelineRuns();
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO pipeline_runs
       (run_id, pipeline, run_date, status, draft_dir, created_at, result_summary)
     VALUES (?, 'dreams', ?, ?, ?, ?, ?)`,
  ).run(runId, "2026-05-19", status, "/tmp/draft", createdAt, "weekly memory candidates");
  const ins = db.prepare(
    `INSERT OR REPLACE INTO claim_decisions
       (claim_id, run_id, profile_id, category, section_path, claim_text, evidence, status)
     VALUES (?, ?, 'lwiki', 'surfaced', 's/p', 'a claim', '[]', ?)`,
  );
  for (const c of claims) ins.run(c.claimId, runId, c.status);
}

beforeEach(() => {
  mockQuery.mockReset();
  // Wipe the isolated DB tables between tests for deterministic projection.
  const db = getDb();
  for (const t of ["run_events", "runs", "claim_decisions", "pipeline_runs"]) {
    try {
      db.exec(`DELETE FROM ${t}`);
    } catch {
      /* table not yet created (pipeline_runs) — fine */
    }
  }
});

describe("gate-inbox · listPendingGates — run projection", () => {
  it("(a) projects an awaiting_approval run with an unresolved approval as a run gate", () => {
    seedRun("run_111_aaaaaa", "awaiting_approval");
    seedJournal("run_111_aaaaaa", [
      { kind: "run_started", profile_id: "test", session_id: "s", model: "m" },
      { kind: "approval", gateId: "g1", tool: "Write", args: { file_path: "/x", content: "y" } },
    ]);

    const gates = listPendingGates("test");
    expect(gates).toHaveLength(1);
    const g = gates[0];
    expect(g.source).toBe("run");
    expect(g.runId).toBe("run_111_aaaaaa");
    expect(g.gateId).toBe("g1");
    if (g.source === "run") {
      expect(g.kind).toBe("approval");
      expect(g.tool).toBe("Write");
      expect(g.args).toEqual({ file_path: "/x", content: "y" });
      expect(g.question).toBeUndefined();
    }
    expect(g.title).toBe("Run run_111_"); // "Run " + runId.slice(0, 8)
    expect(g.createdAt).toBe(1_700_000_000_001); // ts of the approval (seq 1)
  });

  it("(b) excludes a run whose gate already has a matching gate_resolved", () => {
    seedRun("run_222_bbbbbb", "awaiting_approval");
    seedJournal("run_222_bbbbbb", [
      { kind: "approval", gateId: "g1", tool: "Edit", args: { file_path: "/z" } },
      { kind: "gate_resolved", gateId: "g1", decision: "allow" },
    ]);
    expect(listPendingGates("test")).toHaveLength(0);
  });

  it("(b') keeps the latest unresolved gate when a run cycled multiple gates", () => {
    seedRun("run_223_bbbbbb", "awaiting_approval");
    seedJournal("run_223_bbbbbb", [
      { kind: "approval", gateId: "g1", tool: "Write", args: { f: 1 } },
      { kind: "gate_resolved", gateId: "g1", decision: "allow" },
      { kind: "approval", gateId: "g2", tool: "Edit", args: { f: 2 } },
    ]);
    const gates = listPendingGates("test");
    expect(gates).toHaveLength(1);
    expect(gates[0].gateId).toBe("g2");
  });

  it("(e) profile scoping: a run under another profile is excluded", () => {
    seedRun("run_333_cccccc", "awaiting_approval", "other");
    seedJournal("run_333_cccccc", [{ kind: "approval", gateId: "gX", tool: "Write", args: {} }]);
    seedRun("run_334_cccccc", "awaiting_clarify", "test");
    seedJournal("run_334_cccccc", [{ kind: "clarify", gateId: "gY", question: "which env?" }]);

    const gates = listPendingGates("test");
    expect(gates).toHaveLength(1);
    expect(gates[0].runId).toBe("run_334_cccccc");
    if (gates[0].source === "run") {
      expect(gates[0].kind).toBe("clarify");
      expect(gates[0].question).toBe("which env?");
    }
  });
});

describe("gate-inbox · listPendingGates — claim projection", () => {
  it("(c) projects a pending dream with correct counts + reviewHref", () => {
    seedDream("dream_777_aaa", "pending", [
      { claimId: "c1", status: "pending" },
      { claimId: "c2", status: "pending" },
      { claimId: "c3", status: "approved" },
    ]);
    const gates = listPendingGates("test");
    expect(gates).toHaveLength(1);
    const g = gates[0];
    expect(g.source).toBe("claim");
    if (g.source === "claim") {
      expect(g.kind).toBe("dream-review");
      expect(g.pendingCount).toBe(2);
      expect(g.totalCount).toBe(3);
      expect(g.reviewHref).toBe("/dreams/dream_777_aaa");
    }
    expect(g.title).toBe("Dream dream_77");
  });

  it("surfaces a pending dream even with 0 pending claims (awaiting Finalize)", () => {
    seedDream("dream_778_bbb", "pending", [
      { claimId: "c1", status: "approved" },
      { claimId: "c2", status: "denied" },
    ]);
    const gates = listPendingGates("test");
    expect(gates).toHaveLength(1);
    if (gates[0].source === "claim") {
      expect(gates[0].pendingCount).toBe(0);
      expect(gates[0].totalCount).toBe(2);
    }
  });

  it("excludes a decided (non-pending) dream", () => {
    seedDream("dream_779_ccc", "approved", [{ claimId: "c1", status: "approved" }]);
    expect(listPendingGates("test")).toHaveLength(0);
  });

  it("includes a 'rerunning' dream (the page's second pending status)", () => {
    seedDream("dream_780_ddd", "rerunning", [{ claimId: "c1", status: "pending" }]);
    const gates = listPendingGates("test");
    expect(gates).toHaveLength(1);
    expect(gates[0].source).toBe("claim");
  });
});

describe("gate-inbox · resolveUnifiedGate dispatcher", () => {
  it("(d) a claim resolution is unsupported and never mutates claim_decisions", () => {
    seedDream("dream_900_eee", "pending", [
      { claimId: "c1", status: "pending" },
      { claimId: "c2", status: "pending" },
    ]);
    const before = getDb()
      .prepare("SELECT claim_id, status FROM claim_decisions WHERE run_id = ? ORDER BY claim_id")
      .all("dream_900_eee");

    const res = resolveUnifiedGate({
      gateId: "dream_900_eee",
      runId: "dream_900_eee",
      source: "claim",
      decision: "approved",
    });
    expect(res.accepted).toBe(false);
    expect(res.status).toBe("unsupported");
    expect(res.message).toMatch(/two-phase/i);

    const after = getDb()
      .prepare("SELECT claim_id, status FROM claim_decisions WHERE run_id = ? ORDER BY claim_id")
      .all("dream_900_eee");
    expect(after).toEqual(before); // byte-identical — Inbox never stamps claims
  });

  it("a run deny dispatches to resolveGate, terminally cancels, accepted", () => {
    seedRun("run_950_fff", "awaiting_approval");
    seedJournal("run_950_fff", [
      { kind: "run_started", profile_id: "test", session_id: "sess-D", model: "m" },
      { kind: "approval", gateId: "gD", tool: "Write", args: { f: 1 } },
    ]);

    const res = resolveUnifiedGate({
      gateId: "gD",
      runId: "run_950_fff",
      source: "run",
      decision: "deny",
    });
    expect(res).toEqual({ accepted: true, status: "accepted" });

    const row = getDb().prepare("SELECT status FROM runs WHERE run_id = ?").get("run_950_fff") as {
      status: string;
    };
    expect(row.status).toBe("cancelled");
    // Resolved → no longer projected.
    expect(listPendingGates("test")).toHaveLength(0);
    // Deny path never resumes the SDK.
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("gate-inbox · listPendingGates — union ordering", () => {
  it("returns both sources sorted by createdAt desc", () => {
    seedRun("run_001_old", "awaiting_approval");
    seedJournal(
      "run_001_old",
      [{ kind: "approval", gateId: "gOld", tool: "Write", args: {} }],
      1_000,
    );
    seedDream(
      "dream_002_new",
      "pending",
      [{ claimId: "c1", status: "pending" }],
      "2026-05-19 23:59:59",
    );

    const gates = listPendingGates("test");
    expect(gates).toHaveLength(2);
    expect(gates[0].createdAt).toBeGreaterThan(gates[1].createdAt);
    expect(gates[0].source).toBe("claim"); // 2026 dream newer than ts=1000 run gate
  });
});
