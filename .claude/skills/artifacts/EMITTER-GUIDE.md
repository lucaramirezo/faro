---
name: artifacts-emitter-guide
description: Universal Phase 4 HTML emitter spec for skills that produce reviewable artifacts (wiki-lint, /plan-feature, /ingest, dreams, heartbeat brief). Defines path layout, file naming, visual bar, bridge injection, and the artifact-as-review-surface principle. Authored 2026-05-13.
---

# Emitter Guide — Phase 4 HTML Artifacts

The faro Artifact Studio (`/studio`) treats every reviewable surface as
HTML because *the unreasonable effectiveness of HTML* is the foundational
thesis of Phase 4 (see `the_unreasonable_effectiveness_of_html.md`). Each
new emitter is a NEW human-steering moment. The HTML must let Luca steer —
not be a styled markdown wall.

This guide is the single source of truth for the 5 emitters in DESIGN.md §9.

---

## 1. Output path layout

```
drafts/artifacts/<YYYY-MM-DD>/<RUN-SLUG>/<EMITTER>.html
```

| Slug part | Format | Example |
|---|---|---|
| `<YYYY-MM-DD>` | Today (local TZ) | `2026-05-13` |
| `<RUN-SLUG>` | `<emitter>-<HHMMSS>` | `wiki-lint-143012` |
| `<EMITTER>` | File name | `triage.html` |

| Emitter | RUN-SLUG prefix | Output filename |
|---|---|---|
| `dreams/dream.py` (A5.1.a) | already has `dream-<id>` | `dream-report.html` |
| `heartbeat/morning_brief.py` (A5.1.b) | `heartbeat-<HHMMSS>` | `brief.html` |
| `/plan-feature` (A5.1.c) | `plan-feature-<HHMMSS>` | `plan-approaches.html` |
| `/wiki-lint` (A5.1.d) | `wiki-lint-<HHMMSS>` | `triage.html` |
| `/ingest` (A5.1.e) | `ingest-<HHMMSS>` | `ingest-review.html` |

The faro `scanArtifacts` walker (`lib/artifacts.ts`) picks up new files on
next `/studio` render — no DB insert needed from the emitter side.

---

## 2. Visual bar

Two reference artifacts establish the bar:

- **`drafts/artifacts/2026-05-13/dogfood-002/plan.html`** — hand-authored
  reference; the canonical visual spec for radix-luma palette, card silhouette,
  mesh-gradient header, badge variants.
- **`heartbeat/templates/brief.html.j2`** — running production template; lift
  the `<style>` block verbatim and edit only the body markup per emitter.

Required structure (every emitted artifact):

1. `<!doctype html>` + `<html lang="en" data-theme="dark">` — dark default
2. `<head>` includes `<meta name="faro:bridge" content="enabled" />`
3. Inline `<style>` with radix-luma `:root` / `[data-theme="dark"]` /
   `[data-theme="light"]` token blocks (lift verbatim from `brief.html.j2`)
4. Card primitive: `border-radius: calc(var(--radius) * 2.6)` (≈ 1.625rem)
5. Badge variants: `.badge`, `.badge.outline`, `.badge.success`,
   `.badge.warn`, `.badge.error` — same color tokens as `brief.html.j2`
6. Geist Sans body / Geist Mono numerics + code, system fallback
7. `<main class="page">` with `max-width: 1240px`, padding `28px 28px 80px`

DO NOT use Inter font, purple gradients, excessive centered layouts, or
uniform rounded corners (the "AI slop" anti-patterns from
`web-artifacts-builder/SKILL.md` §Design).

---

## 3. Artifact-as-review-surface (the steering principle)

Each emitter must surface its findings as **discrete steerable cards**, not
as a styled markdown wall. The user should be able to:

| Emitter | Steering action per card |
|---|---|
| heartbeat brief | (read-only — surfaces health + pending items) |
| /plan-feature | `[Lock] [Edit] [Reject]` per approach |
| /wiki-lint | `[Fix] [Defer] [Ignore]` per finding |
| /ingest | `[Accept] [Edit] [Reject]` per proposed page |
| dream-report | `[Accept] [Edit] [Reject]` per claim |

Action chips are visual-only in v1 (no two-way wire) — the user reads
them, decides, and types the next prompt with the card label. The
`[Highlight to comment]` toolbar button in the studio is the only v1
two-way primitive (DESIGN.md §3.3).

The card spec:
```html
<article class="card card-pad">
  <header class="card-hd">
    <span class="title">{{ short_label }}</span>
    <span class="sub">{{ severity_or_kind }}</span>
  </header>
  <div class="card-body">
    <h3>{{ title }}</h3>
    <p class="lede">{{ summary }}</p>
    <!-- evidence / context -->
  </div>
  <footer class="card-actions">
    <button class="badge outline">Action A</button>
    <button class="badge">Action B (recommended)</button>
    <button class="badge outline">Action C</button>
  </footer>
</article>
```

---

## 4. Bridge injection (mandatory)

After writing the HTML file, the emitter MUST run:

```bash
node /path/to/faro/scripts/inject-bridge.ts <path-to-emitted-html>
# OR
bun run /path/to/faro/scripts/inject-bridge.ts <path-to-emitted-html>
```

This injects the highlight-bridge `<script>` before `</body>` so the
artifact can `postMessage({type:'faro:highlight', text, selector})` to the
parent studio frame. The script is idempotent (marker-comment check) —
re-running on the same file is a no-op.

If the faro tooling is unavailable (no `node`/`bun` on the host running
the emitter, or `scripts/inject-bridge.ts` is missing), proceed without
the bridge — the artifact still renders fine, just without selection-back-
to-prompt support. Log a warning, don't fail the emitter.

---

## 5. Authoring modes (DESIGN.md §9)

| Emitter | Mode | Rationale |
|---|---|---|
| dreams/dream.py | Agent-SDK | Per-claim React state |
| heartbeat brief | shell + Jinja | Read-only status dashboard; no per-run authoring |
| /plan-feature | Agent-SDK | Plan content varies per request |
| /wiki-lint | shell + Jinja | Pre-baked card template per severity |
| /ingest | Agent-SDK | Proposed-page content varies per source |

**For Agent-SDK emitters** (Claude generates the HTML during the skill
invocation): you don't need a checked-in template — assemble the HTML
inline by lifting the `<style>` block from `heartbeat/templates/brief.html.j2`
and filling in the body. Keep total size under 1 MB; if you must include
many cards, paginate or summarize.

**For shell + Jinja emitters** (a Python driver renders a checked-in
template per run): the heartbeat brief is the running example. Mirror its
shape: `heartbeat/morning_brief.py` + `heartbeat/templates/brief.html.j2`.

---

## 6. CSP compatibility

The studio iframe sandbox is `allow-scripts` ALONE (DESIGN.md §3.1). The
raw response CSP is:

```
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
img-src data: blob:; connect-src 'none'; sandbox allow-scripts;
```

So:
- ✅ Inline `<style>` and inline `<script>` are fine
- ✅ Data-URL or blob images are fine
- ❌ External CSS, fonts, scripts, or image URLs will be blocked
- ❌ XHR/fetch to any origin will be blocked (`connect-src 'none'`)
- ❌ External iframes will be blocked (no `frame-src` allowance)

Geist fonts fall back to system fonts when not installed locally — the
template references `"Geist", "Geist Sans", ui-sans-serif, system-ui, ...`
and the cascade picks whatever the user has.

---

## 7. Hard size cap

Emitter wrappers reject `bundle.html > 5 MB`. Warn above 1 MB. Keep cards
concise; link out to the markdown sibling (e.g., `triage.md`) for the
verbose form if needed.

---

## 8. Cross-references

- `faro/.claude/skills/artifacts/DESIGN.md` — Phase 4 gate document
- `the_unreasonable_effectiveness_of_html.md` — foundational thesis
- `heartbeat/morning_brief.py` + `heartbeat/templates/brief.html.j2` — first running emitter
- `drafts/artifacts/2026-05-13/dogfood-002/plan.html` — visual reference
- `faro/scripts/inject-bridge.ts` — bridge injector (idempotent)
