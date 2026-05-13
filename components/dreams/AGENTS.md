# Dreams component invariants

1. **`setClaimStatus` is the only write path** to `claim_decisions`. Never write the row directly; always route through `lib/claims.ts`.
2. **`tweakText` overwrites, never appends.** A rerun replaces the proposed text; it does not concatenate to the prior tweak.
3. **`decision_token` gates `finalizeDream`.** The token comes back from the Server Action and must be re-presented on commit; never reuse a stale token.
4. **Phase 4.5 `TweakPatch` is persisted as JSON** in `claim_decisions.tweak_patch`, top-level `schema_version: 1`. New patch variants extend the union AND bump the version.
5. **Cost budget is per-session, soft-capped at $0.25.** UI hides the rerun button past the cap; backend logs the breach. The Sonnet rerun input is capped at ~1000 tokens upstream so single calls can't blow the cap.
