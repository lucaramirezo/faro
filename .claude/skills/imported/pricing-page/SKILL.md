---
name: pricing-page
description: Standalone pricing page — billing toggle, 2–3 tier cards with one highlighted, a feature-comparison table, and an FAQ.
attribution:
  repo: nexu-io/html-anything
  license: Apache-2.0
  commit: b799c28
---

# Template: Pricing Page

Re-authored in English for faro from the structure of the upstream
`next/src/lib/templates/skills/pricing-page` brief (nexu-io/html-anything,
Apache-2.0, @b799c28). No upstream prose is copied. The shared anti-AI-slop
visual directives are prepended by faro's generation assembler — this brief
only adds the section map and the pricing-specific details.

## Intent

Produce a complete standalone pricing page that makes the value↔price
alignment immediately legible. Use the user's real tier names, prices, and
feature lists; the number of tiers and comparison rows follows the content.

## Layout (top to bottom)

- **Header** — a short value line and a monthly/annual billing toggle that
  visibly changes the displayed prices (annual shows the saved amount).
- **Tier cards** — 2–3 side by side. Highlight the recommended tier with a
  ring and a small badge (not a loud gradient fill). Each card: name, price,
  a one-line who-it's-for, the key feature bullets, and a CTA.
- **Comparison table** — every feature as a row; check / dash / tier-specific
  cell values per column. Sticky header; the recommended column subtly tinted.
- **FAQ** — a `<details>/<summary>` accordion, one entry per real question.
- **Bottom CTA** — a final, low-pressure call to action.

## Design details

- Emphasis on the recommended tier comes from weight, border, and a small
  badge — never from a purple gradient or a glow.
- Prices are the focal point: large, tabular numerics, currency and period
  unambiguous. The billing toggle must actually swap the numbers.
- Honest, sober B2B tone — no dark patterns, no fake "limited time" urgency,
  no pre-checked upsells.
- Responsive: cards stack to one column on mobile; the comparison table
  becomes horizontally scrollable rather than crushed.
