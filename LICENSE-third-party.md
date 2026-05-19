# Third-party attributions

This file documents code in `faro/` adapted from third-party sources, in
addition to the npm dependencies declared in `package.json`.

## developer-hasm/claude-code-dashboard (MIT)

- **Files adapted from this project**:
  - `lib/skills/parser.ts` — skill-discovery + frontmatter logic adapted from `src/lib/scanner.ts`.
  - `lib/skills/usage.ts` — incremental jsonl ingestion + `extractSkillName` + the `processed_files` and `turns` sqlite schemas adapted from `src/lib/incremental-scanner.ts` and `src/lib/usage-db.ts`.
- **Upstream repository**: https://github.com/developer-hasm/claude-code-dashboard
- **Upstream commit referenced during the Phase 2 port**: `b620331b25034d5b1b142c7d89df69164374896e` (2026-05-11)

### MIT License

```
MIT License

Copyright (c) developer-hasm

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## nexu-io/html-anything (Apache-2.0)

- **Files adapted from this project** (P1 Control Station, 2026-05-15):
  - `lib/extract-html.ts` — the 5-rung `extractHtml` ladder + `previewHtml` ported
    verbatim from `src/lib/extract-html.ts`. **Modification:** the rung-5
    last-resort scaffold was rewritten to a self-contained inline-CSS document
    (the upstream `https://cdn.tailwindcss.com` scaffold would render blank
    under faro's `/studio/raw` `default-src 'none'; connect-src 'none'` CSP).
  - `lib/generation.ts` — prompt **assembly order/structure** mirrored from
    `src/lib/templates/shared.ts` (`assemblePrompt`: shared directives →
    skill body → format → user content). The directive text itself is
    re-authored in English (the upstream `SHARED_DESIGN_DIRECTIVES` is Chinese);
    no upstream prose is copied.
  - `.claude/skills/imported/saas-landing/SKILL.md` — the §6.8 acceptance fixture is
    re-authored in English from the `src/lib/templates/skills/saas-landing`
    brief structure (no verbatim upstream prose); see its `attribution:`
    frontmatter.
- **Files adapted from this project** (Phase 4.6 skill bulk-import, 2026-05-18):
  - `.claude/skills/imported/{data-report,dashboard,pricing-page,deck-pitch,invoice,finance-report,pm-spec,eng-runbook,meeting-notes,live-dashboard}/SKILL.md`
    — ten design briefs re-authored in English from the **structure** of the
    upstream `next/src/lib/templates/skills/<slug>` briefs (no verbatim upstream
    prose; upstream bodies are Chinese + CDN-dependent — re-authored to faro's
    `allow-scripts`-only CSP: charts inline SVG/CSS, no external lib/fetch).
    Each carries `attribution:` frontmatter (`commit: b799c28`).
  - `lib/extract-html.test.ts` — kept at parity with (a superset of) the upstream
    `next/src/lib/__tests__/extract-html.test.ts` regression cases; faro's file
    pre-existed and additionally guards the rung-5 self-contained modification.
- **Upstream repository**: https://github.com/nexu-io/html-anything
- **Upstream commit referenced during the P1 port**: `b699e8a`
- **Upstream commit referenced during the Phase 4.6 skill bulk-import**:
  `b799c2851420147914bbd0967ae0ed655643493b` (2026-05-18). The repo restructured
  to a pnpm workspace since `b699e8a` — skill briefs now live under
  `next/src/lib/...`. `lib/extract-html.ts` / `lib/generation.ts` remain pinned
  at `b699e8a` (their upstream logic is unchanged at `b799c28`; not re-vendored).
- **NOTICE**: no `NOTICE` file exists upstream at either referenced commit, so
  Apache-2.0 §4(d) imposes no NOTICE-redistribution obligation; the in-file
  headers + this entry satisfy §4(b)/§4(c).
- **License**: Apache License, Version 2.0 — https://www.apache.org/licenses/LICENSE-2.0
  Licensed under the Apache License, Version 2.0; you may not use these files
  except in compliance with the License. Files adapted here carry an in-file
  attribution header and a "Modification" note per Apache-2.0 §4(b)/§4(c).
  The full license text is available at the URL above.

## nesquena/hermes-webui (MIT) — design lifted, not code

- **Designs adopted (no source code copied)** (P1 Control Station, 2026-05-15):
  - `lib/run-events.ts` — the run-adapter envelope field set (monotonic `seq`,
    `run_id`, single `terminal` envelope) follows
    `docs/rfcs/hermes-run-adapter-contract.md`. (Upstream pin `5e518b1c`.)
  - `lib/run-journal.ts` — the append-only turn-journal + fsync-before-gate
    durability boundary + `?after_seq=` replay semantics follow
    `docs/rfcs/turn-journal.md`. (Upstream pin `5e518b1c`.)
- **Designs adopted (no source code copied)** (P3 HIL gate unification,
  2026-05-19):
  - `lib/gate-inbox.ts` — the `GateResult` resolution envelope
    (`accepted: boolean`, `status: "accepted" | "not-active" | "unsupported"`,
    optional human `message`) follows the `ControlResult` dataclass in
    `api/runtime_adapter.py` and the resolution-status contract in
    `docs/rfcs/hermes-run-adapter-contract.md`. faro narrows the status set to
    exactly the control-resolution subset and mirrors hermes' `safe_message`
    convention (set only when NOT accepted).
  - `lib/run-engine.ts` (approved-set replay) — the per-session
    approval-allowlist *pattern* (an approved tool-call key is not re-prompted)
    **observed in hermes-webui's `api/routes.py` `approve_session(sid, key)`
    consumption layer**. faro **diverges deliberately**: the allowlist is
    rebuilt from the append-only run journal (P1 Q2 source-of-truth invariant)
    rather than held in-memory per session, so it survives SDK-resume re-entry
    and a service restart between gate and answer.
- **Upstream repository**: https://github.com/nesquena/hermes-webui
- **Upstream commits referenced**: P1 envelope/turn-journal lift @ `5e518b1c`;
  P3 `GateResult`/approved-set design lift @
  `71c70352c113c57bef959b751e276c38b2c6caf1` (branch `master`). The earlier P1
  lift is unchanged and NOT re-vendored.
- **License**: MIT, `Copyright (c) 2025 Hermes Web UI Contributors`. Only the
  RFC/design *patterns* were adopted; no Python/runtime source was copied. The
  external Nous-Hermes agent runtime — including the `tools.approval` module
  that actually implements `approve_session` (the webui only *consumes* it via
  an optional `try/except ImportError` import) — is explicitly NOT vendored or
  lifted; P3 reuses only the observable design pattern.

## nexu-io/open-design (Apache-2.0)

- **Files adapted from this project** (P2 Studio-as-Surface, 2026-05-18):
  - `lib/projects-path.ts` — `validateProjectPath`, `isSafeId` (incl. the
    security-critical pure-dot `/^\.+$/` guard), and `resolveExistingPrefix`
    ported **verbatim** from `apps/daemon/src/projects.ts`. **Modification:**
    TypeScript types added over the upstream `@ts-nocheck` JS; `assertUnderReal`
    is a faro-mapped variant of upstream `resolveSafeReal` — same
    descendant-symlink defense (realpath + ENOENT→`resolveExistingPrefix`
    fallback + `rootReal+sep` containment + `EPATHESCAPE`), but the lexical
    gate is delegated to faro's pre-existing `lib/security.ts:assertUnder`
    (itself a byte-for-byte port) and realpath is async via
    `node:fs/promises`.
  - `lib/quick-switch.ts` — `scoreMatch` (tiers 1000/500/250/100/0), `baseName`,
    and `nextCursor` ported **verbatim** from
    `apps/web/src/components/QuickSwitcher.tsx`. **Modification:** `scoreMatch`
    takes a `name: string` (upstream took a `ProjectFile` whose `.name` was
    read); `baseName` is exported; the upstream `localStorage` recents store
    and `baseDir`/`SKIP_DIRS`/`templates`/`tabs` were NOT ported (faro recency
    = the SQLite `updated_at`/`created_at` columns).
  - `lib/quick-switch.server.ts` is faro-original (server union over
    projects/artifacts/runs); it only *imports* the vendored pure functions —
    no upstream code is copied into it (hence no in-file vendor header).
- **Upstream repository**: https://github.com/nexu-io/open-design
- **Upstream commit referenced**: `34f66113a0f2391714d081d848e7dc48a5222de0`
  (2026-05-18; public, default branch `main`).
- **NOTICE**: no `NOTICE` file exists upstream at the referenced commit, so
  Apache-2.0 §4(d) imposes no NOTICE-redistribution obligation; the in-file
  headers in `lib/projects-path.ts` / `lib/quick-switch.ts` + this entry
  satisfy §4(b)/§4(c).
- **License**: Apache License, Version 2.0 — https://www.apache.org/licenses/LICENSE-2.0
  Licensed under the Apache License, Version 2.0; you may not use these files
  except in compliance with the License. Files adapted here carry an in-file
  attribution header and a "Modified" note per Apache-2.0 §4(b)/§4(c). The
  full license text is available at the URL above.
