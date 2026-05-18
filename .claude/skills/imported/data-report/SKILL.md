---
name: data-report
description: CSV/JSON/tabular data → a visualized analytics report — KPI cards, charts, data table, written insights. Charts are inline SVG/CSS only.
attribution:
  repo: nexu-io/html-anything
  license: Apache-2.0
  commit: b799c28
---

# Template: Data Report

Re-authored in English for faro from the structure of the upstream
`next/src/lib/templates/skills/data-report` brief (nexu-io/html-anything,
Apache-2.0, @b799c28). No upstream prose is copied. The shared anti-AI-slop
visual directives are prepended by faro's generation assembler — this brief
only adds the section map and the data-report-specific details.

## Intent

Turn the user's real tabular data (CSV / TSV / JSON / pasted table) into a
single-file analytics report. Parse the actual dataset provided — every
number, label, and series must come from the input. Never fabricate values,
never use placeholder figures. Let the number of KPIs, chart series, and
table rows follow what the data actually contains.

## Layout (top to bottom)

- **Header** — report title, the data's time range, and a one-line data-source
  attribution.
- **KPI card grid** — 3–5 primary metrics. Each card: the value, a
  period-over-period delta (with up/down sign and color), and a small
  sparkline.
- **Charts** — at least two: pick the chart type from the data shape
  (time series → line/area; categorical → bar; composition → stacked bar or a
  small pie). One coordinated palette across all charts.
- **Data table** — a readable subset (or all) of the rows: zebra striping,
  hover state, sticky header, right-aligned numerics with tabular figures.
- **Insights** — 3–5 short written findings derived from the data, in a terse
  weekly-report voice (one emoji marker per finding is fine).
- **Methodology** — a collapsed `<details>/<summary>` footer: how metrics were
  computed, any caveats.

## Design details

- **Charts are inline SVG or CSS-drawn only.** No `<script src>`, no
  Chart.js / ECharts / D3 from a CDN, no `fetch`/polling — the render sandbox
  CSP is `connect-src 'none'` and external scripts are blocked, so a
  CDN-charted page renders blank. Hand-draw axes, bars, and lines as SVG
  `<path>`/`<rect>`/`<polyline>` or CSS.
- **Give every chart and sparkline an explicit container height** (e.g.
  sparkline ~40px, primary chart ~240–280px). A chart in a height-less
  container collapses or thrashes the layout — fixed-height containers are
  mandatory for layout stability.
- Restrained, professional palette: one primary plus a neutral grayscale;
  positive deltas green, negative red, never decorative color.
- Numbers are the hero — tabular numerics, aligned decimal points, clear unit
  labels. The report reads like an analyst made it, not a template.
