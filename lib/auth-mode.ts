/**
 * Detect whether the Claude Code subscription chain is OAuth (Pro / Max plan)
 * or API key (per-token billing). Empty-string ANTHROPIC_API_KEY is treated
 * as unset — pei's systemd unit sets `Environment=ANTHROPIC_API_KEY=` on
 * purpose so the OAuth chain doesn't get hijacked into per-token billing.
 * See `memory/reference_oauth_billing_leak.md` for the incident that pinned
 * this discipline.
 */
export type AuthMode = "oauth" | "api_key";

export function detectAuthMode(): AuthMode {
  const raw = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  return raw.length > 0 ? "api_key" : "oauth";
}
