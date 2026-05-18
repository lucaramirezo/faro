---
name: dashboard
description: Single-page admin/analytics dashboard — fixed sidebar + top bar + KPI grid + 1–2 charts + recent-activity list. Charts inline SVG/CSS.
attribution:
  repo: nexu-io/html-anything
  license: Apache-2.0
  commit: b799c28
---

# Template: Admin Dashboard

Re-authored in English for faro from the structure of the upstream
`next/src/lib/templates/skills/dashboard` brief (nexu-io/html-anything,
Apache-2.0, @b799c28). No upstream prose is copied. The shared anti-AI-slop
visual directives are prepended by faro's generation assembler — this brief
only adds the section map and the dashboard-specific details.

## Intent

Produce a standard single-page operations / analytics dashboard that combines
status metrics, trend charts, and a recent-activity feed. Use the user's real
metrics and entities; drive the card and row counts from the supplied content.

## Layout

- **Fixed left sidebar** — wordmark at top, a grouped nav list, a compact user
  block pinned to the footer. Collapses gracefully below the `md:` breakpoint.
- **Top bar** — page title, a search field, a notifications affordance, and an
  avatar. Sticky to the top of the content column.
- **KPI card grid** — 3–5 cards across: value + label + a small trend
  indicator. The most important metric may span two columns.
- **Primary charts** — one or two (line / area / bar) sized to the data.
- **Recent activity** — a bottom list: actor, action, target, relative time.

## Design details

- **Charts are inline SVG or CSS-drawn only** — no CDN chart lib, no
  `<script src>`, no `fetch` (render CSP is `connect-src 'none'`). Every chart
  sits in a container with an explicit height so the grid stays stable.
- The sidebar is structural furniture, not the focus: muted, low-contrast;
  the content column carries the color and data.
- A real information hierarchy — primary KPIs large and first, secondary
  metrics smaller. No uniform grid of identical glance-less cards.
- Single accent color used only for the active nav item, primary actions, and
  positive trends.
