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
  - `.claude/skills/imported/<skill>/SKILL.md` — the §6.8 acceptance fixture is
    re-authored in English from the `src/lib/templates/skills/saas-landing`
    brief structure (no verbatim upstream prose); see its `attribution:`
    frontmatter.
- **Upstream repository**: https://github.com/nexu-io/html-anything
- **Upstream commit referenced during the P1 port**: `b699e8a`
- **License**: Apache License, Version 2.0 — https://www.apache.org/licenses/LICENSE-2.0
  Licensed under the Apache License, Version 2.0; you may not use these files
  except in compliance with the License. Files adapted here carry an in-file
  attribution header and a "Modification" note per Apache-2.0 §4(b)/§4(c).
  The full license text is available at the URL above.

## nesquena/hermes-webui (MIT) — design lifted, not code

- **Designs adopted (no source code copied)** (P1 Control Station, 2026-05-15):
  - `lib/run-events.ts` — the run-adapter envelope field set (monotonic `seq`,
    `run_id`, single `terminal` envelope) follows
    `docs/rfcs/hermes-run-adapter-contract.md`.
  - `lib/run-journal.ts` — the append-only turn-journal + fsync-before-gate
    durability boundary + `?after_seq=` replay semantics follow
    `docs/rfcs/turn-journal.md`.
- **Upstream repository**: https://github.com/nesquena/hermes-webui
- **Upstream commit referenced**: `5e518b1c`
- **License**: MIT. Only the RFC *designs* were adopted; no Python/runtime
  source was copied (the Nous-Hermes agent runtime is explicitly NOT lifted).
