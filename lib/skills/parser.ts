// Adapted from developer-hasm/claude-code-dashboard `src/lib/scanner.ts` (MIT).
// See LICENSE-third-party.md. Upstream wraps `scanSkills` inside an internal
// `scanAll`; here we re-export the skill slice as the public entry point.

import "server-only";

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import type { Skill, SkillAttribution, SkillScope } from "@/lib/skills/types";

interface ScanRoot {
  root: string;
  scope: SkillScope;
}

async function safeReaddir(p: string): Promise<string[]> {
  try {
    return await fs.readdir(p);
  } catch {
    return [];
  }
}

function firstContentLine(raw: string): string | null {
  const body = raw.replace(/^---[\s\S]*?---\s*/, "");
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    return trimmed;
  }
  return null;
}

/** Parse provenance from frontmatter: an `attribution: { repo, license,
 *  commit }` object, or the flat `source_repo` / `source_license` /
 *  `source_commit` fallbacks. Returns undefined unless repo + license exist. */
function parseAttribution(fm: Record<string, unknown>): SkillAttribution | undefined {
  const a = fm.attribution;
  if (a && typeof a === "object") {
    const o = a as Record<string, unknown>;
    if (typeof o.repo === "string" && typeof o.license === "string") {
      return {
        repo: o.repo,
        license: o.license,
        ...(typeof o.commit === "string" ? { commit: o.commit } : {}),
      };
    }
  }
  if (typeof fm.source_repo === "string" && typeof fm.source_license === "string") {
    return {
      repo: fm.source_repo,
      license: fm.source_license,
      ...(typeof fm.source_commit === "string" ? { commit: fm.source_commit } : {}),
    };
  }
  return undefined;
}

async function readSkill(dir: string, scope: SkillScope): Promise<Skill | null> {
  const entries = await safeReaddir(dir);
  const skillFile = entries.find((f) => f.toLowerCase() === "skill.md");
  if (!skillFile) return null;
  const fullPath = path.join(dir, skillFile);
  let raw: string;
  try {
    raw = await fs.readFile(fullPath, "utf8");
  } catch (err) {
    console.warn(`[faro] skills: cannot read ${fullPath}: ${err}`);
    return null;
  }
  let parsed: { data: Record<string, unknown>; content: string };
  try {
    parsed = matter(raw);
  } catch (err) {
    console.warn(`[faro] skills: malformed frontmatter in ${fullPath}: ${err}`);
    parsed = { data: {}, content: raw };
  }
  const fm = parsed.data ?? {};
  const description =
    (typeof fm.description === "string" && fm.description.trim()) || firstContentLine(raw) || "";
  const name = path.basename(dir);
  const attribution = parseAttribution(fm);
  return {
    name,
    scope,
    path: fullPath,
    description,
    frontmatter: fm,
    ...(attribution ? { attribution } : {}),
  };
}

/**
 * Lazily read the markdown BODY of a SKILL.md (frontmatter stripped). The
 * scanner never returns the body (Q4 — surfacing it was a required new seam);
 * §6.9 generation needs it as the design brief.
 */
export async function loadSkillBody(skillPath: string): Promise<string> {
  const raw = await fs.readFile(skillPath, "utf8");
  return matter(raw).content.trim();
}

async function scanRoot({ root, scope }: ScanRoot): Promise<Skill[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const skills: Skill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const dir = path.join(root, entry.name);
    const skill = await readSkill(dir, scope);
    if (skill) skills.push(skill);
  }
  return skills;
}

export interface ScanSkillsOptions {
  agentRoot: string;
}

export async function scanSkills(opts: ScanSkillsOptions): Promise<Skill[]> {
  const globalRoot = path.join(os.homedir(), ".claude", "skills");
  const projectRoot = path.join(opts.agentRoot, ".claude", "skills");
  // agent_root is the REPO ROOT (/home/luca/projects/lwiki), so faro's own
  // skills live under faro/.claude/skills/ — hence the imported root carries
  // the `faro/` segment (Q4 GOTCHA), NOT <agent_root>/.claude/skills/imported.
  const importedRoot = path.join(opts.agentRoot, "faro", ".claude", "skills", "imported");
  const [globals, projects, imported] = await Promise.all([
    scanRoot({ root: globalRoot, scope: "global" }),
    scanRoot({ root: projectRoot, scope: "project" }),
    scanRoot({ root: importedRoot, scope: "imported" }),
  ]);
  // Precedence project > imported > global on name collision; the three lists
  // stay distinct for rendering grouped sections.
  const projectNames = new Set(projects.map((s) => s.name));
  const importedDeduped = imported.filter((s) => !projectNames.has(s.name));
  const importedNames = new Set(importedDeduped.map((s) => s.name));
  const globalsDeduped = globals.filter(
    (s) => !projectNames.has(s.name) && !importedNames.has(s.name),
  );
  const all = [...projects, ...importedDeduped, ...globalsDeduped];
  return all.sort((a, b) => a.name.localeCompare(b.name));
}
