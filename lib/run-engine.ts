import "server-only";

import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { query, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { ensureOAuthAuth, getClaudeCodePath } from "@/lib/agent-sdk";
import { getDb } from "@/lib/db";
import { extractHtml } from "@/lib/extract-html";
import { getProfile } from "@/lib/profiles";
import { isTerminalKind, mkRunId, type RunEvent, type RunEventBody } from "@/lib/run-events";
import { appendEvent, journalPath, readJournalAfter } from "@/lib/run-journal";

/**
 * P1 Control Station run engine. Built strictly ON TOP OF the Phase 4.5
 * lib/agent-sdk.ts:streamChat pattern (kept, not rebuilt — PRD decision 25),
 * reusing its exported auth/abort helpers verbatim.
 *
 * Locked gate decisions (acceptance round 2026-05-15, do not re-litigate):
 *  - Q3: setup-token auth unchanged + default-deny `canUseTool` (no allowlist).
 *  - N1: cancel + resume-replay. A gated tool is DENIED in canUseTool (the
 *    SDK 0.2.140 deny WITHOUT `interrupt` cancels just the tool, the turn ends
 *    naturally — verified, see plan NOTES). On operator answer the session is
 *    RESUMED (Options.resume = session_id) with a continuation message; the
 *    journal replays prior events to any reconnecting client via ?after_seq=.
 *  - Q2: the engine is the SINGLE journal writer; the SSE route only tails.
 *
 * Design note (implements the plan's crash-safe-gated-resume intent — NOT a
 * re-decision): `run_started` (seq 0) is journaled by streamRun on the FIRST
 * SDK message, carrying the REAL session_id. createRun only upserts the runs
 * row + kicks the background drain. This keeps the journal self-describing so
 * `reconcileRunsFromJournals` recovers session_id after a restart and a gated
 * run is still resumable (acceptance criterion). recordCall is deliberately
 * NOT called — Max-sub OAuth absorbs run cost (mirrors agent-sdk.ts:194-196).
 */

// Mirror of agent-sdk.ts SONNET_MODEL (that const is module-private; Task 2
// only exported the 3 helpers — do not widen agent-sdk.ts further).
const RUN_MODEL = "claude-sonnet-4-6" as const;

// Locked: default 16, env-overridable. Exceeding ⇒ SDK result subtype
// `error_max_turns` ⇒ terminal `error` event (verified, plan NOTES).
const MAX_TURNS = Number.parseInt(process.env.FARO_RUN_MAX_TURNS ?? "", 10) || 16;

/**
 * Single-shot prompt as a 1-message async iterable.
 *
 * WHY (verified against installed @anthropic-ai/claude-agent-sdk@0.2.140
 * source): a bare *string* `prompt` makes the SDK write one user message to
 * the CLI's stdin socket but NEVER call `endInput()` — it only closes stdin
 * reactively, *after* a first `result` arrives (`isSingleUserTurn` branch,
 * `sdk.mjs` ~313809). The CLI (always spawned `--input-format stream-json`,
 * `sdk.mjs` ~299830) waits for stdin EOF / control frames before completing
 * the turn; with `canUseTool` (agent mode → `--permission-prompt-tool stdio`)
 * it provably won't emit that first `result` until it gets stdin frames →
 * circular deadlock (observed live on pei: CLI in ep_poll on the stdin
 * socket, 0 CPU, no transcript, run stuck forever).
 *
 * The async-iterable prompt path routes through `Query.streamInput`, which
 * calls `transport.endInput()` once the iterable completes (`sdk.mjs`
 * ~323470) — proactively closing stdin so the turn runs to completion. The
 * yielded shape matches exactly what the SDK's own string branch builds
 * (`sdk.mjs` pz@849296). Covers initial AND resume (resolveGate) turns.
 *
 * NOTE: agent-sdk.ts:streamChat/rerunClaim carry the same latent SDK quirk
 * but do NOT deadlock (no canUseTool ⇒ no bidirectional need) and are LOCKED
 * 4.5 surfaces (Q1: byte-for-byte unchanged) — deliberately NOT modified.
 */
async function* singleUserMessage(text: string): AsyncGenerator<SDKUserMessage> {
  yield {
    type: "user",
    session_id: "",
    parent_tool_use_id: null,
    message: { role: "user", content: [{ type: "text", text }] },
  };
}

export type RunMode = "agent" | "generation";

export interface CreateRunInput {
  mode: RunMode;
  /** Agent mode: the operator's task prompt. Generation mode: the assembled
   *  generation prompt (directives + skill brief + content). */
  prompt: string;
  systemPrompt?: string;
  skillName?: string;
  signal?: AbortSignal;
}

interface StreamRunInput extends CreateRunInput {
  runId: string;
  /** SDK session id to resume (gate continuation). Omitted on the first turn. */
  resumeSessionId?: string;
}

// ---------------------------------------------------------------------------
// seq counter + single-writer journal sink
// ---------------------------------------------------------------------------

// Per-run next-seq, seeded from runs.last_seq so resumed turns (and post-crash
// reconciled rows) stay strictly monotonic. Process-local; reconcile rebuilds
// runs.last_seq from the journal on boot so the seed is correct after restart.
const _nextSeq = new Map<string, number>();

function nextSeq(runId: string): number {
  let n = _nextSeq.get(runId);
  if (n === undefined) {
    const row = getDb().prepare("SELECT last_seq FROM runs WHERE run_id = ?").get(runId) as
      | { last_seq: number }
      | undefined;
    n = row && row.last_seq >= 0 ? row.last_seq + 1 : 0;
  }
  _nextSeq.set(runId, n + 1);
  return n;
}

const FSYNC_KINDS = new Set(["approval", "clarify", "gate_resolved"]);

function tsToSql(ms: number): string {
  // UTC ISO (ends with Z) so the 4.5 read-back normalizer is a no-op.
  return new Date(ms).toISOString();
}

/**
 * The ONE place run events are written. Stamps the envelope, fsyncs the
 * durability-critical events (first / gate / terminal), appends to the JSONL
 * journal (source of truth) and updates the runs/run_events index. Returns the
 * enveloped event so streamRun can yield it to a direct consumer/test.
 */
function journalEvent(runId: string, body: RunEventBody): RunEvent {
  const seq = nextSeq(runId);
  const terminal = isTerminalKind(body.kind);
  const ev = { run_id: runId, seq, ts: Date.now(), terminal, ...body } as RunEvent;
  const fsync = seq === 0 || terminal || FSYNC_KINDS.has(body.kind);
  appendEvent(runId, ev, { fsync });

  const db = getDb();
  const sqlTs = tsToSql(ev.ts);
  const tx = db.transaction(() => {
    // FK-safe even if journalEvent runs before createRun's upsert.
    db.prepare(
      `INSERT OR IGNORE INTO runs (run_id, profile_id, status, journal_path, created_at)
       VALUES (?, ?, 'running', ?, ?)`,
    ).run(runId, getProfile().profile, journalPath(runId), sqlTs);
    db.prepare(
      "INSERT OR IGNORE INTO run_events (run_id, seq, kind, ts, payload) VALUES (?, ?, ?, ?, ?)",
    ).run(runId, seq, body.kind, sqlTs, JSON.stringify(ev));
    db.prepare("UPDATE runs SET last_seq = ? WHERE run_id = ?").run(seq, runId);

    switch (body.kind) {
      case "run_started":
        db.prepare(
          `UPDATE runs SET session_id = ?, skill_name = COALESCE(?, skill_name),
             status = 'running' WHERE run_id = ?`,
        ).run(body.session_id || null, body.skill_name ?? null, runId);
        break;
      case "status":
        db.prepare("UPDATE runs SET status = ? WHERE run_id = ?").run(body.status, runId);
        break;
      case "approval":
        db.prepare("UPDATE runs SET status = 'awaiting_approval' WHERE run_id = ?").run(runId);
        break;
      case "clarify":
        db.prepare("UPDATE runs SET status = 'awaiting_clarify' WHERE run_id = ?").run(runId);
        break;
      case "usage":
        db.prepare("UPDATE runs SET cost_usd = ? WHERE run_id = ?").run(body.costUsd, runId);
        break;
      case "done":
        db.prepare(
          `UPDATE runs SET status = 'done', ended_at = ?, cost_usd = ?,
             session_id = COALESCE(?, session_id) WHERE run_id = ?`,
        ).run(sqlTs, body.costUsd, body.session_id || null, runId);
        break;
      case "cancelled":
        db.prepare("UPDATE runs SET status = 'cancelled', ended_at = ? WHERE run_id = ?").run(
          sqlTs,
          runId,
        );
        break;
      case "error":
        db.prepare("UPDATE runs SET status = 'failed', ended_at = ? WHERE run_id = ?").run(
          sqlTs,
          runId,
        );
        break;
      default:
        break; // token / tool_use / tool_result / gate_resolved → last_seq only
    }
  });
  tx();
  return ev;
}

function mkGateId(): string {
  return `gate_${Date.now()}_${randomBytes(3).toString("hex")}`;
}

/** Local-TZ YYYY-MM-DD (EMITTER-GUIDE §1 path layout uses local date). */
function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * §6.9/Q5: generation v1 has tools OFF — the single-file HTML is recovered
 * from the streamed assistant TEXT via the extract-html ladder (NOT a Write
 * tool) and written where `scanArtifacts` indexes it. It is then served
 * UNCHANGED through the existing /studio/raw `allow-scripts`-only CSP route.
 */
function writeGeneratedHtml(runId: string, streamed: string): string {
  const html = extractHtml(streamed);
  const dir = join(getProfile().agent_root, "drafts", "artifacts", localDate(), runId);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "generated.html");
  writeFileSync(file, html);
  return file;
}

// ---------------------------------------------------------------------------
// SDK message → RunEvent body mappers (duplicated from agent-sdk.ts block
// scanners, re-shaped to the `kind` discriminant — Q1: disjoint from
// ChatSSEEvent).
// ---------------------------------------------------------------------------

interface BetaContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

function* assistantBodies(
  message: unknown,
): Generator<Extract<RunEventBody, { kind: "token" | "tool_use" }>> {
  const content = (message as { content?: BetaContentBlock[] } | undefined)?.content ?? [];
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string" && block.text.length > 0) {
      yield { kind: "token", text: block.text };
    } else if (block.type === "tool_use" && block.id && block.name) {
      yield { kind: "tool_use", tool: block.name, args: block.input, toolUseId: block.id };
    }
  }
}

function* toolResultBodies(
  message: unknown,
): Generator<Extract<RunEventBody, { kind: "tool_result" }>> {
  const content = (message as { content?: BetaContentBlock[] } | undefined)?.content ?? [];
  for (const block of content) {
    if (block.type === "tool_result" && block.tool_use_id) {
      yield {
        kind: "tool_result",
        toolUseId: block.tool_use_id,
        result: typeof block.content === "string" ? block.content : JSON.stringify(block.content),
        isError: block.is_error === true,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// streamRun — mirror agent-sdk.ts:streamChat (try / ensureOAuthAuth inside the
// try / for-await / catch → yield error). NEVER throws out of the generator.
// ---------------------------------------------------------------------------

export async function* streamRun(input: StreamRunInput): AsyncGenerator<RunEvent> {
  const { runId } = input;
  const started = Date.now();
  let sessionId = input.resumeSessionId ?? "";
  // A resumed (gate-continuation) turn must NOT re-emit run_started — seq 0
  // already carries the real session_id; this is a continuation, not a start.
  let startedEmitted = Boolean(input.resumeSessionId);
  let gatePending = false;
  // Generation mode accumulates assistant text for the extract-html ladder.
  let genText = "";

  const emitStartedOnce = (sid: string): RunEvent | null => {
    if (startedEmitted) return null;
    startedEmitted = true;
    sessionId = sid || sessionId;
    return journalEvent(runId, {
      kind: "run_started",
      profile_id: getProfile().profile,
      session_id: sessionId,
      model: RUN_MODEL,
      skill_name: input.skillName,
    });
  };

  // Hard run-timeout watchdog. A stalled/truncated turn (e.g. the model hits
  // CLAUDE_CODE_MAX_OUTPUT_TOKENS and the stream-json CLI then waits for a
  // continuation that can never arrive on the closed single-message stdin)
  // must NEVER pin a run in `running` forever or leak a claude subprocess.
  // Aborting the SDK AbortController ends the for-await → catch journals a
  // terminal error → run marked failed and the CLI exits.
  const incoming = input.signal;
  const ac = new AbortController();
  if (incoming) {
    if (incoming.aborted) ac.abort(incoming.reason);
    else incoming.addEventListener("abort", () => ac.abort(incoming.reason), { once: true });
  }
  const RUN_TIMEOUT_MS = Number.parseInt(process.env.FARO_RUN_TIMEOUT_MS ?? "", 10) || 900_000;
  let timedOut = false;
  const watchdog = setTimeout(() => {
    timedOut = true;
    ac.abort(new Error(`run exceeded FARO_RUN_TIMEOUT_MS (${RUN_TIMEOUT_MS}ms)`));
  }, RUN_TIMEOUT_MS);

  try {
    ensureOAuthAuth(); // MUST stay inside try (4.5 async-generator lesson).

    // Agent mode → default-deny gate (Q3/N1). Generation mode → tools OFF,
    // no canUseTool, HTML recovered from streamed text (documented v1
    // simplification). canUseTool is the installed 3-arg signature.
    const canUseTool =
      input.mode === "agent"
        ? async (
            toolName: string,
            toolInput: Record<string, unknown>,
            _opts: { toolUseID: string; signal: AbortSignal },
          ): Promise<
            | { behavior: "allow"; updatedInput: Record<string, unknown> }
            | { behavior: "deny"; message: string }
          > => {
            gatePending = true;
            journalEvent(runId, {
              kind: "approval",
              gateId: mkGateId(),
              tool: toolName,
              args: toolInput,
            });
            // Deny WITHOUT `interrupt` ⇒ only this tool is cancelled; the turn
            // ends naturally, process untouched (SDK 0.2.140, plan NOTES).
            return {
              behavior: "deny",
              message:
                "Awaiting operator approval in faro; the run will resume after the operator answers.",
            };
          }
        : undefined;

    const q = query({
      // 1-message async iterable, NOT a bare string — forces the SDK to
      // endInput()/close the CLI stdin so a backgrounded run actually starts
      // (see singleUserMessage doc; fixes the pei stream-json deadlock).
      prompt: singleUserMessage(input.prompt),
      options: {
        model: RUN_MODEL,
        ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
        // maxTurns = MAX_TURNS for BOTH modes. Empirically the only runs that
        // got past the SDK↔CLI stream-json startup handshake on pei used
        // --max-turns 16; introducing --max-turns 1 for generation correlated
        // with the pre-start ep_poll wedge returning. A long page still
        // completes in ONE turn because CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000
        // (faro.service env) lets it end with end_turn — the raised turn budget
        // is just unused headroom, not extra turns.
        maxTurns: MAX_TURNS,
        abortController: ac,
        pathToClaudeCodeExecutable: getClaudeCodePath(),
        // Capture the spawned CLI's --verbose diagnostics (faro previously
        // discarded child stderr to /dev/null — that was the missing signal
        // for every startup-wedge investigation). Goes to journalctl.
        stderr: (data: string) => {
          const s = data.toString().trim();
          if (s) console.error(`[faro] run-engine[${runId}] claude stderr: ${s}`);
        },
        ...(input.resumeSessionId ? { resume: input.resumeSessionId } : {}),
        ...(input.mode === "generation" ? { allowedTools: [] } : {}),
        ...(canUseTool ? { canUseTool } : {}),
      },
    });

    for await (const m of q as AsyncIterable<SDKMessage>) {
      if (m.type === "system") {
        // system 'init' carries session_id; 'permission_denied' accompanies a
        // canUseTool deny — both tolerated, neither is fatal (plan NOTES).
        const sid = (m as { session_id?: string }).session_id;
        if (sid) {
          const ev = emitStartedOnce(sid);
          if (ev) yield ev;
        }
      } else if (m.type === "assistant") {
        const sid = m.session_id || sessionId;
        const startedEv = emitStartedOnce(sid);
        if (startedEv) yield startedEv;
        sessionId = sid || sessionId;
        for (const body of assistantBodies(m.message)) {
          if (input.mode === "generation" && body.kind === "token") genText += body.text;
          yield journalEvent(runId, body);
        }
        // A hard assistant error (e.g. `max_output_tokens` — the model's
        // single-turn output cap) is terminal: after it the stream-json CLI
        // would otherwise wait forever for a continuation. Recover any partial
        // HTML, journal a terminal error, and abort so the CLI exits.
        const aerr = (m as { error?: string }).error;
        if (aerr) {
          if (input.mode === "generation" && genText) {
            try {
              const p = writeGeneratedHtml(runId, genText);
              console.log(
                `[faro] run-engine: wrote PARTIAL artifact ${p} (assistant error ${aerr})`,
              );
            } catch {
              /* partial write best-effort */
            }
          }
          yield journalEvent(runId, {
            kind: "error",
            code: aerr,
            message:
              aerr === "max_output_tokens"
                ? "model output hit the per-turn cap — raise CLAUDE_CODE_MAX_OUTPUT_TOKENS on faro.service or shorten the skill brief (partial HTML saved if any)"
                : `assistant error: ${aerr}`,
          });
          ac.abort(new Error(aerr));
          break;
        }
      } else if (m.type === "user") {
        for (const body of toolResultBodies((m as { message?: unknown }).message)) {
          yield journalEvent(runId, body);
        }
      } else if (m.type === "result") {
        if (m.subtype === "success") {
          yield journalEvent(runId, {
            kind: "usage",
            costUsd: m.total_cost_usd ?? 0,
            inputTokens: m.usage?.input_tokens ?? 0,
            outputTokens: m.usage?.output_tokens ?? 0,
          });
          if (gatePending) {
            // Run is PAUSED at a gate — no terminal event; resolveGate resumes.
            yield journalEvent(runId, { kind: "status", status: "awaiting_approval" });
          } else {
            if (input.mode === "generation") {
              try {
                const p = writeGeneratedHtml(runId, genText);
                console.log(`[faro] run-engine: wrote generated artifact ${p}`);
              } catch (werr) {
                yield journalEvent(runId, {
                  kind: "error",
                  message: `generation artifact write failed: ${
                    werr instanceof Error ? werr.message : String(werr)
                  }`,
                });
                break;
              }
            }
            yield journalEvent(runId, {
              kind: "done",
              costUsd: m.total_cost_usd ?? 0,
              durationMs: m.duration_ms ?? Date.now() - started,
              session_id: sessionId,
            });
          }
        } else {
          const subtype = (m as { subtype: string }).subtype;
          yield journalEvent(runId, {
            kind: "error",
            message: `SDK error: ${subtype}`,
            code: subtype,
          });
        }
      }
    }
  } catch (err) {
    yield journalEvent(runId, {
      ...(timedOut ? { code: "timeout" } : {}),
      kind: "error",
      message: timedOut
        ? "run aborted: exceeded FARO_RUN_TIMEOUT_MS with no terminal result — the turn stalled (commonly the model output truncated at CLAUDE_CODE_MAX_OUTPUT_TOKENS)"
        : err instanceof Error
          ? err.message
          : String(err),
    });
  } finally {
    clearTimeout(watchdog);
  }
}

/** Background drain — the single writer runs the generator to completion;
 *  every event is journaled inside streamRun via journalEvent. Errors are
 *  already converted to a terminal `error` event inside streamRun; this outer
 *  guard only prevents an unhandled rejection from the detached promise. */
async function consumeRun(input: StreamRunInput): Promise<void> {
  try {
    for await (const _ev of streamRun(input)) {
      void _ev;
    }
  } catch (err) {
    console.error(
      `[faro] run-engine: consumeRun(${input.runId}) crashed:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Create a run: upsert the runs row (FK anchor + RSC list visibility), kick
 * the background drain, return immediately. The journal (written by streamRun)
 * is the source of truth; the SSE route tails it.
 */
export function createRun(input: CreateRunInput): { runId: string } {
  const runId = mkRunId();
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO runs
       (run_id, profile_id, status, skill_name, journal_path, created_at, last_seq)
     VALUES (?, ?, 'running', ?, ?, ?, -1)`,
  ).run(
    runId,
    getProfile().profile,
    input.skillName ?? null,
    journalPath(runId),
    tsToSql(Date.now()),
  );
  void consumeRun({ ...input, runId });
  return { runId };
}

export interface ResolveGateInput {
  runId: string;
  gateId: string;
  /** "deny"/"reject" cancels the run terminally; anything else (incl. a
   *  free-text clarify answer) resumes the SDK session. */
  decision: string;
}

/**
 * Resolve a pending gate. Journals `gate_resolved` (fsync), then either
 * terminally cancels the run or RESUMES the SDK session (Options.resume) with
 * a continuation message — seq continues from runs.last_seq+1 (monotonic
 * across the resumed turn, robust to a restart between gate and answer).
 */
export function resolveGate(input: ResolveGateInput): { resumed: boolean } {
  const { runId, gateId, decision } = input;
  journalEvent(runId, { kind: "gate_resolved", gateId, decision });

  const denied = ["deny", "reject", "no"].includes(decision.trim().toLowerCase());
  if (denied) {
    journalEvent(runId, { kind: "cancelled", reason: `operator denied gate ${gateId}` });
    return { resumed: false };
  }

  const row = getDb().prepare("SELECT session_id FROM runs WHERE run_id = ?").get(runId) as
    | { session_id: string | null }
    | undefined;
  const sessionId = row?.session_id;
  if (!sessionId) {
    journalEvent(runId, {
      kind: "error",
      message: `cannot resume run ${runId}: no session_id recorded for gate ${gateId}`,
    });
    return { resumed: false };
  }

  // Build the continuation from the original gate event (approval vs clarify).
  const gateEv = readJournalAfter(runId, Number.NEGATIVE_INFINITY).find(
    (e) =>
      (e.kind === "approval" || e.kind === "clarify") &&
      (e as { gateId?: string }).gateId === gateId,
  );
  const continuation =
    gateEv?.kind === "clarify"
      ? `Operator answered the clarification for gate ${gateId}: ${decision}`
      : `Operator approved the previously requested action (gate ${gateId}). Continue.`;

  journalEvent(runId, { kind: "status", status: "running" });
  void consumeRun({
    mode: "agent",
    runId,
    prompt: continuation,
    resumeSessionId: sessionId,
  });
  return { resumed: true };
}
