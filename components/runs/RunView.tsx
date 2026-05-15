"use client";

import { useEffect, useReducer, useRef } from "react";
import { type ActiveGate, GatePrompt } from "@/components/runs/GatePrompt";

/**
 * Live run view. Mirrors components/studio/Chat.tsx readSSE() verbatim (Q1 —
 * same data-only `data: <json>\n\n` wire). Reduces RunEvent by `kind`,
 * dedupes by `seq` (replay is at-least-once), renders tokens / tool cards /
 * the inline gate. Reconnects with the last seen `seq` so a closed browser or
 * a faro restart replays the journal and the run is recoverable (acceptance
 * criterion). Self-contained so P2 can embed it as a Dockview panel unchanged.
 */

interface ToolCard {
  toolUseId: string;
  name: string;
  args: unknown;
  result?: string;
  isError?: boolean;
}

interface RunState {
  status: string;
  model: string | null;
  sessionId: string | null;
  skillName: string | null;
  transcript: string;
  tools: Record<string, ToolCard>;
  toolOrder: string[];
  gate: ActiveGate | null;
  usage: { costUsd: number; inputTokens: number; outputTokens: number } | null;
  terminal: "done" | "error" | "cancelled" | null;
  errorMsg: string | null;
}

type RunEvt = {
  run_id: string;
  seq: number;
  ts: number;
  terminal: boolean;
  kind: string;
  [k: string]: unknown;
};

const INITIAL: RunState = {
  status: "queued",
  model: null,
  sessionId: null,
  skillName: null,
  transcript: "",
  tools: {},
  toolOrder: [],
  gate: null,
  usage: null,
  terminal: null,
  errorMsg: null,
};

function reduce(state: RunState, ev: RunEvt): RunState {
  switch (ev.kind) {
    case "run_started":
      return {
        ...state,
        status: "running",
        model: (ev.model as string) ?? null,
        sessionId: (ev.session_id as string) ?? null,
        skillName: (ev.skill_name as string) ?? state.skillName,
      };
    case "status":
      return { ...state, status: ev.status as string };
    case "token":
      return { ...state, transcript: state.transcript + (ev.text as string) };
    case "tool_use": {
      const id = ev.toolUseId as string;
      return {
        ...state,
        tools: { ...state.tools, [id]: { toolUseId: id, name: ev.tool as string, args: ev.args } },
        toolOrder: state.toolOrder.includes(id) ? state.toolOrder : [...state.toolOrder, id],
      };
    }
    case "tool_result": {
      const id = ev.toolUseId as string;
      const prev = state.tools[id];
      if (!prev) return state;
      return {
        ...state,
        tools: {
          ...state.tools,
          [id]: { ...prev, result: ev.result as string, isError: ev.isError === true },
        },
      };
    }
    case "approval":
      return {
        ...state,
        status: "awaiting_approval",
        gate: {
          gateId: ev.gateId as string,
          kind: "approval",
          tool: ev.tool as string,
          args: ev.args,
        },
      };
    case "clarify":
      return {
        ...state,
        status: "awaiting_clarify",
        gate: {
          gateId: ev.gateId as string,
          kind: "clarify",
          question: ev.question as string,
        },
      };
    case "gate_resolved":
      return state.gate?.gateId === ev.gateId ? { ...state, gate: null } : state;
    case "usage":
      return {
        ...state,
        usage: {
          costUsd: (ev.costUsd as number) ?? 0,
          inputTokens: (ev.inputTokens as number) ?? 0,
          outputTokens: (ev.outputTokens as number) ?? 0,
        },
      };
    case "done":
      return { ...state, status: "done", terminal: "done" };
    case "cancelled":
      return { ...state, status: "cancelled", terminal: "cancelled" };
    case "error":
      return {
        ...state,
        status: "failed",
        terminal: "error",
        errorMsg: (ev.message as string) ?? "unknown error",
      };
    default:
      return state;
  }
}

async function readSSE(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: RunEvt) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf("\n\n");
    while (idx !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (data) {
        try {
          onEvent(JSON.parse(data) as RunEvt);
        } catch {
          // Skip malformed frames silently — the SSE producer is trusted.
        }
      }
      idx = buffer.indexOf("\n\n");
    }
  }
}

export function RunView({
  runId,
  initialAfterSeq = -1,
}: {
  runId: string;
  initialAfterSeq?: number;
}) {
  const [state, dispatch] = useReducer((s: RunState, ev: RunEvt) => reduce(s, ev), INITIAL);
  const seen = useRef<Set<number>>(new Set());
  const lastSeq = useRef<number>(initialAfterSeq);
  const terminalRef = useRef(false);

  useEffect(() => {
    let unmounted = false;
    const ctrl = new AbortController();

    async function run() {
      // Reconnect loop: a gate-paused run keeps the SSE open (no terminal);
      // a dropped connection (browser close / faro restart) reconnects with
      // the last seen seq and the journal replays the gap.
      while (!unmounted && !terminalRef.current) {
        try {
          const res = await fetch(`/api/runs/${runId}/stream?after_seq=${lastSeq.current}`, {
            signal: ctrl.signal,
          });
          if (!res.ok || !res.body) {
            throw new Error(`stream: ${res.status}`);
          }
          await readSSE(res.body, (ev) => {
            if (typeof ev.seq !== "number" || seen.current.has(ev.seq)) return;
            seen.current.add(ev.seq);
            if (ev.seq > lastSeq.current) lastSeq.current = ev.seq;
            if (ev.terminal) terminalRef.current = true;
            dispatch(ev);
          });
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
          // transient — fall through to the reconnect delay
        }
        if (unmounted || terminalRef.current) break;
        await new Promise((r) => setTimeout(r, 750));
      }
    }
    void run();
    return () => {
      unmounted = true;
      ctrl.abort();
    };
  }, [runId]);

  const tools = state.toolOrder.map((id) => state.tools[id]).filter(Boolean);

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded bg-muted/50 px-2 py-0.5 font-mono">{runId}</span>
        <StatusBadge status={state.status} />
        {state.model && <span>model: {state.model}</span>}
        {state.skillName && <span>· skill: {state.skillName}</span>}
        {state.usage && (
          <span>
            · ${state.usage.costUsd.toFixed(4)} · {state.usage.inputTokens}/
            {state.usage.outputTokens} tok
          </span>
        )}
      </div>

      {tools.length > 0 && (
        <div className="space-y-2">
          {tools.map((t) => (
            <div key={t.toolUseId} className="rounded-md border border-border p-2 text-xs">
              <p className="font-mono text-foreground/80">⚙ {t.name}</p>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
                {JSON.stringify(t.args ?? {}, null, 2)}
              </pre>
              {t.result !== undefined && (
                <pre
                  className={`mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[11px] ${
                    t.isError ? "text-destructive" : "text-foreground/70"
                  }`}
                >
                  {t.result}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {state.gate && (
        <GatePrompt
          runId={runId}
          gate={state.gate}
          onAnswered={() => {
            // optimistic clear; the journaled gate_resolved confirms via tail
            dispatch({
              run_id: runId,
              seq: -1,
              ts: Date.now(),
              terminal: false,
              kind: "gate_resolved",
              gateId: state.gate?.gateId,
            } as RunEvt);
          }}
        />
      )}

      {state.transcript && (
        <div className="whitespace-pre-wrap rounded-md border border-border bg-card p-3 leading-relaxed text-sm">
          {state.transcript}
        </div>
      )}

      {state.terminal === "error" && (
        <p className="text-xs text-destructive">[run failed: {state.errorMsg}]</p>
      )}
      {state.terminal === "cancelled" && (
        <p className="text-xs text-muted-foreground">[run cancelled]</p>
      )}
      {state.terminal === "done" && <p className="text-xs text-emerald-500">[run complete]</p>}
      {!state.terminal && !state.transcript && !tools.length && !state.gate && (
        <p className="text-xs text-muted-foreground">Waiting for the run to start…</p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "done"
      ? "bg-emerald-500/15 text-emerald-500"
      : status === "failed" || status === "cancelled"
        ? "bg-destructive/15 text-destructive"
        : status.startsWith("awaiting")
          ? "bg-amber-500/15 text-amber-500"
          : "bg-muted/60 text-foreground/70";
  return <span className={`rounded px-2 py-0.5 text-[10px] uppercase ${tone}`}>{status}</span>;
}
