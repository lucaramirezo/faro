import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractSkillName, getSkillUsage } from "@/lib/skills/usage";

describe("extractSkillName", () => {
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

describe("getSkillUsage incremental ingest", () => {
  let tmpAgentRoot: string;
  let jsonlRoot: string;

  beforeEach(async () => {
    tmpAgentRoot = await fs.mkdtemp(path.join(os.tmpdir(), "faro-skills-usage-"));
    jsonlRoot = path.join(tmpAgentRoot, "claude-projects");
    const sessionDir = path.join(jsonlRoot, "test-session");
    await fs.mkdir(sessionDir, { recursive: true });
    const fixturePath = path.resolve(
      __dirname,
      "..",
      "..",
      "test",
      "fixtures",
      "jsonl",
      "sample-with-skill.jsonl",
    );
    const raw = await fs.readFile(fixturePath, "utf8");
    await fs.writeFile(path.join(sessionDir, "session.jsonl"), raw, "utf8");
  });

  afterEach(async () => {
    await fs.rm(tmpAgentRoot, { recursive: true, force: true });
  });

  it("captures the Skill invocation and is idempotent across re-ingest", async () => {
    const first = await getSkillUsage({ agentRoot: tmpAgentRoot, jsonlRoot });
    expect(first.has("ingest")).toBe(true);
    const ingest = first.get("ingest");
    expect(ingest?.lastUsed).toBeTruthy();

    const second = await getSkillUsage({ agentRoot: tmpAgentRoot, jsonlRoot });
    expect(second.get("ingest")?.runs7d).toBe(first.get("ingest")?.runs7d);
  });
});
