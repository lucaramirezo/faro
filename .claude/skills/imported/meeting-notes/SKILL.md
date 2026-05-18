---
name: meeting-notes
description: Modern meeting-minutes page — title/attendees, agenda checklist, decisions cards, an action-items table (owner/due/status), next meeting.
attribution:
  repo: nexu-io/html-anything
  license: Apache-2.0
  commit: b799c28
---

# Template: Meeting Notes

Re-authored in English for faro from the structure of the upstream
`next/src/lib/templates/skills/meeting-notes` brief (nexu-io/html-anything,
Apache-2.0, @b799c28). No upstream prose is copied. The shared anti-AI-slop
visual directives are prepended by faro's generation assembler — this brief
only adds the section map and the minutes-specific details.

## Intent

Produce a single-page set of meeting minutes that foregrounds decisions and
accountability. Use the user's real attendees, agenda, decisions, and action
items. The action-items table is the centerpiece — never drop an owner or a
due date that was provided.

## Layout (top to bottom)

- **Title bar** — meeting name, date/time, and attendees (initials/avatars
  drawn in CSS, no external images).
- **Agenda** — the topics as a checklist (covered / deferred).
- **Decisions** — each outcome as its own rounded card: the decision, the
  rationale in one line, and who made the call.
- **Action items** — a table with exactly: Owner | Item | Due | Status.
  Status uses the shared badge (open / in-progress / done).
- **Next meeting** — date and the carried-over agenda, in a compact footer.

## Design details

- Decisions and action items are visually dominant; discussion notes are
  secondary. The reader's question is "what was decided and who owes what" —
  answer it above the fold.
- Action-item statuses are the only colored elements (badge variants).
- Calm, document-grade layout — no charts, no marketing tone, comfortable
  measure for any prose.
- Faithful to the input: every attendee, decision, and action item provided
  appears; nothing invented, nothing summarized away.
