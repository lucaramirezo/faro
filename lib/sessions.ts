import "server-only";

import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { Profile } from "@/lib/profiles";
import { resolveJsonlRoot } from "@/lib/profiles";

/**
 * Per-day session aggregation over Claude Code jsonl files.
 *
 * "focusedHours" sums consecutive-record gaps strictly under 15 minutes —
 * any gap ≥ 15 min is treated as an idle break and not counted. Day buckets
 * use the Europe/Madrid local-day boundary so a midnight-CET session lands
 * in the correct daily slot for Luca.
 */

const TZ = "Europe/Madrid";
const FOCUS_GAP_MS = 15 * 60 * 1000; // 15 minutes
const TURN_TYPES = new Set(["user", "assistant"]);
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ActivityEntry {
  date: string; // YYYY-MM-DD in Europe/Madrid
  sessionCount: number;
  turnCount: number;
  focusedHours: number;
}

export interface RawSessionRecord {
  sessionId: string;
  date: string; // YYYY-MM-DD (already bucketed to Europe/Madrid)
  type: string;
  ts: number; // epoch ms
}

function localDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("en-CA", { timeZone: TZ });
}

function parseTimestamp(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
}

/**
 * Pure aggregator — exported for test fixtures so we don't need to mock
 * the filesystem to validate the 15-min-gap rule and turn counting.
 */
export function aggregateActivity(records: RawSessionRecord[], days: number): ActivityEntry[] {
  // session_id → ordered timestamps (ms)
  const sessionsByDay = new Map<string, Map<string, number[]>>();
  // session_id → turn count (per day)
  const turnsByDay = new Map<string, Map<string, number>>();

  for (const r of records) {
    let dayMap = sessionsByDay.get(r.date);
    if (!dayMap) {
      dayMap = new Map();
      sessionsByDay.set(r.date, dayMap);
    }
    let timestamps = dayMap.get(r.sessionId);
    if (!timestamps) {
      timestamps = [];
      dayMap.set(r.sessionId, timestamps);
    }
    timestamps.push(r.ts);

    if (TURN_TYPES.has(r.type)) {
      let turnDayMap = turnsByDay.get(r.date);
      if (!turnDayMap) {
        turnDayMap = new Map();
        turnsByDay.set(r.date, turnDayMap);
      }
      turnDayMap.set(r.sessionId, (turnDayMap.get(r.sessionId) ?? 0) + 1);
    }
  }

  const entries: ActivityEntry[] = [];
  for (const [date, sessions] of sessionsByDay) {
    let focusedMs = 0;
    let turnCount = 0;
    for (const [sessionId, ts] of sessions) {
      if (ts.length < 2) {
        // Single-record session → 0 focused-ms.
      } else {
        ts.sort((a, b) => a - b);
        for (let i = 1; i < ts.length; i++) {
          const gap = ts[i] - ts[i - 1];
          if (gap < FOCUS_GAP_MS) focusedMs += gap;
        }
      }
      const turns = turnsByDay.get(date)?.get(sessionId) ?? 0;
      turnCount += turns;
    }
    entries.push({
      date,
      sessionCount: sessions.size,
      turnCount,
      focusedHours: focusedMs / (60 * 60 * 1000),
    });
  }

  // Cap to last `days` days; sort ascending.
  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (entries.length <= days) return entries;
  return entries.slice(entries.length - days);
}

async function ingestSessionFile(
  path: string,
  sinceMs: number,
  records: RawSessionRecord[],
): Promise<void> {
  const stream = createReadStream(path, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line || line[0] !== "{") continue;
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const ts = parseTimestamp(rec.timestamp);
    if (ts === null) continue;
    if (ts < sinceMs) continue;
    const sessionId = rec.sessionId;
    const type = rec.type;
    if (typeof sessionId !== "string" || typeof type !== "string") continue;
    records.push({
      sessionId,
      date: localDate(ts),
      type,
      ts,
    });
  }
}

export async function getActivityByDay({
  profile,
  days = 14,
}: {
  profile: Profile;
  days?: number;
}): Promise<ActivityEntry[]> {
  const root = resolveJsonlRoot(profile);
  const sinceMs = Date.now() - (days + 1) * DAY_MS;

  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }
  const files = entries.filter((n) => n.endsWith(".jsonl")).map((n) => join(root, n));
  const records: RawSessionRecord[] = [];
  for (const file of files) {
    try {
      await ingestSessionFile(file, sinceMs, records);
    } catch {
      // Best-effort: skip unreadable files.
    }
  }
  return aggregateActivity(records, days);
}
