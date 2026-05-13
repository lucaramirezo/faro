import "server-only";

import { readFileSync } from "node:fs";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

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

let _tokenLoadedFrom: string | null = null;

function ensureOAuthAuth(): void {
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

function signalToController(signal: AbortSignal | undefined): AbortController | undefined {
  if (!signal) return undefined;
  const ctrl = new AbortController();
  if (signal.aborted) ctrl.abort(signal.reason);
  else signal.addEventListener("abort", () => ctrl.abort(signal.reason), { once: true });
  return ctrl;
}
