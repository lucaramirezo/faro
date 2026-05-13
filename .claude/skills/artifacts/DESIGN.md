---
name: artifacts
description: Phase-gate document for faro Phase 4 — Artifact Studio + Polish Pass. Locks the 10 decisions that block all Track A code (skill pin, Tailwind v3/v4 bridge, CSP/sandbox, artifact_id rule, prune policy, studio shell + gallery affordances, highlight bridge, code renderer, emitter scope, nav ordering). Closes PRD §15.3 #1+#2. Authored 2026-05-13 against PRD v0.2 (commit `7a9cb9f`).
version: 1.0
---

# artifacts — Phase 4 feature spec

This is the *gate* for the Artifact Studio + the 5 HTML emitters that ship with Phase 4. Visual tokens are owned by the `faro-design-guidelines` skill — do not duplicate palette/font/spacing here.

Source of truth: this DESIGN.md is folded from `.agents/plans/faro-phase-4-artifact-studio.md`, the 6 alignment-round answers Luca gave on 2026-05-13, the Anthropic `web-artifacts-builder` skill at SHA `b9e19e6f44773509fbdd7001d77ff41a49a486c1`, and the foundational thesis at `the_unreasonable_effectiveness_of_html.md`.

A parallel hand-authored dogfood artifact at `drafts/artifacts/2026-05-13/dogfood-001/plan.html` pressure-tests the assumptions in §2 + §6 + §9 before any emitter code lands. Review both side-by-side.

## 1. web-artifacts-builder skill pin

`anthropics/skills` @ `b9e19e6f44773509fbdd7001d77ff41a49a486c1` (2026-04-20).

- **Vendor path:** `faro/.claude/skills/web-artifacts-builder/` (project-scope).
- **Why this SHA:** verified path-HEAD on `main` for `skills/web-artifacts-builder/`. Pin-date commit is a LICENSE.txt copyright-holder fill-in; no code or contract drift. Prior commit on path was 2025-12-01 folder restructure. So `b9e19e6` is effective HEAD; no upstream activity since.
- **Re-pin cadence:** annually OR on Anthropic's request. Track in `faro/.claude/skills/web-artifacts-builder/PINNED.md` adjacent to the vendored skill.
- **Constraints:** Node 18+ (faro is Node 22 in prod; satisfied). Skill auto-installs global `pnpm` on first authoring run. Cron emitters that need the *authoring* step (Claude generates the React code) go through the Claude Agent SDK; cron jobs with pre-baked React templates can shell out to `scripts/bundle-artifact.sh` standalone. Mode per emitter in §9.
- **Tailwind constraint:** the skill scaffolds Tailwind 3.4.1; faro is v4. See §2.

## 2. Tailwind v3/v4 token-bridge strategy

Accept the split. **No shared token system in v1.**

- The artifact's `bundle.html` ships fully-inlined CSS (Parcel + `html-inline`). Faro never imports artifact CSS. Artifact and faro are two independent visual universes that happen to render in adjacent frames (iframe vs parent).
- The shared `design-tokens.yml` referenced in PRD §11 Track A is a nice-to-have; defer to Phase 5+ if Tailwind drift becomes user-visible pain.
- **Practical consequence:** emitter templates carry their own (Tailwind 3.4.1) classnames; faro carries its own (Tailwind v4) classnames. Code review for emitters checks the artifact's CSS doesn't leak; code review for faro checks the iframe is properly sandboxed (§3).
- **Dogfood implication:** the dogfood at `drafts/artifacts/2026-05-13/dogfood-001/plan.html` is hand-authored (no skill yet); it uses inline `<style>` with no Tailwind. It is a stand-in for the eventual emitter output. Future emitter outputs use the skill's Tailwind v3 system.

## 3. CSP + sandbox flags

`iframe sandbox="allow-scripts"` ALONE. PRD §6.6.4 + §8.1 specify `allow-scripts allow-same-origin` together — **that's a bug** (per MDN, combining the two flags lets the child remove its own sandbox). All 3 PRD corrections land NOW as a single commit between A0 and A0.1; see §8.

### 3.1 Iframe attribute

```tsx
<iframe
  src={`/studio/raw/${artifactId}`}
  sandbox="allow-scripts"           // NOT "allow-scripts allow-same-origin"
  className="w-full h-full border-0"
  title={label}
/>
```

### 3.2 Raw-content response header

```
Content-Security-Policy:
  default-src 'none';
  script-src 'unsafe-inline';
  style-src 'unsafe-inline';
  img-src data: blob:;
  connect-src 'none';
  sandbox allow-scripts;
X-Content-Type-Options: nosniff
Content-Type: text/html; charset=utf-8
```

`connect-src 'none'` keeps the artifact air-gapped. Monaco's `worker-src 'self' blob:` carve-out is NO LONGER NEEDED (Monaco dropped per (f); code renders via Shiki server-rendered `<pre>` — see §6.4).

### 3.3 Highlight-bridge contract

Artifact `postMessage`s `{type: 'faro:highlight', text: string, selector: string}` to `window.parent` on selection-end. The bridge `<script>` is injected by `faro/scripts/inject-bridge.ts` at bundle time (decision (e)) — NOT in the artifact's React template, so emitter authors do not need to remember to opt in.

Parent (`HighlightBridge.tsx`) re-validates BOTH:

1. `event.origin === window.location.origin` (same-origin postMessage; sandbox allows scripts but the artifact has no `allow-same-origin` so its origin is the null/opaque origin `"null"` — the bridge therefore checks `event.origin === "null" || event.origin === window.location.origin` because the iframe's effective origin is opaque under the sandbox).
2. `event.data?.type === 'faro:highlight'` (only this message type is honored).

Anything failing either gate is dropped silently — no console output (avoids leaking the bridge's existence to malicious artifacts).

**Selector format:** opaque text in v1. The bridge script attempts a best-effort CSS path (`tag#id.class > tag:nth-child(n) > ...`); falls back to the empty string if computation throws. Parent treats the selector as advisory metadata, not as a queryable hook.

## 4. artifact_id derivation

`artifact_id = sha256(content_hash + run_id).hex[:16]`

- **content_hash** = `sha256(file_bytes).hex`.
- **run_id** = the `pipeline_runs.run_id` that emitted the artifact. For ad-hoc artifacts (not from a pipeline run), use the literal string `manual:<date>:<slug>` as run_id.
- **Length:** 16 hex chars (64 bits). Birthday-collision probability over 10⁶ artifacts is ~3×10⁻¹³ — negligible for a single-user system.
- **Semantics:** content-addressed. Renames hash to a NEW id; in-place edits hash to a NEW id. Intentional — each visual rendering is a snapshot. Promotion (artifact moved to `wiki/artifacts/`) preserves the artifact_id; the row gains `promoted_at` but the id is stable.
- **Format validator** (used by route handlers + Server Actions): `/^[a-f0-9]{16}$/`. Anything else returns 400.
- **Closes PRD §15.3 #2.**

## 5. Prune policy

NONE in v1. **Manual quarterly sweep via a future `/artifact-gc` skill.** Plan and accept the absence.

- The `artifacts` table is additive; no auto-prune. Index `(emitter, profile_id, created_at DESC)` keeps gallery queries O(log n) at any realistic row count.
- Disk footprint cap: emitter wrapper rejects bundle.html > 5 MB. With 5 emitters running daily, worst-case ~25 MB/day = ~9 GB/year. Fine for pei.
- A future `/artifact-gc` skill (Phase 5+) will: dry-run a sweep, propose a tombstone CSV, mark rows `archived_at`, optionally `rm` the file. Two-stage so deletions are recoverable.
- **Closes PRD §15.3 #1** with a "deferred to /artifact-gc skill, quarterly manual sweep in v1" close-out.

## 6. Studio shell + gallery affordances

The plan flagged "think deeply about the three-pane proportions before A4 lands". This section locks the studio's first-impression layout.

### 6.1 Three-pane layout

```
┌─[AppSidebar 48px]─┬─[Gallery 280px]─┬─[Renderer flex]─┬─[Provenance 320px]─┐
│ icons only        │ grouped runs    │ mime-typed      │ model · cost · ... │
│ (route-aware)     │ sticky headers  │ HTML iframe etc │ collapsible        │
└───────────────────┴─────────────────┴─────────────────┴────────────────────┘
                                       ↑ TopLocator (48px sticky) above all
```

- **AppSidebar auto-collapses to icons (48px) on `/studio/*` routes**. Implementation: a route-aware `useEffect` in `AppSidebar.tsx` reads `usePathname()`; if it starts with `/studio` AND the user has not manually expanded during this session, calls `setCollapsed(true)` once on mount. Manual expansion (click trigger) within `/studio` is respected for the rest of the session (sets a session-storage flag); outside `/studio`, default-expanded persists via the standard sidebar-07 cookie. Avoids fighting the user.
- **Studio Gallery: 280px fixed.** Wider than the typical sidebar-list pattern so emitter chip + filename + relative-time fit on one row at 13px text without truncation.
- **Studio Renderer: flex.** On 1440px viewport with everything expanded: `1440 − 48 − 280 − 320 = 792px renderer`. Provenance collapsed (~40px strip): `~1072px renderer`. Acceptable across HTML/Markdown/JSON/SVG/code at studio's primary text size (14px prose, 13px code).
- **Studio Provenance: 320px collapsible.** Default-collapsed on viewports < 1440 px (13" laptop case: `1280 − 48 − 280 − 320 = 632px` is tight; collapsed gives `912px`). Cookie-persisted.
- **Mobile (<768px):** single-column. Gallery on top, renderer below, provenance becomes a bottom-sheet behind a `[provenance]` button. Optional — defer if it adds >0.25d to A4.

### 6.2 Gallery grouping

Reverse-chronological **grouped by `run_id`**. Sticky group header per run.

```
┌──────────────────────────────────────────┐
│ 2026-05-13 14:32 · dream@abc12345        │  ← sticky group header
│   [○ anthropic] dream-report.html  4m ●  │  ← artifact row
│   [○ anthropic] claims.json        4m ●  │
├──────────────────────────────────────────┤
│ 2026-05-13 12:00 · ingest@def67890       │
│   [○ openai] ingest-review.html   2h28m  │
└──────────────────────────────────────────┘
```

- Group header layout: `[timestamp · emitter@run_id_short]`; `run_id_short = run_id[:8]`.
- Row layout: `[ProviderChip emitter] [label] [relative-time-right] [status-dot]`.
- Status dot: green if `promoted_at` IS NOT NULL, amber if open/unread, neutral grey if read-only-already-seen (set via `last_viewed_at` column — additive, no destructive ALTER).
- Group collapses on click (chevron). Expand-all + collapse-all buttons in gallery toolbar.
- Empty state per plan A4 GOTCHA — empty-state card with one-line "agents have not yet emitted any artifacts" + link to `/dreams`.

### 6.3 Provenance pane

Reads `pipeline_runs JOIN claim_decisions` for the selected artifact's `run_id`. Shows:

| Row | Source |
|---|---|
| Model | `pipeline_runs.model` |
| Cost | `pipeline_runs.cost_usd` (tabular-nums, 4 dp) |
| Duration | `pipeline_runs.duration_ms` (formatted m/s) |
| Tool calls | streamed from the run's jsonl session file (top 10; "show all" expands inline) |
| Claims approved/denied | count from `claim_decisions WHERE run_id = ?` (only for dream emitters) |
| Promoted at | `artifacts.promoted_at` if set |

### 6.4 Renderer modes

| MIME | Component | Notes |
|---|---|---|
| `text/html` | HtmlRenderer | sandboxed iframe (§3.1) + HighlightBridge (§3.3) |
| `text/markdown` | MarkdownRenderer | react-markdown + remark-gfm + rehype-highlight; `<!--faro:diff-->` pragma routes through `lib/shiki-diff.ts` |
| `image/svg+xml` | SvgRenderer | DOMPurify-sanitized; inject via `dangerouslySetInnerHTML` |
| `application/json` | JsonRenderer | react-json-view-lite v2 |
| `text/x-code` | CodeRenderer | **Shiki server-rendered `<pre>`** via `lib/shiki-diff.ts` patterns (Monaco dropped, decision (f)). No in-place navigation; text selection only; line numbers via Shiki transformer. |

Fallback for unknown MIME: "Download only" button + raw bytes link.

### 6.5 Six-button toolbar (above renderer)

Order left-to-right: `[Open in Claude Code] [Copy as prompt] [Copy raw] [Pop out] [Highlight to comment] [Promote to wiki]`.

- **Open in Claude Code**: laptop → `vscode://file/<absolute-path>`; pei → copies `claude --resume <run_id>` to clipboard with toast (since `vscode://` can't reach laptop from pei). Detection via `process.env.FARO_AGENT_ROOT`.
- **Copy as prompt**: assembles `Please open faro/drafts/artifacts/<date>/<run>/<file> and ...` into clipboard.
- **Copy raw**: clipboard write of the file contents (size-capped at 1 MB; over → "too large, use Pop out").
- **Pop out**: `window.open(/studio/raw/${id}, '_blank')` in a new tab; useful for side-by-side review.
- **Highlight to comment**: toggles the `HighlightPrompt.tsx` textbox visibility; drag-select inside iframe drops text + selector into the box.
- **Promote to wiki**: Server Action `promoteArtifactAction(id)`; copies file to `wiki/artifacts/<slug>/`; `gitCommitStateChange()`; sets `promoted_at`; `revalidatePath("/studio")`.

## 7. Locked decisions (2026-05-13)

| # | Decision | Alternative not picked | Rationale |
|---|---|---|---|
| 1 | `web-artifacts-builder` pin: `b9e19e6f4477...` | Bump to head | head IS the pin (verified) |
| 2 | Tailwind v3/v4 split accepted | Shared `design-tokens.yml` | CSS inlined; no leakage; defer to Phase 5+ |
| 3 | `sandbox="allow-scripts"` alone | `allow-scripts allow-same-origin` | child can remove own sandbox (MDN) |
| 4 | `artifact_id = sha256(content_hash + run_id)[:16]` | path-keyed | survives renames; content-addressed snapshots |
| 5 | No auto-prune in v1 | TTL / row-count cap | manual quarterly sweep via /artifact-gc; deferred |
| 6 | Studio: 48/280/flex/320 + grouped-by-run gallery | 240/flex/280 + flat list | room for chip+label+time; group sticky headers anchor scroll |
| 7 | Highlight bridge: inline `<script>` injected at bundle time | per-template `<meta name="faro:bridge">` opt-in | universal; one source of truth (decision (e)) |
| 8 | Code renderer: Shiki `<pre>` | Monaco read-only | drops ~3 MB + worker-src CSP carve-out (decision (f)) |
| 9 | All 5 emitters ship in main PR | dripping post-ship | coherent "all skills emit HTML" story (decision (b)) |
| 10 | B1 hard-cut before A4 | feature-flagged B1 / A4 first | gallery wires to final nav once (decision (c)) |

Logged against PRD §14 as decision **#19** (referencing this file).

## 8. PRD corrections owed (PRD-EDITS task)

Lands as a single commit BETWEEN A0 and A0.1. Three edits to `faro/faro-prd.md`:

1. **§6.6.4 + §8.1**: `sandbox="allow-scripts allow-same-origin"` → `sandbox="allow-scripts"`. Add a one-line note: "combining the two flags lets the child remove its own sandbox (MDN reference)."
2. **§7 (Phase 4 additions)**: any reference to **Recharts** corrected to **Tremor 3.18.7**. Already installed; do not add a new dep.
3. **§15.3 open questions**:
   - #1 (prune policy) → close-out: "Deferred to /artifact-gc skill (Phase 5+); manual quarterly sweep in v1. See [`faro/.claude/skills/artifacts/DESIGN.md`](.claude/skills/artifacts/DESIGN.md) §5."
   - #2 (artifact-id stability) → close-out: "Locked in [`faro/.claude/skills/artifacts/DESIGN.md`](.claude/skills/artifacts/DESIGN.md) §4: `sha256(content_hash + run_id)[:16]`, content-addressed."

## 9. Emitter scope (5 in main PR)

| # | Emitter | Input | Output path | Mode |
|---|---|---|---|---|
| A5.1.a | `dreams/dream.py` | dream-report.md + claims.json | `drafts/artifacts/<date>/<run>/dream-report.html` | Agent-SDK (authoring) |
| A5.1.b | `heartbeat/morning_brief.py` (audit + create if missing) | heartbeat status | `drafts/artifacts/<date>/heartbeat-<ts>/brief.html` | shell + pre-baked React template |
| A5.1.c | `/plan-feature` skill | plan markdown | `drafts/artifacts/<date>/<run>/plan-approaches.html` | Agent-SDK |
| A5.1.d | `/wiki-lint` skill | lint findings | `drafts/artifacts/<date>/<run>/triage.html` | shell + pre-baked template |
| A5.1.e | `/ingest` skill | source digest + wiki-page proposals | `drafts/artifacts/<date>/<run>/ingest-review.html` | Agent-SDK |

Each emitter, post-bundle, runs `faro/scripts/inject-bridge.ts` to insert the highlight `<script>` before `</body>`. 5 MB hard cap; "large artifact" warning above 1 MB.

## 10. Open follow-ups (Phase 5+)

- `/artifact-gc` skill (prune policy implementation).
- Shared `design-tokens.yml` if Tailwind v3 ↔ v4 drift becomes user-visible pain.
- Cross-phase: Phase 3 recommender + Phase 4 studio share the `artifacts` table; "Surfaced → promote to skill" cards may read `WHERE emitter = 'recommender'` once Phase 3 emitter lands. Do NOT pre-build for Phase 3 here.
- Sidebar route-aware collapse session-flag refinement (currently session-storage; consider persisting per-route).
- Bridge selector format: tighten the CSS-path → xpath fallback contract once a real emitter selection is observed in practice.
- Multi-agent profile dropdown shared between `team-switcher` and `LocatorPill` — Phase 5+ when a second profile exists.
- Bottom-sheet provenance on mobile (deferred from §6.1 if >0.25d).
