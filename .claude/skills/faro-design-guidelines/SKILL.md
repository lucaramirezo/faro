---
name: faro-design-guidelines
description: Use this skill whenever generating UI components, copy, or visual artifacts for faro. Enforces the locked shadcn Luma palette + Geist fonts + spacing/radius tokens. Triggers on "/faro design", "build a faro page", "design a faro card".
---

# faro design guidelines (skeleton)

## Locked tokens (Phase 0)

- **Theme:** shadcn/ui Luma preset (`b2D0wqNxT`). Dark by default; light theme to be defined Phase 1.
- **Fonts:** Geist Sans (UI), Geist Mono (KPIs/codes).
- **Pink accent rule:** reserved. Faro is *not* KULT — no full-strength `#FF1493`. Luma neutrals and muted oranges only.
- **Density:** comfortable; ample whitespace (≥1.5rem grid base).
- **Radius:** Luma's defaults (don't override).

## To be defined in Phase 1

- Per-panel layouts (Home / Cost / Dreams / ...)
- Card patterns
- Motion grammar
- Empty states
- Loading skeletons

## Anti-patterns

- Inter font (avoid — Geist is the chosen pairing).
- Symmetric centered layouts (favor asymmetric, content-first).
- Generic AI-slop purple gradients.

## References

- [Anthropic `frontend-design` skill](https://github.com/anthropics/skills/tree/main/skills/frontend-design) — aesthetic guardrails.
- [`shadcn-ui/ui` skill](https://github.com/shadcn-ui/ui/tree/main/skills/shadcn) — installed at user scope; consult its `customization.md` for Tailwind v4 `@theme inline` patterns when adding/overriding tokens.
