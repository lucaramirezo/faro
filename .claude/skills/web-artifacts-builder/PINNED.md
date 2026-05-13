---
upstream: anthropics/skills
sha: b9e19e6f44773509fbdd7001d77ff41a49a486c1
audited: 2026-05-13
re-pin-cadence: annually, or on Anthropic's request
---

# web-artifacts-builder — pin record

This subdirectory is vendored from [`anthropics/skills`](https://github.com/anthropics/skills) at SHA `b9e19e6f44773509fbdd7001d77ff41a49a486c1` (2026-04-20). Do not edit the vendored files — re-vendor from upstream when bumping the pin.

## Why this SHA

Phase 4 alignment-round verification on 2026-05-13 confirmed `b9e19e6` is the path-HEAD on `main` for `skills/web-artifacts-builder/`. The commit itself is a LICENSE.txt copyright-holder fill-in; no code or contract drift versus the prior code-touching commit on the path (folder restructure, 2025-12-01). So this pin captures effective HEAD.

## How to re-pin

```bash
# Inspect upstream
gh api repos/anthropics/skills/commits/main?path=skills/web-artifacts-builder \
  | jq -r '.[0:5][] | "\(.sha[0:7]) \(.commit.message | split("\n")[0]) \(.commit.author.date)"'

# If a newer commit lands and the diff is acceptable:
git clone https://github.com/anthropics/skills.git /tmp/skills-clone
cd /tmp/skills-clone && git checkout <new-sha>
cd -
rm -rf faro/.claude/skills/web-artifacts-builder
cp -r /tmp/skills-clone/skills/web-artifacts-builder faro/.claude/skills/
# Update this PINNED.md with the new SHA + audit date
```

## What this skill does

Bundles a React + Tailwind v3 artifact into a single self-contained `bundle.html` via Parcel + `html-inline`. Each artifact lives at the repo root; running `bash scripts/bundle-artifact.sh` produces `bundle.html` with all CSS/JS inlined. faro emitters call this script after generating the React source.

## Contract for faro emitters (see DESIGN.md §3.3, §9)

1. Generate React source (Agent-SDK authoring mode) OR start from a pre-baked template under `<emitter>/templates/`.
2. Run `bash faro/.claude/skills/web-artifacts-builder/scripts/bundle-artifact.sh`.
3. Run `node faro/scripts/inject-bridge.ts <bundle.html>` to insert the highlight-postMessage script before `</body>`.
4. Move/copy the bundle to `drafts/artifacts/<date>/<run_id>/<label>.html`.
5. Cap at 5 MB; warn above 1 MB.

The studio scanner (`lib/artifacts.ts`) picks it up on next walk.

## Constraints

- Node 18+ (faro is Node 22; satisfied).
- Skill auto-installs global `pnpm` on first authoring run.
- Skill scaffolds Tailwind 3.4.1; faro is Tailwind v4. The artifact's CSS is fully inlined — no leakage into faro.
