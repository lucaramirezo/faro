import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Profile } from "@/lib/profiles";

export type HeartbeatStatus = "ok" | "warn" | "error" | "unknown";

export interface HeartbeatBotService {
  name: string;
  ok: boolean;
  note: string;
}

export interface HeartbeatSummary {
  lastRun: string | null;
  status: HeartbeatStatus;
  nextScheduled: string | null;
  pendingAttention: string[];
  botServices: HeartbeatBotService[];
  errors: string[];
}

function parseFrontmatter(text: string): {
  body: string;
  fm: Record<string, string>;
} {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { body: text, fm: {} };
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) fm[key] = value;
  }
  return { body: text.slice(m[0].length), fm };
}

function splitSections(body: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current: string | null = null;
  let buf: string[] = [];
  for (const raw of body.split("\n")) {
    const h = raw.match(/^##\s+(.+?)\s*$/);
    if (h) {
      if (current) sections.set(current, buf);
      current = h[1].trim();
      buf = [];
    } else if (current) {
      buf.push(raw);
    }
  }
  if (current) sections.set(current, buf);
  return sections;
}

function bulletItems(lines: string[]): string[] {
  return lines
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim())
    .filter(Boolean);
}

function parseBotServiceLine(line: string): HeartbeatBotService {
  const m = line.match(/^\[(.)\]\s*([^:]+?)\s*:\s*(.*)$/);
  if (!m) return { name: line, ok: false, note: "" };
  const mark = m[1];
  return {
    name: m[2].trim(),
    ok: mark === "x" || mark === "X",
    note: m[3].trim(),
  };
}

export async function parseHeartbeat(profile: Profile): Promise<HeartbeatSummary> {
  const path = join(profile.agent_root, profile.heartbeat_path);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return {
      lastRun: null,
      status: "unknown",
      nextScheduled: null,
      pendingAttention: [],
      botServices: [],
      errors: [],
    };
  }
  const { body, fm } = parseFrontmatter(text);
  const sections = splitSections(body);

  const status = ((): HeartbeatStatus => {
    const raw = fm.status?.toLowerCase();
    if (raw === "ok" || raw === "warn" || raw === "error") return raw;
    return "unknown";
  })();

  const pendingAttention = bulletItems(sections.get("Pending Your Attention") ?? []);
  const errors = bulletItems(sections.get("Errors (last 24h)") ?? []).filter(
    (e) => e.toLowerCase() !== "n/a",
  );
  const botServices = bulletItems(sections.get("Bot Services") ?? []).map(parseBotServiceLine);

  return {
    lastRun: fm.last_run ?? null,
    status,
    nextScheduled: fm.next_scheduled ?? null,
    pendingAttention,
    botServices,
    errors,
  };
}
