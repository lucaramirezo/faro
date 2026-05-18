import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// Throwaway state.db — the real shared slack_agent state.db is never touched.
const { TMP } = vi.hoisted(() => {
  const { mkdtempSync: mk } = require("node:fs");
  const { tmpdir: td } = require("node:os");
  const { join: j } = require("node:path");
  return { TMP: mk(j(td(), "faro-usage-")) };
});

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

import { getDb } from "@/lib/db";
import { extractSkillName, getSkillUsage } from "@/lib/skills/usage";

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe("extractSkillName (upstream port — unchanged)", () => {
  it("returns the skill slug for a Skill tool_use block", () => {
    const content = [{ type: "tool_use", name: "Skill", input: { skill: "ingest" } }];
    expect(extractSkillName(content)).toBe("ingest");
  });

  it("returns null for a non-Skill tool_use block", () => {
    const content = [{ type: "tool_use", name: "Bash", input: { command: "ls" } }];
    expect(extractSkillName(content)).toBeNull();
  });

  it("returns null for empty or malformed content", () => {
    expect(extractSkillName(undefined)).toBeNull();
    expect(extractSkillName(null)).toBeNull();
    expect(extractSkillName("not an array")).toBeNull();
    expect(extractSkillName([{ type: "text", text: "hello" }])).toBeNull();
  });
});

describe("getSkillUsage (Bug-6 fix — sourced from faro runs)", () => {
  function seedRun(skill: string | null, agoMs: number) {
    getDb()
      .prepare(
        "INSERT INTO runs (run_id, profile_id, status, skill_name, created_at, journal_path) VALUES (?, 'test', 'done', ?, ?, ?)",
      )
      .run(
        `run_${Math.random().toString(36).slice(2)}`,
        skill,
        new Date(Date.now() - agoMs).toISOString(),
        "/tmp/j",
      );
  }

  it("counts only the last 7d but reports lastUsed from all runs; ignores NULL skill", async () => {
    seedRun("ingest", 60_000); // recent
    seedRun("ingest", 2 * 86_400_000); // 2d ago — within 7d
    seedRun("ingest", 9 * 86_400_000); // 9d ago — outside 7d
    seedRun("wiki-query", 9 * 86_400_000); // only an old run
    seedRun(null, 60_000); // untagged — must be excluded

    const usage = await getSkillUsage({ agentRoot: TMP, jsonlRoot: join(TMP, "jsonl") });

    expect(usage.get("ingest")?.runs7d).toBe(2);
    expect(usage.get("ingest")?.lastUsed).toBeTruthy();
    // A skill with only an >7d run still surfaces (lastUsed set, runs7d 0).
    expect(usage.get("wiki-query")?.runs7d).toBe(0);
    expect(usage.get("wiki-query")?.lastUsed).toBeTruthy();
    // NULL skill_name never produces an entry.
    expect([...usage.keys()].some((k) => k === "" || k == null)).toBe(false);
  });
});
