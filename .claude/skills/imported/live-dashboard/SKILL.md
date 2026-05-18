---
name: live-dashboard
description: Notion-style team overview — header + window selector, KPI grid, 7-day sparklines, activity feed, task table. Presentational only, no polling.
attribution:
  repo: nexu-io/html-anything
  license: Apache-2.0
  commit: b799c28
---

# Template: Live Team Dashboard

Re-authored in English for faro from the structure of the upstream
`next/src/lib/templates/skills/live-dashboard` brief (nexu-io/html-anything,
Apache-2.0, @b799c28). No upstream prose is copied. The shared anti-AI-slop
visual directives are prepended by faro's generation assembler — this brief
only adds the section map and the live-dashboard-specific details.

## Intent

Produce a Notion-style single-page team overview. Use the user's real team,
metrics, and tasks. "Live" here is presentational — render a snapshot; if the
user's data is partial, fall back to clearly-shaped seed values rather than
inventing precise figures. **Never** add polling, websockets, or any fetch:
the render sandbox CSP is `connect-src 'none'`.

## Layout (top to bottom)

- **Header** — team name/identity and a time-window selector (Today / 7d /
  30d) that is visual only (no data fetch).
- **KPI card grid** — the team's headline metrics with period deltas.
- **7-day trends** — a row of sparklines, one per KPI.
- **Activity feed** — avatar (CSS) + actor + action + relative timestamp.
- **Task table** — a Notion-database-style table: title, assignee, due,
  status pill; zebra striped, sticky header.

## Design details

- Notion conventions: subtle callouts, toggle/`<details>` sections,
  database-style table with pill status badges (shared badge primitive).
- **Sparklines and any trend visuals are inline SVG or CSS only** — no chart
  lib, no `<script src>`, no `fetch`. Each has an explicit container height.
- The window selector and any "refresh" affordance are inert/visual; do not
  wire them to network calls. Make that obvious (e.g. they re-key the same
  in-page snapshot), never fake a live connection.
- Calm, information-dense, low-chrome — the data and the task table are the
  surface; furniture stays muted.
