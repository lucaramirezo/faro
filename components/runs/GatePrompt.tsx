"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Inline HIL gate (N1). Approve/Deny for an `approval` gate; free-text answer
 * for a `clarify` gate. POSTs /api/runs/[runId]/answer → resolveGate resumes
 * (or terminally cancels on "deny") the SDK session. Visual-only chips were
 * the 4.5 pattern; P1 makes this the live gate primitive (P3 unifies it with
 * dreams/claims). a11y: real <button type="button"> (4.5 biome lesson).
 */

export interface ActiveGate {
  gateId: string;
  kind: "approval" | "clarify";
  tool?: string;
  args?: unknown;
  question?: string;
}

export function GatePrompt({
  runId,
  gate,
  onAnswered,
}: {
  runId: string;
  gate: ActiveGate;
  onAnswered: (gateId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function send(decision: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateId: gate.gateId, decision }),
      });
      if (!res.ok) {
        throw new Error(`answer: ${res.status} ${await res.text().catch(() => "")}`);
      }
      onAnswered(gate.gateId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
      <p className="text-[10px] uppercase tracking-wide text-amber-500">
        {gate.kind === "approval" ? "Approval required" : "Clarification requested"}
      </p>
      {gate.kind === "approval" ? (
        <div className="space-y-1 text-xs">
          <p>
            The run wants to use tool <span className="font-mono">{gate.tool}</span>.
          </p>
          <pre className="max-h-40 overflow-auto rounded bg-muted/40 p-2 text-[11px] whitespace-pre-wrap">
            {JSON.stringify(gate.args ?? {}, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="space-y-2 text-xs">
          <p className="whitespace-pre-wrap">{gate.question}</p>
          <Textarea
            rows={3}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Your answer…"
            disabled={busy}
            className="resize-none text-xs"
          />
        </div>
      )}
      {error && <p className="text-[11px] text-destructive">[error: {error}]</p>}
      <div className="flex items-center gap-2">
        {gate.kind === "approval" ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => send("allow")}>
            {busy ? "…" : "Approve"}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={busy || answer.trim().length === 0}
            onClick={() => send(answer.trim())}
          >
            {busy ? "…" : "Submit answer"}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => send("deny")}
        >
          Deny &amp; cancel
        </Button>
      </div>
    </div>
  );
}
