// Single-user tool policy. Chat = read/search allowlist; agent = selective
// HIL gate.
//
// AUTHORIZED OVERRIDE (Luca, 2026-05-18 — sole operator, single-user box):
// knowingly relaxes locked decisions for usability:
//   - P1 Q1: the 4.5 `streamChat` surface was "byte-for-byte frozen" — we now
//     give it a safe READ/SEARCH allowlist so the studio Chat assistant can
//     actually inspect files instead of dead-ending on an interactive
//     permission prompt.
//   - P1 Q3/N1 → P3 (decision 35, 2026-05-19): agent runs were "default-deny
//     canUseTool + HIL gate/resume", which P2.1 flipped to default-ALLOW
//     (gate dormant). P3 SELECTIVELY RE-ARMS the gate: mutating filesystem
//     writers (GATE_TOOLS) and a curated set of mutating-but-not-destructive
//     shell (isGatedBash) now return `{behavior:"gate"}` → the run-engine
//     canUseTool journals an approval + denies-WITHOUT-interrupt, resumable
//     via the (now LIVE) resolveGate. Read/search auto-allow; genuinely
//     destructive shell stays a hard DENY (never gated). This is NOT a return
//     to blanket default-deny — the curated set is conservative-by-design and
//     tunable (single-operator box). The 4.5 Chat allow/deny lists below are
//     UNCHANGED (the P1 Q1 bullet still holds).
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

// ---------------------------------------------------------------------------
// P3 selective re-arm (operator-signed conservative set, decision 35).
// ---------------------------------------------------------------------------

/** Mutating filesystem writers — always gate in agent mode. */
export const GATE_TOOLS: string[] = ["Write", "Edit", "MultiEdit", "NotebookEdit"];

// Mutating-but-NOT-destructive shell that warrants operator review. Evaluated
// only AFTER isDangerousBash (destructive → hard-deny, never gated). Conservative
// allowlist-of-patterns; everything else Bash stays allow. Case-insensitive,
// tested against cmd.trim(). This is the literal operator-signed set (P3
// acceptance round 2026-05-19 — see lib header / faro-prd.md decision 35).
const GATED_BASH: RegExp[] = [
  // VCS / publish (force-push & reset --hard are destructive → denied earlier).
  /\bgit\s+(commit|push|merge|rebase|tag|reset(?!\s+--hard)|cherry-pick|am|apply|stash\s+(pop|drop|clear)|branch\s+-[dD]|filter-branch)\b/i,
  /\bgh\s+(pr|issue|release|repo|api|workflow|secret|variable)\b/i,
  // Network-mutating HTTP.
  /\bcurl\b[^\n]*\s-X\s*(POST|PUT|PATCH|DELETE)\b/i,
  /\bcurl\b[^\n]*\s--request\s*(POST|PUT|PATCH|DELETE)\b/i,
  /\bcurl\b[^\n]*\s(-d|--data(-\w+)?|-F|--form|-T|--upload-file)\b/i,
  /\bwget\b[^\n]*--post/i,
  /\bhttp(ie)?\b[^\n]*\b(POST|PUT|PATCH|DELETE)\b/i,
  // Package install / publish / mutate.
  /\b(npm|pnpm|yarn|bun)\s+(i|install|ci|add|publish|update|upgrade|remove|rm|uninstall)\b/i,
  /\bpip3?\s+install\b/i,
  /\buv\s+(add|pip\s+install|sync)\b/i,
  /\b(cargo\s+(add|install)|go\s+get|gem\s+install|apt(-get)?\s+(install|remove|purge)|brew\s+(install|uninstall))\b/i,
  // In-place file mutation that bypasses Write/Edit + shell write-redirection.
  /\bsed\s+-i\b/i,
  /\bperl\b[^\n]*\s-i\b/i,
  /\b(mv|cp|ln|chmod|chown|truncate|install)\b\s/i,
  /\btee\b/i,
  /(^|[^0-9&])>>?\s*(?!\s*\/dev\/null)\S/,
  // Service / process / container / db-CLI state mutation.
  /\b(systemctl|service|kill|pkill|killall|crontab|docker|docker-compose|podman)\b/i,
  /\bsqlite3\b[^\n]*\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i,
  /\b(psql|mysql)\b[^\n]*\s(-c|-e)\b/i,
];

/**
 * True iff a Bash command is mutating-but-not-destructive (warrants a gate).
 * isDangerousBash MUST be checked first (destructive → deny, not gate).
 */
export function isGatedBash(cmd: unknown): boolean {
  if (typeof cmd !== "string") return false;
  return GATED_BASH.some((re) => re.test(cmd.trim()));
}

export type ToolDecision =
  | { behavior: "allow"; updatedInput: Record<string, unknown> }
  | { behavior: "deny"; message: string }
  | { behavior: "gate"; reason: string };

/**
 * Agent-mode policy (P3 selective HIL re-arm — see file header / decision 35):
 *  1. destructive shell → hard DENY (FIRST; never gated, unchanged from P2.1).
 *  2. mutating filesystem writer (GATE_TOOLS) OR mutating-but-not-destructive
 *     shell (isGatedBash) → GATE (operator approval via the live run gate).
 *  3. everything else (read/search/think + benign shell) → ALLOW.
 */
export function agentToolDecision(
  toolName: string,
  toolInput: Record<string, unknown>,
): ToolDecision {
  const command = (toolInput as { command?: unknown })?.command;

  // (1) destructive shell → hard-deny, FIRST, never gated.
  if (toolName === "Bash" && isDangerousBash(command)) {
    return {
      behavior: "deny",
      message:
        "Blocked by faro safety policy: that looks like a destructive/irreversible shell command. Rephrase it non-destructively, or run it yourself.",
    };
  }

  // (2) mutating writer / mutating shell → gate for operator approval.
  if (GATE_TOOLS.includes(toolName) || (toolName === "Bash" && isGatedBash(command))) {
    return {
      behavior: "gate",
      reason: `${toolName} is a mutating action; operator approval required`,
    };
  }

  // (3) read/search/think + benign shell → allow.
  return { behavior: "allow", updatedInput: toolInput };
}
