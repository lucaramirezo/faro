# Studio component invariants

1. **`assertUnder(path, profile.agent_root)`** before every fs operation that touches user-influenced input. Non-negotiable. See `lib/security.ts:13-24`.
2. **Iframe sandbox is `"allow-scripts"` ALONE.** Combining with `allow-same-origin` lets the child remove its own sandbox (MDN). Phase 4 code gets this right; preserve it.
3. **`components/ui/**` is off-limits** to new code (Biome lint excludes it for shadcn-shipped a11y warnings). The one documented exception is `provider-chip.tsx`.
4. **Highlight-bridge `postMessage` handlers must validate** `event.origin === window.location.origin` AND `event.data.type === 'faro:highlight'`. Anything else is hostile.
5. **Renderer switch is keyed by `artifact.mime`** — never infer from path. Adding a new mime means adding both an `ARTIFACT_MIMES` entry AND a `MIME_BY_EXT` entry, then a `case` in `Renderer.tsx`.
