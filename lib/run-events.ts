import "server-only";

import { randomBytes } from "node:crypto";

/**
 * P1 Control Station run-adapter event contract.
 *
 * Q1 (locked 2026-05-15): WRAP, not replace. `RunEvent` is a NEW discriminated
 * union with its own `kind` discriminant — deliberately disjoint from Phase 4.5
 * `ChatSSEEvent` (which uses `type`). The 4.5 streamChat / /api/chat / Chat.tsx
 * path is byte-for-byte unchanged. Runs stream from /api/runs/[runId]/stream as
 * a data-only SSE wire (`data: <json>\n\n`, no id:/event: lines), reconnect via
 * `?after_seq=` replayed from the journal.
 *
 * Envelope field set lifted (design only, MIT) from nesquena/hermes-webui
 * docs/rfcs/{hermes-run-adapter-contract,turn-journal}.md @5e518b1c:
 * monotonic `seq`, `run_id`, single `terminal` envelope (NOT a done+stream_end
 * pair). See LICENSE-third-party.md.
 */

export type RunStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "awaiting_clarify"
  | "done"
  | "failed"
  | "cancelled";

/** Common envelope every run event carries. `seq` is strictly monotonic per
 *  run across the original turn AND any resumed turns. `terminal` is true on
 *  exactly one event (the final `done` | `error` | `cancelled`). */
export interface RunEnvelope {
  run_id: string;
  seq: number;
  ts: number;
  terminal: boolean;
}

/** The discriminated payload (kind + fields) WITHOUT the envelope. The engine
 *  (single writer) stamps the envelope (run_id/seq/ts/terminal) via
 *  run-journal so `seq` stays monotonic across the original AND resumed
 *  turns. */
export type RunEventBody =
  | {
      kind: "run_started";
      profile_id: string;
      session_id: string;
      model: string;
      skill_name?: string;
    }
  | { kind: "status"; status: RunStatus }
  | { kind: "token"; text: string }
  | { kind: "tool_use"; tool: string; args: unknown; toolUseId: string }
  | { kind: "tool_result"; toolUseId: string; result: string; isError: boolean }
  | { kind: "approval"; gateId: string; tool: string; args: unknown }
  | { kind: "clarify"; gateId: string; question: string }
  | { kind: "gate_resolved"; gateId: string; decision: string }
  | { kind: "usage"; costUsd: number; inputTokens: number; outputTokens: number }
  | { kind: "done"; costUsd: number; durationMs: number; session_id: string }
  | { kind: "cancelled"; reason?: string }
  | { kind: "error"; message: string; code?: string };

export type RunEvent = RunEnvelope & RunEventBody;

export type RunEventKind = RunEventBody["kind"];

/** The three terminal kinds — exactly one terminal envelope closes a run
 *  (hermes single-terminal contract). Used by the journal/engine/SSE route to
 *  decide when to stop tailing. */
export const TERMINAL_KINDS: ReadonlySet<RunEventKind> = new Set([
  "done",
  "error",
  "cancelled",
] as const);

export function isTerminalKind(kind: RunEventKind): boolean {
  return TERMINAL_KINDS.has(kind);
}

/** Data-only SSE frame — mirrors chat/route.ts:formatSSE (no id:/event: lines,
 *  the 4.5 wire format kept identical for the new run stream). */
export function formatRunSSE(ev: RunEvent): string {
  return `data: ${JSON.stringify(ev)}\n\n`;
}

/** Run id: time-sortable prefix + 3 random bytes. Collision-safe enough for a
 *  single-operator control station; sorts lexicographically by creation time. */
export function mkRunId(): string {
  return `run_${Date.now()}_${randomBytes(3).toString("hex")}`;
}
