import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { BacklinkRef, MemoryPage } from "@/lib/memory-types";
import { assertUnder } from "@/lib/security";

const WIKILINK_RE = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;

function extractTitle(body: string, fallback: string): string {
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) return m[1].trim();
  }
  return fallback;
}

function extractWikilinks(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(WIKILINK_RE)) {
    const target = m[1].trim();
    if (target) out.add(target);
  }
  return [...out];
}

async function readMarkdownFile(
  filePath: string,
): Promise<{ body: string; frontmatter: Record<string, unknown> } | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    console.warn(`[faro] memory: cannot read ${filePath}: ${err}`);
    return null;
  }
  try {
    const parsed = matter(raw);
    return {
      body: parsed.content,
      frontmatter: (parsed.data ?? {}) as Record<string, unknown>,
    };
  } catch (err) {
    console.warn(`[faro] memory: malformed frontmatter in ${filePath}: ${err}`);
    return { body: raw, frontmatter: {} };
  }
}

async function listMemoryFiles(memoryDir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(memoryDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => path.join(memoryDir, e.name));
}

async function listWikiFiles(wikiDir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(wikiDir, { withFileTypes: true, recursive: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => {
      const dir =
        (e as { parentPath?: string; path?: string }).parentPath ??
        (e as { path?: string }).path ??
        wikiDir;
      return path.join(dir, e.name);
    });
}

export interface GetMemoryPagesOptions {
  agentRoot: string;
}

export async function getMemoryPages(opts: GetMemoryPagesOptions): Promise<MemoryPage[]> {
  const memoryDir = path.join(opts.agentRoot, "memory");
  const wikiDir = path.join(opts.agentRoot, "wiki");

  const memoryFiles = await listMemoryFiles(memoryDir);
  const wikiFiles = await listWikiFiles(wikiDir);

  // Build a map<targetSlug, BacklinkRef[]> in a single wiki pass.
  const backlinkMap = new Map<string, BacklinkRef[]>();
  for (const wikiPath of wikiFiles) {
    let safe: string;
    try {
      safe = assertUnder(wikiPath, opts.agentRoot);
    } catch {
      continue;
    }
    const parsed = await readMarkdownFile(safe);
    if (!parsed) continue;
    const sourceSlug = path.relative(wikiDir, safe).replace(/\.md$/, "").replaceAll(path.sep, "/");
    const title = extractTitle(parsed.body, sourceSlug);
    for (const target of extractWikilinks(parsed.body)) {
      const arr = backlinkMap.get(target) ?? [];
      arr.push({ sourcePath: safe, sourceSlug, title });
      backlinkMap.set(target, arr);
    }
  }

  const pages: MemoryPage[] = [];
  for (const filePath of memoryFiles) {
    let safe: string;
    try {
      safe = assertUnder(filePath, opts.agentRoot);
    } catch {
      continue;
    }
    const parsed = await readMarkdownFile(safe);
    if (!parsed) continue;
    const slug = path.basename(safe).replace(/\.md$/, "");
    const outboundLinks = extractWikilinks(parsed.body);
    const inboundBacklinks = backlinkMap.get(slug) ?? [];
    pages.push({
      slug,
      path: safe,
      title: extractTitle(parsed.body, slug),
      body: parsed.body,
      frontmatter: parsed.frontmatter,
      outboundLinks,
      inboundBacklinks,
    });
  }
  return pages.sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function readWikiPage(
  agentRoot: string,
  slug: string,
): Promise<{ body: string; frontmatter: Record<string, unknown> } | null> {
  const wikiDir = path.join(agentRoot, "wiki");
  // Allow slug to include subpaths (e.g. "projects/cortex") but reject traversal.
  const candidate = path.join(wikiDir, `${slug}.md`);
  let safe: string;
  try {
    safe = assertUnder(candidate, wikiDir);
  } catch {
    return null;
  }
  return readMarkdownFile(safe);
}
