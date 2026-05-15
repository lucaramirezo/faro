import Link from "next/link";
import { NewRunForm } from "@/components/runs/NewRunForm";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/lib/db";
import { getProfile } from "@/lib/profiles";
import { scanSkills } from "@/lib/skills/parser";
import type { Skill } from "@/lib/skills/types";

export const dynamic = "force-dynamic";

interface RunRow {
  run_id: string;
  status: string;
  skill_name: string | null;
  created_at: string;
  cost_usd: number | null;
}

// 4.5 lesson: SQLite TIMESTAMP read-back needs UTC normalization. Our engine
// writes ISO-with-Z so this is a no-op, but reconcile/default rows may not be.
function fmtTs(s: string | null): string {
  if (!s) return "—";
  const ms = Date.parse(s.replace(" ", "T") + (s.endsWith("Z") ? "" : "Z"));
  return Number.isNaN(ms) ? s : new Date(ms).toLocaleString();
}

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; skill?: string }>;
}) {
  const sp = await searchParams;
  const profile = getProfile();

  const skills = await scanSkills({ agentRoot: profile.agent_root }).catch((err) => {
    console.error("[faro] runs: skill scan failed", err);
    return [] as Skill[];
  });
  const importedSkills = skills
    .filter((s) => s.scope === "imported")
    .map((s) => ({ name: s.name, description: s.description }));

  const runs = getDb()
    .prepare(
      `SELECT run_id, status, skill_name, created_at, cost_usd
         FROM runs WHERE profile_id = ? ORDER BY created_at DESC LIMIT 100`,
    )
    .all(profile.profile) as RunRow[];

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Runs</h1>
        <p className="text-sm text-muted-foreground">
          Launch a Claude Code run via the Agent SDK, watch it live, gate it inline. Runs are
          crash-safe — closing the browser or restarting faro replays the journal.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm uppercase tracking-wider font-medium text-muted-foreground">
          New generation run
        </h2>
        <NewRunForm skills={importedSkills} defaultSkill={sp.skill} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm uppercase tracking-wider font-medium text-muted-foreground">
          Recent <span className="text-muted-foreground/60">({runs.length})</span>
        </h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {runs.map((r) => (
              <li key={r.run_id}>
                <Link
                  href={`/runs/${r.run_id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/40"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {r.status}
                    </Badge>
                    <span className="font-mono text-xs truncate">{r.run_id}</span>
                    {r.skill_name && (
                      <span className="text-xs text-muted-foreground truncate">
                        · {r.skill_name}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {r.cost_usd != null ? `$${r.cost_usd.toFixed(4)} · ` : ""}
                    {fmtTs(r.created_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
