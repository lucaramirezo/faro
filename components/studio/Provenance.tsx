import type { Artifact } from "@/lib/artifacts-types";
import { getDb } from "@/lib/db";

/**
 * Provenance pane — shows what produced the artifact.
 *
 * v1: artifact metadata + (if run_id is non-null and the pipeline_runs row
 * exists) model / cost / duration columns. The PRD §6.6 spec calls for tool-
 * call streaming from the jsonl session file — deferred to a follow-up
 * because it requires the jsonl reader API.
 */

interface PipelineRunRow {
  run_id: string;
  model?: string | null;
  cost_usd?: number | null;
  duration_ms?: number | null;
  started_at?: string | null;
}

interface ProvenanceProps {
  artifact: Artifact;
}

export function Provenance({ artifact }: ProvenanceProps) {
  let run: PipelineRunRow | null = null;
  if (artifact.run_id) {
    const db = getDb();
    // Guard against the pipeline_runs table being absent in older DBs (the
    // artifacts table FK references it, so its presence is normally a given).
    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pipeline_runs'")
      .get() as { name: string } | undefined;
    if (tableExists) {
      // Explicit column list — surfaces a clear column error if the schema
      // drifts, rather than swallowing it under a blanket try/catch.
      run =
        (db
          .prepare(
            "SELECT run_id, model, cost_usd, duration_ms, started_at FROM pipeline_runs WHERE run_id = ? LIMIT 1",
          )
          .get(artifact.run_id) as PipelineRunRow | undefined) ?? null;
    }
  }

  return (
    <div className="p-4 space-y-4 text-xs">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold tracking-tight">Provenance</h3>
        <p className="text-[11px] text-muted-foreground">
          What produced this artifact, on-disk + DB metadata.
        </p>
      </header>

      <Section title="Artifact">
        <Row label="id" value={artifact.artifact_id} mono />
        <Row label="mime" value={artifact.mime} mono />
        <Row label="emitter" value={artifact.emitter ?? "—"} />
        <Row label="source" value={artifact.source} />
        <Row label="bytes" value={formatBytes(artifact.bytes)} mono />
        <Row label="created" value={formatStamp(artifact.created_at)} mono />
        {artifact.promoted_at && (
          <Row label="promoted" value={formatStamp(artifact.promoted_at)} mono />
        )}
        <Row label="run_id" value={artifact.run_id ?? "—"} mono />
      </Section>

      {run && (
        <Section title="Pipeline run">
          {run.model && <Row label="model" value={run.model} mono />}
          {run.cost_usd != null && <Row label="cost" value={`$${run.cost_usd.toFixed(4)}`} mono />}
          {run.duration_ms != null && (
            <Row label="duration" value={formatDuration(run.duration_ms)} mono />
          )}
          {run.started_at && <Row label="started" value={formatStamp(run.started_at)} mono />}
        </Section>
      )}

      <Section title="Path">
        <p className="font-mono text-[11px] text-muted-foreground break-all leading-snug">
          {artifact.path}
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</h4>
      <dl className="space-y-1">{children}</dl>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-muted-foreground shrink-0 w-20">{label}</dt>
      <dd className={mono ? "font-mono text-[11px] tabular-nums break-all" : "tabular-nums"}>
        {value}
      </dd>
    </div>
  );
}

function formatStamp(iso: string): string {
  return iso.replace(/:\d{2}(\.\d+)?(?:Z)?$/, "").replace("T", " ");
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const r = Math.round(sec - min * 60);
  return `${min}m ${r}s`;
}
