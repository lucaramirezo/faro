---
name: recommender
description: Feature spec for the faro Recommender panel — surfaces dream-emitted Surfaced claims tagged `promote_to: "skill" | "wiki"` and emits `/install-skill <slug>` copy-as-prompt cards. Closes PRD §14.11 phase gate.
version: 1.0
---

# Recommender — Phase 3 feature spec

This is the *spec* for the `app/(dashboard)/recommender/page.tsx` surface. Visual tokens are owned by the `faro-design-guidelines` skill — do not duplicate palette/font/spacing here.

Source of truth: this DESIGN.md is folded from the 2026-05-13 research spike at `drafts/research/2026-05-13-faro-recommender-research.md` (full citations there). The research report's §3.3 contains the `/install-skill` command body verbatim — `Task 2` of `.agents/plans/faro-phase-3.md` copies it into `.claude/commands/install-skill.md`.

## 1. Sources

The recommender is a **promotion pipeline**, not a marketplace browser. It does not federate searches; it surfaces claims that the dream pipeline tagged `promote_to: skill | wiki` and the user approved.

**Source order (locked):**

1. **Anthropic skills** (primary) — `github.com/anthropics/skills/skills/<slug>`. Apache 2.0; doc skills source-available (flag in preview, don't block). Native `/plugin install` integration.
2. **ClawHub** (secondary, behind `FARO_RECOMMENDER_CLAWHUB=1`) — `clawhub install <slug>`. Semver + signed digest. Writes to OpenClaw workspace, NOT `~/.claude/skills/`; recommender emits the `clawhub install` command in copy-as-prompt.

**Excluded for v1:** `skills.sh` (91k aggregated entries, no quality gate); `claude-skill-registry` (low signal); `netresearch marketplace` (small, unverified license).

Multi-source aggregation is a v2 feature behind `FARO_SKILL_SOURCES`.

## 2. Skill-card data shape

The card *is* a preview of the eventual SKILL.md plus the provenance contract back to the dream that surfaced it.

```typescript
// lib/recommender/types.ts (Phase 3)
export type SkillCard = {
  // Identity
  slug: string;                    // kebab-case, ≤64 chars (Claude Code SKILL.md `name` rule)
  display_name: string;            // human-readable, falls back to slug
  description: string;             // ≤1,536 chars (Claude Code listing cap)
  when_to_use?: string;            // optional, concatenated with description

  // Provenance (dream pipeline → recommender)
  promote_to: "skill" | "wiki";    // pipeline auto-tag OR HIL override
  source_run_id: string;           // dream run that emitted this claim
  source_claim_id: string;         // pointer back to claim_decisions row
  confidence: "low" | "medium" | "high";  // enum, NOT number (decision 2)
  approved_at: string;             // ISO 8601, when Surfaced+approved

  // Registry resolution
  source_registry: "anthropic" | "clawhub" | "github" | "local";
  source_url: string;              // canonical repo or registry page
  install_path?: string;           // e.g. "anthropics/skills/skills/docx" or "openclaw/clawhub:slug@1.2.3"
  version?: string;                // semver if registry provides one, else null
  license?: string;                // SPDX or "source-available"

  // Safety / scope
  scope: "user" | "project";       // recommender default: "user"
  requires?: { env?: string[]; bins?: string[] };  // pulled from clawhub metadata.openclaw.requires
  allowed_tools?: string[];        // surfaces SKILL.md `allowed-tools` frontmatter
  has_scripts?: boolean;           // true if skill bundles executable code (raises trust bar)

  // Tags + freshness
  tags: string[];                  // max 5
  last_updated?: string;           // ISO 8601 from registry, optional
  author?: string;                 // registry author field
};
```

**Field rationale (highlights):**

- `slug`, `display_name`, `description`, `when_to_use` mirror Claude Code skill frontmatter so the card *is* a preview of the eventual SKILL.md.
- `promote_to`, `source_run_id`, `source_claim_id`, `confidence`, `approved_at` are the **provenance contract**. Without `source_claim_id` we can't undo a bad recommendation.
- `source_registry` + `install_path` are enough to actually fetch the skill at install time. Opaque per-registry — Anthropic uses `<org>/<repo>/<subpath>`; ClawHub uses `<slug>@<semver>`.
- `has_scripts` is the **single most important safety boolean** — text-only skills are safe to preview; script-bundled skills demand explicit `cat scripts/*` review.

Confidence sourcing: `claim_decisions` row's confidence enum. Recommender does not invent confidence — if the claim has none, the card renders without a confidence chip.

## 3. Install command UX

See `drafts/research/2026-05-13-faro-recommender-research.md` §3 for the full spec.

**Key points:**

- `/install-skill <slug>` does the resolution + preview + confirm + atomic copy + audit log. Body lives at `/home/luca/projects/lwiki/.claude/commands/install-skill.md` after Task 2.
- Recommender just emits the copy-as-prompt template — it does NOT shell out. User pastes into a Claude Code session.
- Copy template for `promote_to: skill`:
  ```
  /install-skill <slug>  # from dream <run_id>, claim <claim_id>, confidence <low|medium|high>
  ```
- Copy template for `promote_to: wiki` (Phase 3.5 — `/promote-to-wiki` command shipped separately):
  ```
  /promote-to-wiki <claim_id>  # surfaced <date>, source: dream-report.md#L<line>
  ```

## 4. Recommender panel UX

### 4.1 Layout

Single page at `app/(dashboard)/recommender/page.tsx`. RSC fetches `claim_decisions JOIN pipeline_runs` rows filtered by `status='approved' AND category='surfaced' AND promote_to IS NOT NULL`. Client island only for filter-state + copy-button toast.

```
┌─────────────────────────────────────────────────────────────────┐
│ Recommender                                                     │
│ Surfaced from dreams. Approved candidates, ready to install.    │
│                                                                 │
│ [ All ] [ Skill (12) ] [ Wiki (4) ]      Sort: [ Newest ▾ ]    │
│                                                                 │
│ ┌────────────────────────┐ ┌────────────────────────┐           │
│ │ /debug-port-forward    │ │ /llm-cost-explainer    │           │
│ │ ◆ skill • clawhub      │ │ ◆ skill • anthropic    │           │
│ │ Diagnose tailscale...  │ │ Surface OpenRouter...  │           │
│ │ ◔ med  ⚠ has scripts   │ │ ◑ high                 │           │
│ │ from dream 2026-05-09  │ │ from dream 2026-05-12  │           │
│ │ [ Copy as prompt  ⌘C ] │ │ [ Copy as prompt  ⌘C ] │           │
│ └────────────────────────┘ └────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

- **Grid, not list.** Each card is a self-contained pitch. Two columns desktop, one mobile.
- **Filter tabs:** All / Skill / Wiki. Counts in labels. URL-query-param-driven (`?source=skill|wiki|all`) so RSC scopes the render.
- **Sort:** Newest first by default; secondary "Highest confidence". Stale (>30d) cards dim a badge.
- **Card chips:** registry source icon (anthropic/clawhub), confidence dot (◔/◑/●), and `⚠ has scripts` warning when bundled code is present.
- **Primary action:** "Copy as prompt" — clipboard write + Sonner toast. No other action.
- **Secondary actions (overflow menu):** Dismiss (writes `dismissed_at`), Open source (external link), View dream (deep-link to dream report HTML).

### 4.2 Empty state

```
No recommendations yet.

The recommender surfaces dream-pipeline claims tagged "promote to skill" or
"promote to wiki" after you approve them. Approve some claims in
[Dreams →]/dreams and they'll show up here.
```

Single CTA button → `/dreams` (locked per decision 7 — NOT `/dream-review`).

### 4.3 Promote-override pill (Surfaced claim card extension)

For each Surfaced claim in `/dreams/[runId]`, the existing `components/dreams/ClaimCard.tsx` gains a segmented control beneath the Approve/Tweak/Deny strip:

```
Promote to:  [ Skill ] [ Wiki ] [ None ]
```

Click hits `setPromoteToAction(runId, claimId, "skill"|"wiki"|null)` server action; revalidates `/dreams/[runId]` + `/recommender`. Override is independent of approve/deny — Luca can approve a claim AND set promote_to in either order.

Only renders for `category === "surfaced"`. Hidden for merged/resolved/pruned.

## 5. Safety + open

### 5.1 Trust gates (`/install-skill`)

1. **Path traversal:** hard-refused. Non-negotiable.
2. **Wildcard `allowed-tools`:** refused without `--accept-broad-tools`. Catches `Bash(*)`.
3. **`scripts/` directory:** warned in preview; user responsible for review. Future v2: `--review-scripts` pages each script to terminal before confirm.

**Not protected:** malicious SKILL.md body that prompts Claude to do destructive things when invoked. Defense is downstream — Claude Code's permission system (decision 6). Faro doesn't try to second-guess that.

### 5.2 Sandboxing

None at install. Install is a file copy. The skill executes on `/<slug>` invocation, governed by Claude Code's standard tool permissions. No faro-side sandbox layer in Phase 3.

### 5.3 Version pinning

- **Anthropic:** no per-skill version; pin via commit SHA in audit log only. Re-running `/install-skill` always fetches `main`. Acceptable since Anthropic's repo moves slowly.
- **ClawHub:** real semver. `/install-skill <slug>@<version>` supported via `clawhub install`. Default `@latest`.

### 5.4 Wiki-promotion loop

Out of scope for `/install-skill`. Phase 3.5 ships `.claude/commands/promote-to-wiki.md` which:
1. Reads the claim from `claim_decisions`.
2. Generates a wiki page proposal under `drafts/wiki-candidates/<slug>.md`.
3. User reviews + moves into `wiki/<category>/<slug>.md` (manual) or runs `/ingest` to formalize.

Never auto-writes into `wiki/` — preserves the "raw is immutable, wiki is curated" discipline.

## 6. Locked decisions (2026-05-13)

Per `drafts/research/2026-05-13-faro-recommender-research.md` §6, confirmed in alignment session with Luca:

1. **Source order:** Anthropic primary, ClawHub secondary behind `FARO_RECOMMENDER_CLAWHUB=1` flag.
2. **`confidence` field:** enum `low | medium | high` (not number).
3. **`promote_to` storage:** column on `claim_decisions`; pipeline auto-tags; UI overrides.
4. **`/install-skill` defaults:** user scope only; refuses same-name at project scope; refuses wildcard `allowed-tools` without `--unsafe`/`--accept-broad-tools`.
5. **Wiki-promotion:** separate Phase 3.5 — only the `promote_to: "wiki"` tag is set here; the `/promote-to-wiki` command is deferred.
6. **Trust ceiling:** SKILL.md body prompt-injection is Claude Code's responsibility, not faro's. Faro shows preview + emits audit log.
7. **Empty-state CTA:** `/dreams` (not `/dream-review`).
8. **Audit log:** `~/.claude/skills/.install.log` JSONL with `faro_run_id` + `faro_claim_id` back-links.

## 7. Open follow-ups (Phase 3.5+)

- `/promote-to-wiki <claim_id>` command + `drafts/wiki-candidates/` workflow.
- `/update-skill <slug>` showing diff between installed and registry-latest.
- `--review-scripts` flag on `/install-skill` for per-file terminal preview.
- Multi-source aggregation via `FARO_SKILL_SOURCES`.
- Confidence sort + stale-card dimming (currently "Newest" only).
- Dismiss action + `dismissed_at` column on `claim_decisions`.
