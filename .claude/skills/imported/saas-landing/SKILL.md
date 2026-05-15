---
name: saas-landing
description: Single-page SaaS landing page — maps the user's content onto hero / features / social-proof / pricing / FAQ / CTA sections.
attribution:
  repo: nexu-io/html-anything
  license: Apache-2.0
  commit: b699e8a
---

# Template: SaaS Landing

Re-authored in English for faro from the structure of the upstream
`src/lib/templates/skills/saas-landing` brief (nexu-io/html-anything,
Apache-2.0, @b699e8a). No upstream prose is copied. The shared anti-AI-slop
visual directives are prepended by faro's generation assembler — this brief
only adds the section map and the SaaS-specific details.

## Intent

Produce a complete, single-file SaaS product landing page. Map the user's
content onto the standard sections below; do not summarize the content away —
let the number of feature/pricing/FAQ items follow what the user actually
provided.

## Layout (top to bottom)

- **Top nav** — wordmark + a few section anchors + a sign-in link + the
  primary CTA button.
- **Hero** — one strong headline, a supporting subhead, two CTAs (primary +
  secondary), and a visual block (inline SVG or a CSS-drawn product mock — no
  external image).
- **Logo wall** — a restrained row of social-proof marks (text or inline SVG).
- **Features** — 3–6 feature cards, each an inline-SVG glyph + title + one
  tight sentence. Drive the count from the user's content.
- **How it works** — a 3-step numbered flow (number + title + one line each).
- **Pricing** — 2–3 tiers; highlight the recommended tier with a clear (non-
  purple) accent and a ring, not a gradient.
- **FAQ** — a `<details>/<summary>` accordion, one entry per real question.
- **Footer** — compact: links + copyright. No newsletter dark-patterns.

## Design details

- Modern but sober SaaS tone: confident type scale, generous whitespace, a
  single accent color. No glassmorphism, no purple gradient hero, no
  everything-centered stack.
- Responsive: handle at least the `md:` breakpoint; single-column on mobile.
- Cards use the shared card primitive radius; borders 1px; shadows restrained.
- Pricing emphasis comes from weight, border, and a small badge — never from a
  loud gradient fill.
- All numbers, names, and copy come from the user's content. No lorem ipsum,
  no "Your text here", no invented testimonials or metrics.
