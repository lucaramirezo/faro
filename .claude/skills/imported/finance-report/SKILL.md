---
name: finance-report
description: Single-page quarterly financial report — masthead + hero KPIs, revenue/burn charts, P&L table, highlights, outlook narrative.
attribution:
  repo: nexu-io/html-anything
  license: Apache-2.0
  commit: b799c28
---

# Template: Financial Report

Re-authored in English for faro from the structure of the upstream
`next/src/lib/templates/skills/finance-report` brief (nexu-io/html-anything,
Apache-2.0, @b799c28). No upstream prose is copied. The shared anti-AI-slop
visual directives are prepended by faro's generation assembler — this brief
only adds the section map and the finance-specific details.

## Intent

Produce a single-page quarterly financial report that combines hard numbers,
charts, and written narrative. Use the user's real financials (revenue, burn,
P&L lines, MRR/ARR, runway). Compute deltas from the figures given; never
fabricate amounts.

## Layout (top to bottom)

- **Masthead + hero KPIs** — company, quarter, report title; a row of 4 hero
  KPIs (e.g. revenue, growth %, burn, runway) with period-over-period deltas.
- **Revenue & burn charts** — income vs. expenditure trend over the periods
  provided; a second chart for the metric the user emphasizes (MRR, margin…).
- **P&L summary table** — line items down, periods across; zebra striped,
  sticky header, right-aligned tabular numerics, total/subtotal rows bold.
- **Highlights** — ~5 bullet callouts: the quarter's material movements.
- **Outlook** — a short forward-looking narrative (guidance, risks).
- **Methodology** — a collapsed `<details>/<summary>` footer.

## Design details

- **Charts are inline SVG or CSS-drawn only** — no CDN chart lib, no
  `<script src>`, no `fetch` (render CSP is `connect-src 'none'`). Every chart
  has an explicit container height for layout stability.
- Sober, almost editorial finance tone — think a board deck page, not a
  marketing site. One primary color; green/red reserved strictly for
  positive/negative financial movement.
- The numbers reconcile: hero KPIs, chart values, and P&L table agree.
- Tabular numerics everywhere money appears; consistent currency and unit
  labeling; thousands separators.
