---
name: pm-spec
description: Single-page PRD / product spec — title + status pill, problem, success metrics, scope, user stories, design notes, rollout, open questions.
attribution:
  repo: nexu-io/html-anything
  license: Apache-2.0
  commit: b799c28
---

# Template: Product Spec / PRD

Re-authored in English for faro from the structure of the upstream
`next/src/lib/templates/skills/pm-spec` brief (nexu-io/html-anything,
Apache-2.0, @b799c28). No upstream prose is copied. The shared anti-AI-slop
visual directives are prepended by faro's generation assembler — this brief
only adds the section map and the spec-specific details.

## Intent

Produce a single-page PRD that makes product decisions transparent and
reviewable. Use the user's real problem, metrics, and stories. Don't
summarize away detail — the document is a working artifact, not a teaser.

## Layout (top to bottom)

- **Title bar** — feature/product name + a status pill (Draft / In review /
  Approved / Shipped) + owner and date.
- **Problem & why now** — the user pain and the reason to do it now.
- **Success metrics** — 3–5 quantified targets (the definition of done).
- **Scope** — explicit in-scope and out-of-scope lists, side by side.
- **User stories** — Given / When / Then, one card per story.
- **Design notes** — approach, key decisions; CSS/SVG placeholder mockups, no
  external images.
- **Rollout plan** — phases / gates / flags.
- **Open questions** — an explicit list of unresolved items with owners.

## Design details

- Document-grade typography: a clear heading hierarchy, comfortable measure
  (≤ 70ch in prose blocks), generous section spacing. This must read as a
  serious internal doc.
- The status pill uses the shared badge primitive — outline by default,
  colored only for Approved (success) / Shipped.
- Scope in/out and the open-questions list are scannable (two-column or
  checklist), not buried in paragraphs.
- No charts, no marketing tone. Restraint signals seriousness.
