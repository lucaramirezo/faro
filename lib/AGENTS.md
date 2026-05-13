# Lib utility invariants

1. **No client imports of `server-only` modules.** `lib/claims.ts` and peers are marked `"server-only"` — importing them from a `"use client"` file breaks the build. Keep cross-boundary shapes in `*-types.ts`.
2. **`require*Key()` helpers throw at runtime** (lazy validation; see `lib/env.ts:1-15`). Module-import-time validation breaks `next build` on laptops without `.env.local` filled.
3. **LiteLLM `model_prices_and_context_window.json` is the canonical pricing source.** `lib/pricing.ts` mirrors it; the in-repo allowlist is a guardrail, not the source of truth.
4. **`assertUnder(path, profile.agent_root)` before every fs op** — even read-only paths. `lib/security.ts:13-24`.
5. **Profile YAML is the source of truth for per-feature config** (models, agent_root, state_db). Don't hard-code model strings or paths in lib modules; read them via `getProfile()`.
6. **`@anthropic-ai/claude-agent-sdk` ONLY** for Anthropic calls. Never `@ai-sdk/anthropic`. Never set `ANTHROPIC_API_KEY` — the SDK uses Max-sub OAuth via `CLAUDE_CODE_OAUTH_TOKEN` on pei (`UnsetEnvironment=ANTHROPIC_API_KEY` in systemd unit). Setting the API key flips billing to per-token. See `~/.claude/projects/-home-luca-projects-lwiki/memory/reference_oauth_billing_leak.md`.
