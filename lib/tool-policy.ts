// Permissive single-user tool policy.
//
// AUTHORIZED OVERRIDE (Luca, 2026-05-18 — sole operator, single-user box):
// knowingly relaxes three locked decisions for usability:
//   - P1 Q1: the 4.5 `streamChat` surface was "byte-for-byte frozen" — we now
//     give it a safe READ/SEARCH allowlist so the studio Chat assistant can
//     actually inspect files instead of dead-ending on an interactive
//     permission prompt.
//   - P1 Q3/N1: agent runs were "default-deny canUseTool + HIL gate/resume".
//     For a sole operator that gate is friction; agent mode is now
//     default-ALLOW, denying only genuinely destructive shell. The
//     gate/resume machinery (resolveGate, awaiting_approval) stays in the
//     codebase but is dormant under this policy.
// `ensureOAuthAuth` / `pathToClaudeCodeExecutable` are untouched (billing-leak
// + executable-path rules hold).
import "server-only";

/** Read/search/inspect — non-mutating; safe to auto-run with no prompt. */
export const CHAT_ALLOWED_TOOLS = [
  "Read",
  "Glob",
  "Grep",
  "LS",
  "NotebookRead",
  "WebFetch",
  "WebSearch",
  "TodoWrite",
];

/** Mutating/exec — the studio Chat (read-only assistant) must never use these. */
export const CHAT_DISALLOWED_TOOLS = [
  "Bash",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
  "KillBash",
];

// Genuinely destructive / irreversible shell. Conservative but covers the
// classic foot-guns; everything else is allowed in agent mode.
const DANGEROUS_BASH: RegExp[] = [
  /\brm\s+-\w*[rf]/i, // rm -r / -f / -rf (recursive/force — the real foot-gun)
  /\brm\s+(-\w+\s+)*(\/|~|\*|\.\.?)(\s|$)/, // rm of root / home / glob / dot
  /\brmdir\s+\//,
  /\bdd\b[^\n]*\bof=/i,
  /\bmkfs(\.\w+)?\b/i,
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  /\binit\s+[06]\b/,
  /\bgit\s+(reset\s+--hard|clean\s+-\w*f|push\b[^\n]*(--force|\s-f\b))/i,
  /:\(\)\s*\{\s*:\s*\|\s*:&\s*\}\s*;\s*:/, // fork bomb
  /\bchmod\s+-R?\s*0?777\s+\//i,
  /\bchown\s+-R\b[^\n]*\s\//,
  />\s*\/dev\/(sd[a-z]|nvme\d)/i,
  /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh)\b/i,
  /\bsudo\s+rm\b/i,
  /\btruncate\s+-s\s*0\b[^\n]*\//i,
];

/** True iff a Bash command string is destructive/irreversible. */
export function isDangerousBash(cmd: unknown): boolean {
  if (typeof cmd !== "string") return false;
  return DANGEROUS_BASH.some((re) => re.test(cmd.trim()));
}

export type ToolDecision =
  | { behavior: "allow"; updatedInput: Record<string, unknown> }
  | { behavior: "deny"; message: string };

/**
 * Permissive agent-mode policy: allow every tool EXCEPT a destructive shell
 * command. (Single-user override of P1 default-deny — see file header.)
 */
export function agentToolDecision(
  toolName: string,
  toolInput: Record<string, unknown>,
): ToolDecision {
  if (toolName === "Bash" && isDangerousBash((toolInput as { command?: unknown })?.command)) {
    return {
      behavior: "deny",
      message:
        "Blocked by faro safety policy: that looks like a destructive/irreversible shell command. Rephrase it non-destructively, or run it yourself.",
    };
  }
  return { behavior: "allow", updatedInput: toolInput };
}
