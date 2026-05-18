import "server-only";

import { readFileSync } from "node:fs";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { CHAT_ALLOWED_TOOLS, CHAT_DISALLOWED_TOOLS } from "@/lib/tool-policy";

// Studio Chat turn budget (single-user override of the 4.5 maxTurns:1 freeze
// — a tool-use turn must be followed by the answer turn). Env-overridable.
const CHAT_MAX_TURNS = Number(process.env.FARO_CHAT_MAX_TURNS) || 8;

/**
 * Claude Agent SDK wrapper — the ONLY entry point for Anthropic model calls
 * from faro. Two surfaces, locked Phase 4.5:
 *
 *   - rerunClaim()  : single-shot Sonnet rerun for the dreams tweak loop (B3)
 *   - streamChat()  : SSE-friendly streaming for the studio chat tab (C1)
 *
 * AUTH (do NOT change without re-reading reference_oauth_billing_leak.md):
 *
 *   - On laptop, the SDK auto-discovers Claude Code OAuth from
 *     ~/.claude/.credentials.json and bills the Max subscription. No env
 *     var is set.
 *
 *   - On pei systemd, the unit must declare:
 *         LoadCredential=claude-oauth-token:/etc/faro/credentials/claude-oauth-token
 *         UnsetEnvironment=ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN
 *         Environment=FARO_CLAUDE_OAUTH_TOKEN_FILE=${CREDENTIALS_DIRECTORY}/claude-oauth-token
 *     `loadOAuthToken()` reads the file and assigns CLAUDE_CODE_OAUTH_TOKEN
 *     before any query() call. Setting ANTHROPIC_API_KEY would flip the SDK
 *     to per-token API billing — a $1,800-in-48h incident is documented in
 *     `memory/reference_oauth_billing_leak.md`.
 *
 *   - The empty-string folklore `Environment=ANTHROPIC_API_KEY=` is BROKEN.
 *     systemd exports an empty string; SDK's `?? undefined` does not
 *     coalesce "" → 401. Use `UnsetEnvironment=` instead.
 */

const SONNET_MODEL = "claude-sonnet-4-6" as const;
const MAX_PROMPT_CHARS = 4000; // ≈ 1000 tokens; soft cap on rerun input.

// P1: getClaudeCodePath / ensureOAuthAuth / signalToController are exported
// and shared verbatim with lib/run-engine.ts (the Control Station run engine).
// Their behavior, order, and the _tokenLoadedFrom memoization MUST NOT change —
// the billing-leak guard (ensureOAuthAuth) is reused inside the engine's
// async-generator try block (feedback_faro_phase_4_5_lessons).

/**
 * Path to the Claude Code CLI binary. The Agent SDK shells out to it for
 * the underlying agentic loop. Auto-discovery via `node_modules/.../linux-
 * x64-musl/claude` fails on glibc systems (pei is glibc), so we always pass
 * `pathToClaudeCodeExecutable` explicitly. Override via FARO_CLAUDE_CODE_PATH
 * if your binary lives elsewhere.
 */
export function getClaudeCodePath(): string {
  return process.env.FARO_CLAUDE_CODE_PATH?.trim() || "/home/luca/.local/bin/claude";
}

let _tokenLoadedFrom: string | null = null;

export function ensureOAuthAuth(): void {
  // Fail fast if the API key is set — billing-leak rule. Checked on every
  // call (cheap env read) so the guard catches runtime env mutations too.
  if (process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is set; refusing to call the Agent SDK. " +
        "Faro routes all Anthropic calls through Max-sub OAuth via " +
        "CLAUDE_CODE_OAUTH_TOKEN. Unset ANTHROPIC_API_KEY (and " +
        "ANTHROPIC_AUTH_TOKEN) to proceed. See memory/reference_oauth_billing_leak.md.",
    );
  }
  // File-read is memoized — re-read only if the file path changes.
  const tokenFile = process.env.FARO_CLAUDE_OAUTH_TOKEN_FILE;
  if (tokenFile && _tokenLoadedFrom !== tokenFile) {
    try {
      const token = readFileSync(tokenFile, "utf8").trim();
      if (token) process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
      _tokenLoadedFrom = tokenFile;
    } catch (err) {
      throw new Error(
        `Failed to read FARO_CLAUDE_OAUTH_TOKEN_FILE=${tokenFile}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  // No file? Let the SDK fall back to ~/.claude/.credentials.json (laptop).
}

export interface RerunClaimInput {
  /** The current claim text (pre-rerun). */
  original: string;
  /** The user's instruction or the slash command's expanded prompt. */
  instruction: string;
  /** Optional abort signal forwarded to the underlying HTTP call. */
  signal?: AbortSignal;
}

export interface RerunClaimResult {
  proposed: string;
  durationMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

function buildRerunPrompt({ original, instruction }: RerunClaimInput): string {
  return (
    `${instruction.trim()}\n\n` +
    `Current claim:\n${original.trim()}\n\n` +
    `Constraints:\n` +
    `- Output ONLY the rewritten claim text — no preamble, no commentary, no markdown fence.\n` +
    `- Preserve the factual scope of the original; do not invent new facts.\n` +
    `- Keep length within ±20% of the original unless the instruction explicitly asks otherwise.`
  );
}

/**
 * Single-shot rerun of one claim via Sonnet. No tools, one turn.
 *
 * Throws on:
 *   - prompt exceeding MAX_PROMPT_CHARS,
 *   - SDK error result (authentication_failed / billing_error / etc.),
 *   - the assistant returning no text.
 */
export async function rerunClaim(input: RerunClaimInput): Promise<RerunClaimResult> {
  ensureOAuthAuth();
  const prompt = buildRerunPrompt(input);
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(
      `rerunClaim: prompt is ${prompt.length} chars; soft cap is ${MAX_PROMPT_CHARS}. ` +
        "Shorten the claim or the instruction.",
    );
  }
  const started = Date.now();
  const q = query({
    prompt,
    options: {
      model: SONNET_MODEL,
      maxTurns: 1,
      allowedTools: [],
      abortController: signalToController(input.signal),
      pathToClaudeCodeExecutable: getClaudeCodePath(),
    },
  });

  let proposed = "";
  let costUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const m of q as AsyncIterable<SDKMessage>) {
    if (m.type === "result") {
      if (m.subtype === "success") {
        proposed = m.result;
        costUsd = m.total_cost_usd ?? 0;
        inputTokens = m.usage?.input_tokens ?? 0;
        outputTokens = m.usage?.output_tokens ?? 0;
      } else {
        // SDKResultError variants carry the failure mode.
        throw new Error(
          `rerunClaim: SDK reported error result (${(m as { subtype: string }).subtype})`,
        );
      }
    }
  }

  proposed = proposed.trim();
  if (!proposed) {
    throw new Error("rerunClaim: Sonnet returned no text");
  }
  return {
    proposed,
    durationMs: Date.now() - started,
    costUsd,
    inputTokens,
    outputTokens,
  };
}

export function signalToController(signal: AbortSignal | undefined): AbortController | undefined {
  if (!signal) return undefined;
  const ctrl = new AbortController();
  if (signal.aborted) ctrl.abort(signal.reason);
  else signal.addEventListener("abort", () => ctrl.abort(signal.reason), { once: true });
  return ctrl;
}

/**
 * Streaming chat over the studio artifact (Phase 4.5 C1).
 *
 * Yields AG-UI-shaped envelopes so the route handler can pipe straight into
 * an SSE Response and the Chat client can render uniformly:
 *
 *   - `token`        : an incremental text chunk (one per SDK assistant text
 *                      block in v1; partial-message streaming is a Phase 5
 *                      knob via `includePartialMessages`).
 *   - `tool_use`     : Claude requested a tool. Phase 4.5 ships with
 *                      `allowedTools: []`, so this never fires in v1 — the
 *                      shape is defined for ToolCard.tsx to render when
 *                      tools graduate.
 *   - `tool_result`  : tool ran; result attached.
 *   - `done`         : final cost + duration + session id.
 *   - `error`        : SDK reported a result error.
 *
 * Auth, cost, and prompt rules are inherited from `rerunClaim`. Chat runs
 * on Max-sub OAuth (recordCall does NOT log chat rows — the subscription
 * absorbs cost, and inflating the ledger would distort /cost analytics).
 */
export type ChatSSEEvent =
  | { type: "token"; text: string }
  | { type: "tool_use"; tool: string; args: unknown; toolUseId: string }
  | { type: "tool_result"; toolUseId: string; result: string; isError: boolean }
  | { type: "done"; costUsd: number; durationMs: number; sessionId: string }
  | { type: "error"; message: string };

export interface StreamChatInput {
  /** Full system prompt — the route handler injects artifact context here. */
  systemPrompt: string;
  /** The latest user message. v1 ships single-turn; multi-turn history can be
   * threaded later via `resume` + `forkSession` from the Sessions guide. */
  userMessage: string;
  signal?: AbortSignal;
}

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

function* extractAssistantEvents(
  message: { content: BetaContentBlock[] } | unknown,
): Generator<Extract<ChatSSEEvent, { type: "token" | "tool_use" }>> {
  const content = (message as { content?: BetaContentBlock[] } | undefined)?.content ?? [];
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string" && block.text.length > 0) {
      yield { type: "token", text: block.text };
    } else if (block.type === "tool_use" && block.id && block.name) {
      yield {
        type: "tool_use",
        tool: block.name,
        args: block.input,
        toolUseId: block.id,
      };
    }
  }
}

function* extractUserToolResults(
  message: { content: BetaContentBlock[] } | unknown,
): Generator<Extract<ChatSSEEvent, { type: "tool_result" }>> {
  const content = (message as { content?: BetaContentBlock[] } | undefined)?.content ?? [];
  for (const block of content) {
    if (block.type === "tool_result" && block.tool_use_id) {
      yield {
        type: "tool_result",
        toolUseId: block.tool_use_id,
        result: typeof block.content === "string" ? block.content : JSON.stringify(block.content),
        isError: block.is_error === true,
      };
    }
  }
}

export async function* streamChat(input: StreamChatInput): AsyncGenerator<ChatSSEEvent> {
  const started = Date.now();
  let sessionId = "";
  try {
    ensureOAuthAuth();
    const q = query({
      prompt: input.userMessage,
      options: {
        model: SONNET_MODEL,
        systemPrompt: input.systemPrompt,
        // Single-user override (P1 Q1, see lib/tool-policy.ts): the studio
        // Chat is a READ-ONLY assistant. A safe read/search allowlist +
        // disallowing all mutation/exec lets it inspect files without the
        // interactive permission dead-end; maxTurns raised from 1 so a
        // tool-use turn can be followed by the answer turn.
        maxTurns: CHAT_MAX_TURNS,
        allowedTools: CHAT_ALLOWED_TOOLS,
        disallowedTools: CHAT_DISALLOWED_TOOLS,
        permissionMode: "default",
        abortController: signalToController(input.signal),
        pathToClaudeCodeExecutable: getClaudeCodePath(),
      },
    });

    for await (const m of q as AsyncIterable<SDKMessage>) {
      if (m.type === "assistant") {
        sessionId = m.session_id || sessionId;
        for (const ev of extractAssistantEvents(m.message)) yield ev;
      } else if (m.type === "user") {
        for (const ev of extractUserToolResults((m as { message?: unknown }).message)) yield ev;
      } else if (m.type === "result") {
        if (m.subtype === "success") {
          yield {
            type: "done",
            costUsd: m.total_cost_usd ?? 0,
            durationMs: m.duration_ms ?? Date.now() - started,
            sessionId,
          };
        } else {
          yield {
            type: "error",
            message: `SDK error: ${(m as { subtype: string }).subtype}`,
          };
        }
      }
    }
  } catch (err) {
    yield {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
