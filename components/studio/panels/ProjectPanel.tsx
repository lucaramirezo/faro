"use client";

// Minimal P2 project surface (locked scope: read-only, no global active-
// project filter — that's P3). Fetches /api/projects/[id]; lists the
// project's runs (click → open a Run panel) and artifacts (click →
// /studio/<id>, which rebinds the single Artifact panel). Rows arrive from
// the API, never queried client-side directly.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface ProjectRow {
  id: string;
  name: string;
  status: string;
  created_at: number;
  updated_at: number;
}
interface RunRow {
  run_id: string;
  status: string;
  skill_name: string | null;
  created_at: string;
  cost_usd: number | null;
}
interface ArtifactRow {
  artifact_id: string;
  label: string | null;
  path: string;
  mime: string;
  created_at: string;
}
interface ProjectDetail {
  project: ProjectRow;
  runs: RunRow[];
  artifacts: ArtifactRow[];
}

export function ProjectPanel({
  projectId,
  onOpenRun,
}: {
  projectId: string;
  onOpenRun: (runId: string) => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    fetch(`/api/projects/${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<ProjectDetail>) : Promise.reject(r.status)))
      .then((d) => live && setData(d))
      .catch((e) => live && setError(`Could not load project (${e}).`));
    return () => {
      live = false;
    };
  }, [projectId]);

  if (error) {
    return <div className="p-6 text-sm text-destructive">{error}</div>;
  }
  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">Loading project…</div>;
  }

  return (
    <div className="h-full overflow-auto p-5">
      <header className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">{data.project.name}</h2>
        <p className="text-xs text-muted-foreground">
          {data.runs.length} run(s) · {data.artifacts.length} artifact(s) · {data.project.status}
        </p>
      </header>

      <section className="mb-6">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Runs
        </h3>
        <div className="space-y-2">
          {data.runs.length === 0 && (
            <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              No runs in this project yet.
            </p>
          )}
          {data.runs.map((r) => (
            <button
              key={r.run_id}
              type="button"
              onClick={() => onOpenRun(r.run_id)}
              className="block w-full rounded-md border border-border bg-card p-3 text-left text-sm hover:border-ring hover:bg-accent/40"
            >
              <div className="truncate font-mono text-xs text-muted-foreground">{r.run_id}</div>
              <div className="mt-1 flex items-center justify-between">
                <span className="truncate font-medium">{r.skill_name ?? "—"}</span>
                <span className="text-xs text-muted-foreground">{r.status}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Artifacts
        </h3>
        <div className="space-y-2">
          {data.artifacts.length === 0 && (
            <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              No artifacts in this project yet.
            </p>
          )}
          {data.artifacts.map((a) => (
            <button
              key={a.artifact_id}
              type="button"
              onClick={() => router.push(`/studio/${a.artifact_id}`)}
              className="block w-full rounded-md border border-border bg-card p-3 text-left text-sm hover:border-ring hover:bg-accent/40"
            >
              <div className="truncate font-medium">
                {a.label ?? a.path.split("/").pop() ?? a.artifact_id}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{a.mime}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
