---
name: deck-pitch
description: 10-slide investor pitch deck (16:9) — cover → problem → solution → why now → product → market → traction → model → GTM/team → ask.
attribution:
  repo: nexu-io/html-anything
  license: Apache-2.0
  commit: b799c28
---

# Template: Investor Pitch Deck

Re-authored in English for faro from the structure of the upstream
`next/src/lib/templates/skills/deck-pitch` brief (nexu-io/html-anything,
Apache-2.0, @b799c28). No upstream prose is copied. The shared anti-AI-slop
visual directives are prepended by faro's generation assembler — this brief
only adds the slide map and the deck-specific details.

## Intent

Produce a single-file 10-slide seed/Series-A pitch deck. Use the user's real
company, numbers, and narrative. Each slide is one idea — do not crowd. If the
user supplies fewer/more sections, adapt the count but keep the arc.

## Layout (slide order — 10 full-bleed 16:9 slides)

1. **Cover** — wordmark, one-line positioning, the round + ask.
2. **Problem** — the pain, made concrete.
3. **Solution** — the product's core idea in one frame.
4. **Why now** — the timing wedge / market shift.
5. **Product** — how it works; CSS/SVG mock, not an external image.
6. **Market** — TAM / SAM / SOM, sourced.
7. **Traction** — the headline growth metric as a hand-drawn bar/line chart.
8. **Business model** — how money is made; unit economics if provided.
9. **Go-to-market & Team** — channel motion + the people.
10. **Ask** — the raise, use of funds, and contact.

## Design details

- **Honor the prepended visual bar.** This deck is dark-default, Geist, no
  purple gradient hero — the generic white-background/blue-purple-gradient
  pitch-deck look is explicitly NOT wanted. Confident type scale, lots of
  negative space, one accent.
- Each slide is a full-viewport `100vw × 100vh` section; navigate via
  scroll-snap plus ←/→ and Space/PageDown keyboard handlers. A subtle slide
  counter (e.g. `03 / 10`) in a corner.
- **The traction chart is inline SVG or CSS bars only** — no CDN chart lib, no
  `<script src>`, no `fetch` (render CSP is `connect-src 'none'`). Give it a
  fixed height inside the slide.
- One assertion per slide, set large; supporting detail small and secondary.
  Investors skim — the headline must carry the slide alone.
- All figures are the user's real numbers. No invented TAM, no placeholder
  logos, no fake traction.
