import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scanSkills } from "@/lib/skills/parser";

let tmpAgentRoot: string;
let homeSpy: ReturnType<typeof vi.spyOn>;

async function writeSkill(
  base: string,
  scope: "global" | "project",
  name: string,
  frontmatter: Record<string, string>,
  body: string,
  fileName = "SKILL.md",
): Promise<void> {
  const dir =
    scope === "global"
      ? path.join(base, "global-home", ".claude", "skills", name)
      : path.join(base, ".claude", "skills", name);
  await fs.mkdir(dir, { recursive: true });
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  await fs.writeFile(path.join(dir, fileName), `---\n${fm}\n---\n\n${body}\n`, "utf8");
}

beforeEach(async () => {
  tmpAgentRoot = await fs.mkdtemp(path.join(os.tmpdir(), "faro-skills-parser-"));
  await fs.mkdir(path.join(tmpAgentRoot, "global-home"), { recursive: true });
  homeSpy = vi.spyOn(os, "homedir").mockReturnValue(path.join(tmpAgentRoot, "global-home"));
});

afterEach(async () => {
  homeSpy.mockRestore();
  await fs.rm(tmpAgentRoot, { recursive: true, force: true });
});

describe("scanSkills", () => {
  it("parses frontmatter description into the Skill record", async () => {
    await writeSkill(
      tmpAgentRoot,
      "project",
      "ingest",
      { description: "Ingest sources into wiki" },
      "## Ingest\nDoes things.",
    );
    const skills = await scanSkills({ agentRoot: tmpAgentRoot });
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: "ingest",
      scope: "project",
      description: "Ingest sources into wiki",
    });
    expect(skills[0].frontmatter.description).toBe("Ingest sources into wiki");
  });

  it("skips skill directories that lack SKILL.md", async () => {
    const dir = path.join(tmpAgentRoot, ".claude", "skills", "empty");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "README.md"), "# nope", "utf8");
    const skills = await scanSkills({ agentRoot: tmpAgentRoot });
    expect(skills).toHaveLength(0);
  });

  it("matches SKILL.md case-insensitively", async () => {
    await writeSkill(
      tmpAgentRoot,
      "project",
      "lower-case",
      { description: "lower" },
      "body",
      "skill.md",
    );
    const skills = await scanSkills({ agentRoot: tmpAgentRoot });
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("lower-case");
  });
});
