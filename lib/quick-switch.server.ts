// Server-side ⌘P union over projects + artifacts + runs. Kept separate from
// the pure lib/quick-switch.ts so the client palette can import the scorer
// without pulling `server-only`/getDb. Recency = the SQLite updated_at /
// created_at columns (no decay function — open-design RecentProjectsStrip
// philosophy). SQLite TIMESTAMP strings are UTC-normalized via the documented
// 4.5 idiom (mirrors app/(dashboard)/runs/page.tsx:23).
import "server-only";

import { getDb } from "@/lib/db";
import { baseName, type SwitchTarget, scoreMatch } from "@/lib/quick-switch";

const RESULT_CAP = 50;

/** `YYYY-MM-DD HH:MM:SS`(Z?) → epoch ms (UTC). 0 on unparseable. */
function sqliteMs(s: string): number {
  const ms = Date.parse(s.replace(" ", "T") + (s.endsWith("Z") ? "" : "Z"));
  return Number.isNaN(ms) ? 0 : ms;
}

interface Entry {
  t: SwitchTarget;
  recency: number;
}

/**
 * Unioned switch targets for a profile. Empty `q` → recency DESC (interleaved
 * across types), cap 50. Non-empty `q` → keep score>0, sort score DESC then
 * recency DESC, cap 50. Bounded queries (projects/artifacts ≤200, runs ≤100).
 */
export function searchSwitchTargets(profileId: string, q: string): SwitchTarget[] {
  const db = getDb();
  const qlc = q.trim().toLowerCase();

  const projects = db
    .prepare(
      "SELECT id, name, updated_at FROM projects WHERE profile_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 200",
    )
    .all(profileId) as { id: string; name: string; updated_at: number }[];

  const artifacts = db
    .prepare(
      "SELECT artifact_id, label, path, mime, created_at FROM artifacts WHERE profile_id = ? ORDER BY created_at DESC LIMIT 200",
    )
    .all(profileId) as {
    artifact_id: string;
    label: string | null;
    path: string;
    mime: string;
    created_at: string;
  }[];

  const runs = db
    .prepare(
      "SELECT run_id, title, skill_name, status, created_at FROM runs WHERE profile_id = ? ORDER BY created_at DESC LIMIT 100",
    )
    .all(profileId) as {
    run_id: string;
    title: string | null;
    skill_name: string | null;
    status: string;
    created_at: string;
  }[];

  const entries: Entry[] = [];

  for (const p of projects) {
    entries.push({
      t: {
        type: "project",
        id: p.id,
        label: p.name,
        sublabel: "project",
        score: qlc ? scoreMatch(p.name, qlc) : 0,
      },
      recency: p.updated_at,
    });
  }
  for (const a of artifacts) {
    const label = a.label ?? baseName(a.path);
    entries.push({
      t: {
        type: "artifact",
        id: a.artifact_id,
        label,
        sublabel: a.mime,
        score: qlc ? scoreMatch(label, qlc) : 0,
      },
      recency: sqliteMs(a.created_at),
    });
  }
  for (const r of runs) {
    const label = r.title ?? r.skill_name ?? r.run_id;
    entries.push({
      t: {
        type: "run",
        id: r.run_id,
        label,
        sublabel: r.status,
        score: qlc ? scoreMatch(label, qlc) : 0,
      },
      recency: sqliteMs(r.created_at),
    });
  }

  const ordered = qlc
    ? entries
        .filter((e) => e.t.score > 0)
        .sort((a, b) => b.t.score - a.t.score || b.recency - a.recency)
    : entries.sort((a, b) => b.recency - a.recency);

  return ordered.slice(0, RESULT_CAP).map((e) => e.t);
}
