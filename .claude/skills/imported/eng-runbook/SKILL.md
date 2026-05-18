---
name: eng-runbook
description: Single-page on-call runbook — service overview, alerts table, dashboards, copy-able ops commands, on-call rotation, incident checklist.
attribution:
  repo: nexu-io/html-anything
  license: Apache-2.0
  commit: b799c28
---

# Template: Engineering Runbook

Re-authored in English for faro from the structure of the upstream
`next/src/lib/templates/skills/eng-runbook` brief (nexu-io/html-anything,
Apache-2.0, @b799c28). No upstream prose is copied. The shared anti-AI-slop
visual directives are prepended by faro's generation assembler — this brief
only adds the section map and the runbook-specific details.

## Intent

Produce a single-page on-call runbook a responder can act from at 3am. Use
the user's real services, alerts, commands, and rotation. Optimize for
fast scanning and copy-paste, not prose.

## Layout (top to bottom)

- **Service overview** — what it is, its dependencies, and a small
  topology/dependency diagram drawn as inline SVG (no external lib).
- **Alerts table** — alert name, severity, threshold, what it means, first
  action. Severity color-coded with the shared badge.
- **Dashboards** — a compact card of links/labels to the relevant dashboards.
- **Common procedures** — task → a monospace command block with a one-click
  copy button (inline JS, no external dependency).
- **On-call rotation** — this week / next week, with contacts.
- **Incident checklist** — an ordered, checkable list: detect → mitigate →
  communicate → resolve → post-mortem.

## Design details

- Operational density over whitespace luxury — this is a reference, not a
  landing page. Monospace for every command, hostname, and identifier.
- Copy buttons must actually work with inline JS only (clipboard write);
  degrade to selectable text if clipboard is unavailable.
- Severity is the only place strong color appears (critical/red, warn/amber),
  using the shared badge variants — everything else is calm and neutral.
- The topology diagram is inline SVG/CSS, never an external image or chart lib
  (render CSP is `connect-src 'none'`).
