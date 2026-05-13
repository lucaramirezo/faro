/**
 * Slash-command registry for the dreams tweak composer (B1) and, later, the
 * studio chat composer (C3). Two-mode dispatch:
 *
 *   - `intercept` — handled client-side without a model call. The composer
 *     applies a deterministic edit (e.g. /shorten cuts the claim by a known
 *     ratio) and falls through to a normal Save.
 *
 *   - `expand` — `expand(claimText, args)` returns a canonical prompt that
 *     the rerun pipeline ships to Sonnet via the Claude Agent SDK. The model
 *     proposes the new claim text; the user accepts/discards via the diff
 *     panel before any DB write.
 *
 * Strictly start-of-input trigger (regex `/^\/([^\s/]*)$/`) — dates like
 * `2026/05/13` typed mid-line never open the popover.
 *
 * No `cmdk` dependency: the popover is a hand-rolled component anchored
 * above the textarea, not at the caret. Open-design's same simplification.
 */

export type SlashCommandMode = "intercept" | "expand";

export interface SlashCommand {
  id: string;
  label: string;
  insert: string;
  description: string;
  mode: SlashCommandMode;
  argHint?: string;
  expand?: (claimText: string, args: string) => string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "shorten",
    label: "Shorten",
    insert: "/shorten ",
    description: "Trim filler; keep the core claim",
    mode: "intercept",
  },
  {
    id: "split",
    label: "Split",
    insert: "/split ",
    description: "Mark this claim for splitting into two",
    mode: "intercept",
  },
  {
    id: "merge",
    label: "Merge",
    insert: "/merge ",
    description: "Mark for merge with another claim",
    mode: "intercept",
    argHint: "<claim-id>",
  },
  {
    id: "retone",
    label: "Retone",
    insert: "/retone ",
    description: "Adjust the voice of the claim",
    mode: "intercept",
    argHint: "<tone>",
  },
  {
    id: "reroll",
    label: "Reroll",
    insert: "/reroll ",
    description: "Rerun via Sonnet with a free-form hint",
    mode: "expand",
    argHint: "<hint>",
    expand: (text, args) =>
      `Rewrite the following claim per this hint: "${args.trim() || "make it sharper"}".\n\n` +
      `Claim:\n${text}\n\nReturn ONLY the rewritten claim text — no preamble, no explanation.`,
  },
  {
    id: "cite",
    label: "Cite",
    insert: "/cite ",
    description: "Rewrite with the strongest evidence inline",
    mode: "expand",
    expand: (text, _args) =>
      `Identify the single strongest piece of evidence already implied by this claim and ` +
      `rewrite it to include that citation inline. Keep length within ±10%.\n\n` +
      `Claim:\n${text}\n\nReturn ONLY the rewritten claim text.`,
  },
  {
    id: "contradict-check",
    label: "Contradict-check",
    insert: "/contradict-check ",
    description: "Stress-test for hidden contradictions",
    mode: "expand",
    expand: (text, _args) =>
      `If this claim contains a hidden contradiction or an unfalsifiable assertion, ` +
      `rewrite it to remove the issue. If it does not, return the claim unchanged.\n\n` +
      `Claim:\n${text}\n\nReturn ONLY the rewritten claim text.`,
  },
];

export function findCommand(id: string): SlashCommand | undefined {
  return SLASH_COMMANDS.find((c) => c.id === id);
}

/**
 * Parse a textarea value at the caret to detect an active slash trigger.
 * Returns the query (text after the slash) when the prefix matches exactly
 * `/^\/([^\s/]*)$/`, otherwise null. `tokenStart` is the absolute index of
 * the slash character (always 0 by definition of the regex).
 */
export function detectSlash(
  value: string,
  caretIndex: number,
): { tokenStart: number; query: string } | null {
  const prefix = value.slice(0, caretIndex);
  const m = prefix.match(/^\/([^\s/]*)$/);
  if (!m) return null;
  return { tokenStart: 0, query: m[1] };
}

export function filterCommands(query: string): SlashCommand[] {
  if (!query) return SLASH_COMMANDS;
  const q = query.toLowerCase();
  return SLASH_COMMANDS.filter(
    (c) => c.id.toLowerCase().includes(q) || c.label.toLowerCase().includes(q),
  );
}

/**
 * Parse a textarea value as `<command-id> <args>` where the entire value
 * starts with a slash. Returns null if not a slash invocation, otherwise
 * the command + args (whitespace-trimmed).
 */
export function parseInvocation(value: string): { command: SlashCommand; args: string } | null {
  if (!value.startsWith("/")) return null;
  const m = value.match(/^\/([^\s]+)\s*([\s\S]*)$/);
  if (!m) return null;
  const cmd = findCommand(m[1]);
  if (!cmd) return null;
  return { command: cmd, args: (m[2] ?? "").trim() };
}
