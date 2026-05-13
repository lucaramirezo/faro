import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { getMemoryPages } from "@/lib/memory";
import { assertUnder } from "@/lib/security";

/**
 * Knowledge-graph builder. Transforms the memory + wiki layers into a
 * serializable node/edge payload that the client-side sigma renderer mounts
 * via a graphology Graph instance.
 *
 * Node kinds + colors are locked here (PRD §14 decision 16 brand chip system):
 *   memory  → Anthropic orange  #D97757
 *   wiki    → OpenAI green     #10A37F
 */

export type NodeKind = "memory" | "wiki";

export interface GraphNode {
  id: string; // slug — also used as the wikilink target
  label: string; // title or slug fallback
  kind: NodeKind;
  path: string; // absolute path on disk; used for obsidian:// URL building
  x: number; // initial layout coordinate; FA2Layout converges fast from random
  y: number;
  size: number; // 4 + log2(1 + backlink_count)
  color: string; // node fill color
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  brokenLinks: number; // outbound wikilinks pointing at non-existent slugs
}

const MEMORY_COLOR = "#D97757"; // Anthropic orange
const WIKI_COLOR = "#10A37F"; // OpenAI green

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

function sizeFor(backlinkCount: number): number {
  return 4 + Math.log2(1 + backlinkCount);
}

export interface BuildKnowledgeGraphOptions {
  agentRoot: string;
  includeWiki?: boolean;
}

export async function buildKnowledgeGraph(opts: BuildKnowledgeGraphOptions): Promise<GraphData> {
  const { agentRoot, includeWiki = true } = opts;

  const memoryPages = await getMemoryPages({ agentRoot });

  interface RawNode {
    slug: string;
    title: string;
    kind: NodeKind;
    path: string;
    outbound: string[];
    backlinkCount: number;
  }

  const rawNodes = new Map<string, RawNode>();
  for (const m of memoryPages) {
    rawNodes.set(m.slug, {
      slug: m.slug,
      title: m.title,
      kind: "memory",
      path: m.path,
      outbound: m.outboundLinks,
      backlinkCount: m.inboundBacklinks.length,
    });
  }

  if (includeWiki) {
    const wikiDir = path.join(agentRoot, "wiki");
    const wikiFiles = await listWikiFiles(wikiDir);
    for (const wikiPath of wikiFiles) {
      let safe: string;
      try {
        safe = assertUnder(wikiPath, agentRoot);
      } catch {
        continue;
      }
      let raw: string;
      try {
        raw = await fs.readFile(safe, "utf8");
      } catch {
        continue;
      }
      let parsedBody: string;
      try {
        parsedBody = matter(raw).content;
      } catch {
        parsedBody = raw;
      }
      const slug = path.relative(wikiDir, safe).replace(/\.md$/, "").replaceAll(path.sep, "/");
      if (rawNodes.has(slug)) continue; // memory takes precedence on collision
      rawNodes.set(slug, {
        slug,
        title: extractTitle(parsedBody, slug),
        kind: "wiki",
        path: safe,
        outbound: extractWikilinks(parsedBody),
        backlinkCount: 0, // backfilled below from outbound edges
      });
    }
  }

  // Backfill wiki backlink counts by counting inbound from any outbound edge.
  const inbound = new Map<string, number>();
  for (const rn of rawNodes.values()) {
    for (const target of rn.outbound) {
      if (rawNodes.has(target)) {
        inbound.set(target, (inbound.get(target) ?? 0) + 1);
      }
    }
  }
  for (const rn of rawNodes.values()) {
    if (rn.kind === "wiki") {
      rn.backlinkCount = inbound.get(rn.slug) ?? 0;
    }
  }

  const nodes: GraphNode[] = [...rawNodes.values()].map((rn) => ({
    id: rn.slug,
    label: rn.title,
    kind: rn.kind,
    path: rn.path,
    x: Math.random(),
    y: Math.random(),
    size: sizeFor(rn.backlinkCount),
    color: rn.kind === "memory" ? MEMORY_COLOR : WIKI_COLOR,
  }));

  // Edge dedup: (sourceSlug, targetSlug) → weight.
  const edgeMap = new Map<string, GraphEdge>();
  let brokenLinks = 0;
  for (const rn of rawNodes.values()) {
    for (const target of rn.outbound) {
      if (!rawNodes.has(target)) {
        brokenLinks++;
        continue;
      }
      if (target === rn.slug) continue; // skip self-loops
      const key = `${rn.slug}${target}`;
      const existing = edgeMap.get(key);
      if (existing) {
        existing.weight += 1;
      } else {
        edgeMap.set(key, { source: rn.slug, target, weight: 1 });
      }
    }
  }

  if (brokenLinks > 0) {
    console.warn(`[faro] graph: ${brokenLinks} broken wikilinks omitted`);
  }

  return {
    nodes,
    edges: [...edgeMap.values()],
    brokenLinks,
  };
}
