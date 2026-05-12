// Adapted from developer-hasm/claude-code-dashboard `src/lib/scanner.ts` (MIT).
// See LICENSE-third-party.md. Upstream wraps `scanSkills` inside an internal
// `scanAll`; here we re-export the skill slice as the public entry point.

import "server-only";

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import type { Skill, SkillScope } from "@/lib/skills/types";

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
  return {
    name,
    scope,
    path: fullPath,
    description,
    frontmatter: fm,
  };
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
  const [globals, projects] = await Promise.all([
    scanRoot({ root: globalRoot, scope: "global" }),
    scanRoot({ root: projectRoot, scope: "project" }),
  ]);
  // Project takes precedence over global on name collision; both lists are
  // kept distinct for rendering grouped sections.
  const projectNames = new Set(projects.map((s) => s.name));
  const globalsDeduped = globals.filter((s) => !projectNames.has(s.name));
  const all = [...projects, ...globalsDeduped];
  return all.sort((a, b) => a.name.localeCompare(b.name));
}
