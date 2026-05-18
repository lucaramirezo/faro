# faro — Agent OS Control Center

**Name:** faro (Spanish for *lighthouse*).
**Version:** v0.4 — Control Station *(updated 2026-05-15, iteration #5)*.
**Status:** Phases 0–4.5 SHIPPED (Phase 4.5 tested 2026-05-15 — mostly good, kept). Control Station (v0.4) specced; P0 = this PRD.
**Date:** 2026-05-15 *(iteration #5; #4 was Phase 4.5 on 2026-05-14; #1 was commit `4f1da07` on 2026-05-12)*
**Owner:** Luca; co-author: lwiki agent.
**Location:** `faro/faro-prd.md` (relocated here from repo root as part of Phase 0 scaffolding).
**Supersedes:** the dream-only scope of [`lwiki_ui/`](../lwiki_ui/) — retired at the end of Phase 1; AND the *content* of [`.agents/plans/faro-phase-4.6-agent-os.md`](../.agents/plans/faro-phase-4.6-agent-os.md) — its locked A/B/D workstreams re-sequence into the Control Station roadmap (§11) at increment ambition, not a rewrite.

---

## 0. Design philosophy

Faro is the **persistent HTML control surface** for every autonomous agent in Luca's stack — starting with [[lwiki]], then generalizing to [[refactor-canon]] and beyond. It is *not* a chat UI, *not* a reimplementation of Claude Code, *not* a SaaS. It is a single-user, Tailnet-only, file-native cockpit that does five things well:

1. **Shows what's happening** — sessions, costs, plan-limits, scheduled tasks, integration health.
2. **Surfaces what needs human input** — dream review, decision approvals, recommender candidates.
3. **Inventories what the agent owns** — skills, memory, integrations, knowledge sources.
4. **Renders artifacts** — links to (or embeds) HTML artifacts the agent produces for one-off rich content per [[unreasonable-effectiveness-of-html]].
5. **Generalizes across agents** — every panel is scoped to the active **profile** (`faro/lwiki`, `faro/refactor-canon`); switcher in the nav.
6. **Drives agents, not just views them** *(repositioned 2026-05-15, v0.4)* — faro launches, observes, gates (HIL), and hands off Claude Code runs. It is the **Control Station** of an agent OS for a solo operator running many agents. The studio (§6.6) is one surface; the spine is a run engine (§5.7).

**Control Station identity (2026-05-15).** The Shann Holmberg agent-org-chart is a *mental model only*, not a build target. faro is exactly one box in it — the control station. Company/department "brains" stay in [[refactor-canon]] / TRL Company Brain (faro never owns knowledge). The orchestrator role is unfilled — the operator routes manually via faro; heartbeat/reflection are pipelines faro *observes*, not a router. Workers are Claude Code sessions/subagents via the Agent SDK. No org-chart/orchestrator/multi-tenant abstractions ship until earned.

Core principles:

- **Local-first traceability.** Parse `~/.claude/projects/<slug>/*.jsonl` directly for usage data. Don't proxy through OTEL/Langfuse unless multi-user demand makes it pay. Falls back gracefully if files are absent.
- **File-state over services.** Every panel reads files first, hits services second. State writes go to the shared [`slack_agent/runs/state.db`](../slack_agent/runs/state.db) (SQLite WAL, already enforced in CLAUDE.md). Faro reads/writes via `better-sqlite3` from Node; Python slack_agent reads/writes via `sqlite3` — WAL guarantees safety.
- **HTML > Markdown for human-facing rich content.** Persistent panels are React Server Components + shadcn Luma. One-off rich artifacts (dream reports, weekly status, decision retros) are bundled via Anthropic's `web-artifacts-builder` skill and rendered by faro as embedded iframes or full pages.
- **Partner mode preserved.** Wiki writes are autonomous. Outbound actions and memory mutations require explicit approval — faro is the surface that *captures* the approval, never that bypasses it.
- **Profile slug + active pill in the nav from v0.1.** Even when `lwiki` is the only profile, `faro/lwiki ● active` ships in v0.1 so the multi-agent generalization at Phase 4 is a data migration, not a UI rewrite.
- **Perfect-fit architecture over reuse-existing.** Where the existing stack fits (Caddy on pei, shared SQLite WAL with slack_agent, Tailscale Serve, Ionos DNS, GitLab origin), we use it. Where it doesn't (Python+Jinja for a shadcn-Luma dashboard), we don't. **Decision: Full Next.js + shadcn Luma**, not the Hybrid D originally sketched. Rationale: true Luma fidelity needs Radix React; Basecoat is Luma-flavored at best. Luca's stated taste + KULT Pro stack reuse + the dream-card UX needing Framer Motion + Embla + cmdk all push the same direction.
- **Lift, don't depend** *(added 2026-05-15, v0.4)*. External code is vendored into faro **with attribution, never tracked as a dependency** (open-design, html-anything, hermes-webui — see §5.7, §15.2). The Agent SDK is the *only* agent integration — never a CLI subprocess (it runs on Luca's Max subscription/OAuth). Jinja stays for deterministic approval pages; LLM-constrained generation only for rich one-off artifacts (the determinism boundary, §5.7).

---

## 1. Mission

**Mission statement.** Faro is the lighthouse for Luca's agents: a single, opinionated, beautiful HTML surface that makes autonomous AI activity legible, reviewable, and re-routable without a single Slack scroll.

**Three commitments:**

- **Legible.** A 30-second glance answers: how much have I spent today, what is the agent doing right now, what is waiting on me, is anything failing.
- **Reviewable.** Every agent-proposed change (memory mutations, drafts, decisions) is reviewable at *claim-level* granularity, not document-level. Per-decision state, bulk operations, defer/needs-info paths.
- **Re-routable.** When a recommended skill, a new integration, a re-run, or a new agent profile arrives, faro is the surface that captures the action — copy-as-prompt, install-skill, switch-profile.

**Control Station thesis (added 2026-05-15, v0.4).** A cockpit that only *views* finished artifacts is lwiki_ui with tabs. The control station *drives*: faro launches a Claude Code run, streams its tokens/tools live, gates it (approve/clarify) inline, journals it for crash-safe replay, and hands off the result. Where faro sits in the Hermes mental model:

| Hermes layer | Reality in Luca's stack | faro's role |
|---|---|---|
| Company / department brains | refactor-canon + TRL Company Brain | none — faro links out, never owns knowledge |
| Orchestrator | unfilled — the human operator, manually, via faro | the manual routing surface |
| Worker agents | Claude Code sessions / subagents (Agent SDK) | launched + observed + gated by faro |
| Docker isolation | pei + per-project workspaces | surfaced, not owned |
| **Control station** | was `lwiki_ui/` → faro | **the entire product** |

---

## 2. Target users

| Phase | User | Mode | Auth |
|---|---|---|---|
| v0.1 | Luca alone | single-user, Tailnet-only | `Tailscale-User-Login` header allowlist |
| v0.2 | Luca + Duo + Marc on `refactor-canon` profile | per-profile owner-list; `lwiki` stays single-user | same header, per-profile ACL — OR Caddy+Keycloak if public domain demanded |
| Future | multi-tenant SaaS? | out of scope |

Technical comfort: high. CLI-comfortable, accepts terse copy, expects keyboard-first interactions.

**Auth decision (2026-05-12):** Tailscale-only for v0.1. Caddy + Ionos domain + Keycloak deferred until canon multi-user demand arrives — adding them now is half-day of work with zero benefit for single-user.

**Reaffirmed (2026-05-15, v0.4):** single-user / solo-operator is the near-term target. "AI OS for any company/team" is the North Star — the `profile_id` seam (§5.2) is the only multi-tenant work that ships; actual tenancy (auth isolation, per-tenant data, RBAC) is explicitly **not** built in v0.4.

---

## 3. MVP scope (Phase 0 + Phase 1)

### In scope (Phase 0 + 1)

- [ ] **Scaffold `faro/` Next.js monorepo** at lwiki repo root. Move `faro-prd.md` into `faro/`.
- [ ] **Next.js 16 + React 19 + Tailwind v4 + shadcn Luma preset** via `shadcn/create` (or hand-extract from [tweakcn.com](https://tweakcn.com)).
- [ ] **GitHub mirror CI** — `.gitlab-ci.yml` job that `git subtree push --prefix=faro/ github faro main` on every push to main. Owner: `github.com/lucaramirezo/faro` (public OR private — decide at first push).
- [ ] **Auth middleware** reading `Tailscale-User-Login` header with owner allowlist from `faro/profiles/lwiki.yml`.
- [ ] **Profile-slug nav.** Top bar shows `faro/lwiki ● active` from v0.1; "switch profile" dropdown is wired but inert (only profile listed).
- [ ] **Home panel.** Three KPI cards: today $, this-week $, **subsidy captured this week** (`equivalent_api_cost − $200/mo Max prorated`).
- [ ] **Subscription card.** Claude Max + OpenRouter at v0.1; token-API toggle exposes per-token equivalents. Manual-entry stubs for ChatGPT/Gemini.
- [ ] **Plan limits & windows.** Claude Code 5h block + weekly rollup via `ccusage blocks --json` and `ccusage daily --json`. Auth-mode pill ("OAuth/Max" vs "API key") from `~/.claude/.credentials.json`.
- [ ] **Sharded dream review.** Vertical card list grouped by category (Merged / Resolved / Pruned / Surfaced). Per-card 3-button (Approve / Tweak / Deny) + kebab (Defer / Needs-info). Bulk "Approve all N" per section. Live materialize to `memory.md.next`; Finalize promotes. Keyboard J/K/A/T/D/U.
- [ ] **Decision audit trail.** Per-claim row in `claim_decisions` table; per-decision JSON file at `raw/decisions/<date>/<run_id>/<claim_id>.json`.
- [ ] **Decommission `lwiki_ui/`** at end of Phase 1: stop systemd unit, cut Tailscale Serve over to faro, delete the package in Phase 2.

### Out of scope (deferred)

- ❌ Multi-agent profile switcher (Phase 4)
- ❌ Skills inventory and parser (Phase 2)
- ❌ Memory tree view (Phase 2)
- ❌ Integrations grid (Phase 2)
- ❌ Scheduled tasks panel (Phase 2)
- ❌ Activity table + per-day focus bar (Phase 3)
- ❌ Recommender + skill-install cards (Phase 3 — phase-gated on DESIGN.md)
- ❌ Knowledge graph (Phase 3)
- ❌ Langfuse v3 self-host + Sessions iframe (Phase 4)
- ❌ Rich-artifact pipeline via `web-artifacts-builder` for dream reports (Phase 5 — phase-gated)
- ❌ Multi-user RBAC + Caddy + Keycloak (v0.2+)
- ❌ Public domain via Ionos (v0.2+)

---

## 4. User stories

**Phase 0 / Phase 1 (MVP):**

1. *As Luca, I want a faro home page that loads in <1s on my Tailnet and shows today's spend, this week's spend, and the subsidy captured vs my $200 Max sub — so I know at a glance whether the autonomous work is paying for itself.* ✅
2. *As Luca, I want to see how much of my 5-hour Claude Code block I've consumed, plus when it resets, so I don't get surprised by a usage-limit-reached during a long session.* ✅
3. *As Luca, I want to review today's dream by **claim**, not by document — each pruned/merged/resolved/surfaced item gets its own Approve/Tweak/Deny card, with bulk "Approve all merges" for the safe cases.* ✅
4. *As Luca, I want to **defer** a dream claim ("come back to me tomorrow") and **request more info** on a thin-evidence claim, instead of forcing yes/no every time.* ✅
5. *As Luca, I want the nav to show `faro/lwiki ● active` so when I later add canon as a profile, switching is one click and I never get confused which agent I'm looking at.* ✅
6. *As Luca, I want the existing Slack dream-approval card to still work (Approve/Deny/Re-run as-is) — the new sharded UI is additive, not destructive.* ✅
7. *As Luca, I want auth mode (OAuth/Max vs API key) visible everywhere costs are shown — so I never confuse a free-from-sub call with a billed call.* ✅
8. *As Luca, I want my faro/ subtree pushed to a personal GitHub repo automatically on every GitLab push to main — so faro is portable, portfolio-able, and decoupled from the private lwiki vault.* ✅

**Phase 2+ (representative):**

9. *As Luca, I want the Skills panel to show every skill installed at user and project scope, with last-used date, run-count, estimated $-saved this week — so I can prune unused skills and double down on what works.*
10. *As Luca, I want the Memory panel to render the memory tree with backlink counts — Obsidian handles the graph view; faro just shows hierarchy and outliers.*
11. *As Luca, I want the Activity panel to show focus-hours per day as a horizontal bar, with the per-day session count and total turns — to validate my working rhythm is healthy.*
12. *As Luca, I want a recommender panel that surfaces "skill candidates" extracted from the Surfaced section of dreams, with a one-click copy-as-`/install-skill` prompt — closing the loop between dreams and tooling.*
13. *As Luca, I want to switch from `faro/lwiki` to `faro/refactor-canon` and see canon's home, sessions, dreams, integrations — same UI, scoped state.*

---

## 5. Architecture

### 5.1 Stack — Full Next.js + shadcn Luma (decided 2026-05-12)

```
faro/                            # Next.js monorepo at lwiki repo root
├── faro-prd.md                  # this file, moved here in Phase 0
├── README.md                    # public-facing readme (mirrored to GitHub)
├── package.json                 # Bun-managed
├── bun.lock
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── components.json              # shadcn registry config (Luma preset)
├── biome.json                   # linter+formatter
├── app/
│   ├── layout.tsx               # root layout, dark by default
│   ├── globals.css              # Tailwind v4 @theme + Luma tokens
│   ├── (dashboard)/             # route group, shares dashboard layout
│   │   ├── layout.tsx           # sidebar/topbar, profile slug, ⌘K
│   │   ├── page.tsx             # Home
│   │   ├── cost/page.tsx        # Subscription + plan limits
│   │   ├── dreams/page.tsx      # Dream queue
│   │   ├── dreams/[runId]/page.tsx        # Sharded review
│   │   ├── skills/page.tsx      # Phase 2
│   │   ├── memory/page.tsx      # Phase 2
│   │   └── ...                  # Phase 2+
│   └── api/
│       ├── home/route.ts
│       ├── cost/blocks/route.ts
│       ├── dreams/[runId]/claims/route.ts
│       ├── dreams/[runId]/claims/[claimId]/route.ts
│       ├── dreams/[runId]/finalize/route.ts
│       └── profile/route.ts
├── components/
│   ├── ui/                      # shadcn Luma components (40+)
│   ├── home/                    # KPICard, Sparkline, ...
│   ├── cost/                    # SubscriptionCard, BlockProgress, ...
│   ├── dreams/                  # ClaimCard, BulkApproveBar, LivePreview, ...
│   ├── nav/                     # TopBar, ProfileSlug, CommandPalette
│   └── shared/
├── lib/
│   ├── db.ts                    # better-sqlite3 reader/writer, WAL mode
│   ├── ccusage.ts               # shell-out wrapper (blocks --json, daily --json)
│   ├── pricing.ts               # LiteLLM model_prices JSON fetcher + cache
│   ├── jsonl.ts                 # ~/.claude/projects/*.jsonl parser (fallback)
│   ├── auth.ts                  # Tailscale-User-Login validation
│   ├── profiles.ts              # profile resolver, reads faro/profiles/*.yml
│   └── slack-bridge.ts          # state.db status updates for slack-message-ts
├── middleware.ts                # Next.js middleware — gates ALL routes on Tailscale header
├── profiles/
│   └── lwiki.yml                # active profile config (see §5.2)
├── public/
│   └── favicon.ico              # auth-exempt (existing pattern preserved)
├── scripts/
│   ├── install.sh               # Phase 0 — bun install + shadcn add + DB migrate
│   └── migrate.ts               # claim_decisions + future tables
└── tests/
    ├── unit/                    # vitest
    ├── e2e/                     # playwright on Tailnet
    └── fixtures/                # sample jsonl, dream reports
```

**Runtime (production):** **Node 22+** (`/usr/bin/node`). Bun (1.3.13+) is install + dev only — does NOT run faro in production because `bun:sqlite` ships SQLite 3.51.2 (inside a known WAL bug window) and `better-sqlite3` lacks Bun ABI support (see `oven-sh/bun#4290`). One systemd unit on pei: `node .next/standalone/server.js`, listens on `127.0.0.1:8766`.
**Build:** `bun next build` produces `.next/standalone/` with bundled dependencies. Output committed to git? **No** — built fresh on pei via post-pull hook OR in GitLab CI which pushes the build artifact.
**State:** shared SQLite at `slack_agent/runs/state.db` (existing). Faro opens it with `better-sqlite3` in WAL mode. Python slack_agent continues writing concurrently — WAL handles it. Pei rebuilt system SQLite to 3.53.1 from source (Ubuntu jammy apt only ships 3.51); see `infra/pei/README.md` §SQLite.
**Auth:** `middleware.ts` reads `Tailscale-User-Login` request header; rejects with 403 if not in `profiles/lwiki.yml.owner_logins`. Tailscale Serve auto-strips spoofed copies before they hit Node.
**Edge (v0.1):** **Tailscale Serve directly fronts Node** at port `:8443` on the existing `pei.taild21074.ts.net` host (port-based, NOT sub-path `/faro` — Tailscale `--set-path` strips the prefix and conflicts with Next.js basePath). Pei runs **Docker Caddy** (Duo's setup, since 2026-03) for internal services; faro added the apt Caddy binary at `/usr/bin/caddy` for validation, with the systemd unit **masked** to prevent conflict. `Caddyfile.faro` is committed and validated (loopback `:8767 → :8766`) but **NOT in either Caddy instance's active config** in v0.1. v0.2 imports the snippet into Docker Caddy + flips Tailscale Serve to point at Caddy when the public Ionos domain + Keycloak OIDC land.
**Dev:** `bun dev` locally; talks to a copy of `state.db` (sync down from pei via existing rsync pattern).

### 5.2 Profile boundary (single-tenant now, multi-tenant later)

Every queryable table gets a `profile_id TEXT NOT NULL DEFAULT 'lwiki'` column. Migration is additive (Phase 0). `lib/profiles.ts` returns the active profile from a session cookie (default `lwiki`); switcher writes the cookie. v0.1 has only one profile; v0.2 wires multiple.

Per-profile config lives at `faro/profiles/<slug>.yml`:

```yaml
profile: lwiki
display_name: "lwiki — Luca's second brain"
agent_root: /home/luca/projects/lwiki
memory_dir: memory
state_db: slack_agent/runs/state.db
jsonl_root: /home/luca/.claude/projects/-home-luca-projects-lwiki
heartbeat_path: memory/heartbeat.md
slack_workspace: TRL
owner_logins:
  - lucaramirezol@gmail.com
status: active
```

`refactor-canon` gets its own `faro/profiles/refactor-canon.yml` in Phase 4 (or in canon repo, depending on how we split — defer).

### 5.3 Data flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ~/.claude/projects/<slug>/*.jsonl    (Claude Code session telemetry)    │
│ ~/.claude/stats-cache.json           (pre-aggregated daily rollups)     │
│ ~/.claude/.credentials.json          (OAuth presence → auth mode)       │
└────────────────────┬────────────────────────────────────────────────────┘
                     │ ccusage CLI shell-out (Bun subprocess)
                     ▼
              ┌───────────────────┐    ┌──────────────────────────┐
              │ lib/ccusage.ts    │◄───┤ lib/pricing.ts (LiteLLM) │
              └─────────┬─────────┘    └──────────────────────────┘
                        │
        ┌───────────────┴────────────────┐
        ▼                                ▼
┌─────────────────┐              ┌─────────────────────────┐
│ usage_blocks    │              │ Next.js Server Components│
│ (SQLite, NEW)   │──── read ───►│ + Route Handlers         │
└─────────────────┘              └────────────┬────────────┘
                                              │
                                       Server-side render
                                              │
                                              ▼
                                  ┌───────────────────────┐
                                  │ HTML + RSC payload    │
                                  │ → browser             │
                                  │ shadcn Luma components│
                                  │ Embla + Framer Motion │
                                  │ for dream cards       │
                                  └───────────────────────┘
                                              ▲
                                              │ Tailscale Serve + Caddy
                                              │ injects Tailscale-User-Login
                                              │
                                       middleware.ts gate
                                              │
                                          owner login
                                              │
                                              ▼
                                  ┌─────────────────────────┐
                                  │ Slack agent (existing)  │
                                  │ pipeline_approvals.py   │
                                  └────────────┬────────────┘
                                               │
                            ┌──────────────────┴──────────────────┐
                            │  shared SQLite state.db (WAL mode)  │
                            │   read+write from BOTH Bun + Python │
                            └─────────────────────────────────────┘
```

### 5.4 Shared state.db contract (CRITICAL)

`slack_agent/runs/state.db` is the existing single source of truth for pipeline_runs. faro reads and writes the SAME database via `better-sqlite3`. WAL mode is enabled (per CLAUDE.md). Concurrent access rules:

| Operation | Owner | Writes |
|---|---|---|
| Insert new dream/reflection pipeline_run | Python (dreams cron, reflection cron) | yes |
| Update slack_message_ts after Block Kit post | Python (slack_agent) | yes |
| Update pipeline_runs.status from Slack click | Python (slack_agent) | yes |
| **Insert claim_decisions rows on dream page load** | **Bun (faro)** | **yes (NEW)** |
| **Update claim_decisions.status on per-claim click** | **Bun (faro)** | **yes (NEW)** |
| **Update pipeline_runs.status from faro Finalize** | **Bun (faro)** | **yes (NEW)** |
| **Append raw/decisions/<...>.json** | **Bun (faro)** | **yes (NEW)** |
| **Trigger apply_dream (file ops + git commit)** | **Bun (faro)** — duplicates Python logic in TS | **yes (NEW)** |
| Slack bulk-approve (when triggered from Slack) | Python — calls into `apply_dream` | yes |

The Slack "Approve" / "Deny" / "Re-run as-is" buttons continue to work unchanged. When Slack approves, all pending claim_decisions for that run get bulk-stamped via a small additive Python helper added to `pipeline_approvals.py`. faro's Finalize button does the inverse — promotes per-claim decisions to a full apply.

**Why duplicate file-ops logic in TS instead of shelling out to Python:** the existing apply_dream is 30 lines of `cp + mv + git`. Reimplementing in TS keeps faro self-contained, avoids spawn-on-every-request, and the duplication is bounded. Both implementations call the same canonical paths.

### 5.5 Sharded dream model

NEW table `claim_decisions`:

```sql
CREATE TABLE claim_decisions (
  claim_id      TEXT PRIMARY KEY,         -- sha256(category + section + content)[:16]
  run_id        TEXT NOT NULL,            -- joins pipeline_runs.run_id
  profile_id    TEXT NOT NULL DEFAULT 'lwiki',
  category      TEXT NOT NULL,            -- merged|resolved|pruned|surfaced
  section_path  TEXT NOT NULL,            -- e.g. "Current Focus" / "Open Questions"
  claim_text    TEXT NOT NULL,            -- the raw bullet text
  evidence      TEXT,                     -- JSON: [{kind:"line", path, lineno, snippet}, ...]
  status        TEXT NOT NULL,            -- pending|approved|denied|tweaked|deferred|needs_info
  tweak_text    TEXT,
  reviewer_note TEXT,
  decided_at    TIMESTAMP,
  decided_by    TEXT,                     -- tailscale login
  FOREIGN KEY (run_id) REFERENCES pipeline_runs(run_id)
);
CREATE INDEX idx_claim_decisions_run    ON claim_decisions(run_id, profile_id);
CREATE INDEX idx_claim_decisions_status ON claim_decisions(status, profile_id);
```

**Materialization protocol:**

1. Dream emits `dream-report.md` + `memory.md` (existing) plus a **parsed sidecar** `claims.json` (NEW — added in Phase 1 to [`dreams/dream.py`](../dreams/dream.py)).
2. On first visit to `/dreams/[runId]`, the Next.js route reads `claims.json` and inserts pending `claim_decisions` rows.
3. Each user action POSTs to `/api/dreams/[runId]/claims/[claimId]` updating status + optionally writing to staging `memory.md.next` in the draft dir.
4. **Finalize** button (enabled when ≥1 claim approved/tweaked) merges staging → `memory/memory.md`, archives the draft (same semantics as Python `apply_dream`), runs git commit. Unresolved claims roll into `deferred` and surface in tomorrow's dream input.
5. Slack `[Approve all] [Deny all]` buttons keep working: bulk-stamp every pending claim with the chosen verb. Backward-compatible.

### 5.6 Artifact storage + index *(added 2026-05-13, Phase 4)*

Faro's artifact studio (see §6.6) reads from a single, append-only artifact index that mirrors files on disk. Markdown is the agent ↔ agent format; HTML earns the rendering cost wherever a human has to *steer* (per [the_unreasonable_effectiveness_of_html](../raw/articles/2026-05-12-unreasonable-effectiveness-of-html.md)).

**On-disk layout:**

- `drafts/artifacts/<date>/<run_id>/**/*.{html,md,svg,json,code}` — agent-produced artifacts awaiting review (dream reports, briefs, plan grids, ingest reviews, wiki-lint triage). The canonical HTML artifact unit is `bundle.html` — a single self-contained file produced by Anthropic's [`web-artifacts-builder`](https://github.com/anthropics/skills/tree/main/skills/web-artifacts-builder) skill (React 18 + Vite + Parcel + `html-inline`, CSS/JS/data-URIs inlined).
- `wiki/artifacts/<slug>/` — promoted artifacts (weekly status reports, locked plan grids, retros). Survive the dream lifecycle.
- The two roots are NEVER mixed; `drafts/` is ephemeral, `wiki/` is durable.

**SQLite index (NEW in Phase 4 migration):**

```sql
CREATE TABLE artifacts (
  artifact_id   TEXT PRIMARY KEY,         -- sha256(profile_id + relative_path + content_hash)[:16]
  run_id        TEXT,                     -- joins pipeline_runs.run_id; NULL for hand-promoted wiki artifacts
  profile_id    TEXT NOT NULL DEFAULT 'lwiki',
  source        TEXT NOT NULL,            -- 'drafts' | 'wiki'
  mime          TEXT NOT NULL,            -- 'text/html' | 'text/markdown' | 'image/svg+xml' | 'application/json' | 'text/x-code'
  path          TEXT NOT NULL,            -- absolute path
  label         TEXT,                     -- human-readable: "Dream review — 2026-05-13"
  emitter       TEXT,                     -- 'dreams' | 'brief' | 'plan-feature' | 'wiki-lint' | 'ingest' | 'slidev' | 'manual'
  bytes         INTEGER NOT NULL,
  content_hash  TEXT NOT NULL,            -- sha256 of file content
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  promoted_at   TIMESTAMP,                -- non-null when moved drafts → wiki
  FOREIGN KEY (run_id) REFERENCES pipeline_runs(run_id)
);
CREATE INDEX idx_artifacts_run     ON artifacts(run_id, profile_id);
CREATE INDEX idx_artifacts_emitter ON artifacts(emitter, profile_id, created_at DESC);
CREATE INDEX idx_artifacts_source  ON artifacts(source, profile_id, created_at DESC);
```

**Scan protocol** (`lib/artifacts.ts`):

1. On `/studio` route mount: walk `drafts/artifacts/` and `wiki/artifacts/` under the active profile's `agent_root`.
2. For each file, compute `content_hash` (sha256), derive `artifact_id`, upsert into `artifacts` table. Skipped if `(artifact_id, content_hash)` already present.
3. Emitter classification: lookup table by directory pattern (`drafts/artifacts/<date>/<run_id>/dream-report.html` → `dreams`, etc.).
4. List view in the gallery filters by `profile_id` and groups by `run_id` (reverse-chronological); standalone-wiki artifacts get a synthetic `run_id = 'wiki-<slug>'`.

**Lifecycle:**

- Agents (dreams cron, brief cron, ingest skill, wiki-lint skill, plan-feature skill) write to `drafts/artifacts/...` and append a row.
- The user, via the studio toolbar, can `[Promote to wiki]` an artifact — copies file to `wiki/artifacts/<slug>/`, sets `promoted_at`, writes a git commit ("artifact: promote `<label>`").
- Prune policy: TBD — see §15.3 open question. Default in Phase 4: no auto-prune; quarterly manual sweep via a future `/artifact-gc` skill.

**Security:** all bundle.html files are rendered in `<iframe sandbox>` (see §6.6.4). Path operations go through the existing `_assert_under` TS port.

### 5.7 Control Station architecture *(added 2026-05-15, v0.4)*

v0.4 turns the cockpit into the **Control Station**. The studio (§6.6) becomes one surface; the new spine is a **run engine** built ON TOP OF the Phase 4.5 `lib/agent-sdk.ts:streamChat` path (kept — tested 2026-05-15, mostly good; NOT rebuilt).

**Agent integration: Claude Agent SDK only.** Never a CLI subprocess. Reason: the SDK runs on Luca's Max subscription/OAuth — `ANTHROPIC_API_KEY` unset, headless via `claude setup-token` (the OAuth-billing-leak + setup-token rules). This reaffirms decision 23's chat-provider lock and extends it to the run engine.

**Run engine pieces (new, additive):**

- **Run-adapter event contract** — a runtime-agnostic envelope (`run_id`, monotonic `seq`, kinds `token | tool | approval | clarify | done | error`, plus a reconnect/replay spec). faro's canonical wire format. Model lifted from `nesquena/hermes-webui` `docs/rfcs/hermes-run-adapter-contract.md` (MIT — design, not code).
- **Turn-journal** — crash-safe write-ahead journal of every run; enables reconnect + replay after a faro restart. Design lifted from hermes-webui's turn-journal RFC (MIT).
- **`runs` + `run_events` tables** — additive SQLite, `profile_id`-scoped (single-tenant now; multi-tenant seam only).
- **HIL gate as a run primitive** — the `approval` / `clarify` event kinds unify with the existing dreams/claims approval surfaces (one gate, many sources). Partner mode preserved: faro captures, never bypasses.

**Boundary contract.** faro is the control station ONLY. Company/department "brains" stay in [[refactor-canon]] / TRL Company Brain — faro links out, never owns knowledge. The orchestrator role is unfilled; heartbeat/reflection are autonomous pipelines faro *observes*, explicitly NOT a router. No automated orchestration, no department/orchestrator abstractions, no org-chart ship in v0.4.

**Lift posture.** All external code is vendored into faro **with attribution, never tracked as a dependency**; no per-skill license audit (accepted 2026-05-15):

| Source | License | What faro lifts | Explicitly NOT lifted |
|---|---|---|---|
| `nexu-io/open-design` | Apache-2.0 | sniper edit-mode bridge / source-patches / projects / stub-guard | — |
| `nexu-io/html-anything` | Apache-2.0 | SDK-compatible event-shaping + `extract-html` + SSE convert-route pattern + `SKILL.md` design directives + ~75 skills | spawn/argv **CLI** layer; WeChat/Zhihu/Weibo/XHS exports + CJK-only skills |
| `nesquena/hermes-webui` | MIT | run-adapter event contract, approval/clarify HIL flow, turn-journal replay design | the Nous-Hermes agent runtime; process-global-env concurrency model |

> Note: `nesquena/hermes-webui` is a UI for Nous Research's *single* Hermes Agent — NOT the Holmberg org-chart. The "teams of agents" concept is unbuilt upstream backlog (their issue #719). The org-chart is net-new and out of scope.

**Determinism boundary.** Jinja stays for deterministic approval/review pages (dreams, claims, code-review — fast, free, Tailscale-safe). LLM-constrained generation (html-anything's `SKILL.md` → Claude writes single-file HTML, rescued from the Write tool, streamed live) is **only** for rich one-off artifacts — its cost/latency/non-determinism is wrong for review gates. Extends §6.6.3; does not replace it.

---

## 6. Feature specification

### 6.1 Home

**Above the fold:**

- KPI card 1 — *Today's AI spend* — sum of `usage_blocks.cost_today_usd` across all providers. Sparkline: last 7 days.
- KPI card 2 — *This week's AI spend* — 7-day rolling. Sparkline: same.
- KPI card 3 — *Subsidy this week* — `this_week_equivalent_api_$ − prorated_sub_$`. Positive = sub is paying for itself. Color: green if positive, amber if negative <20%, red if negative >20%.

**Below the fold:**

- "Pending your attention" — count of pending dream claims, pending drafts, integration errors. Each chip links to the relevant panel.
- "Recent dreams" — last 5 dreams with status pill, link to sharded review.
- "Bot services" — green/red pills for Slack agent, Telegram agent, heartbeat cron, reflection cron, dreams cron.

Source for `pending your attention`: existing `memory/heartbeat.md` (parsed) + `pipeline_runs WHERE status='pending'`.

### 6.2 Subscription

- One card per subscription. v0.1 ships **Claude Max** and **OpenRouter**.
- Claude Max card: $200/mo, auth mode badge ("OAuth/Max"), this-month consumption in tokens, equivalent-API-$ toggle (per-million-tokens pricing dropdown next to it).
- OpenRouter card: live credits remaining via `/api/v1/credits`, last 10 generations via `/generation`, cost per generation.
- Manual-entry stubs: ChatGPT Plus, Gemini Advanced, GitHub Copilot — placeholder cards with "[manual entry]" badge and a textarea for monthly token estimates.

### 6.3 Plan limits & windows

- **Claude Code 5-hour block** — `ProgressCircle` (shadcn/Tremor) showing % tokens used; subtitle "resets at HH:MM" (from `ccusage blocks --json currentBlock.endTime`). When no `usageLimitResetTime` is detected, fall back to projection-based estimate.
- **Weekly rolling** — horizontal bar; weekly token cap is published by Anthropic as a range, so display raw count + range as context.
- **OpenRouter credits** — same shape; cap is explicit credit balance.
- **Auth mode pill** at the top of the panel — "OAuth/Max" (weekly limit applies) vs "API key" (per-request billing, no weekly limit).

### 6.4 Sharded dream review (the centerpiece)

**Page layout** (vertical card list, NOT carousel — research-decided 2026-05-12):

```
┌─ faro/lwiki ● active ──────────────────── ⌘K  @luca ─┐
├─ Home  Cost  Skills  Memory  Dreams ●  ...            │
│                                                       │
│ ┌─ Dream 2026-05-12 ──────────────── 8/17 done ────┐  │
│ │ Summary: "Major churn this week..."  [Finalize ▸]│  │
│ │                                                  │  │
│ │ ── PRUNED ─────────────── [Approve all 3]        │  │
│ │ ┌──────────────────────────────────────────────┐ │  │
│ │ │ Remove stale 'Phase 5 DEFERRED' line         │ │  │
│ │ │ ▸ evidence: memory.md:10                     │ │  │
│ │ │ ▸ superseded: 2026-05-11 dream redesign      │ │  │
│ │ │ [✓ Approve] [✎ Tweak] [✗ Deny] ⋯ Defer  ?    │ │  │
│ │ └──────────────────────────────────────────────┘ │  │
│ │ ...more pruned cards                              │  │
│ │                                                  │  │
│ │ ── MERGED ───────────────── [Approve all 5]      │  │
│ │ ── RESOLVED ─────────────── [Approve all 4]      │  │
│ │ ── SURFACED ─────────────── (review individually)│  │
│ │                                                  │  │
│ └──────────────────────────────────────────────────┘  │
│                                                       │
│ Live preview: memory.md.next                 [⌨ J/K/A/T/D/U] │
└───────────────────────────────────────────────────────┘
```

**Behavior:**

- Section headers sticky on scroll.
- Cards are React Server Components for initial render; per-card actions are Server Actions (Next.js 16) so they round-trip without client JS for the action itself.
- Framer Motion `layoutId` animates card → decided state. Embla supports an optional "carousel mode" toggle (off by default).
- Live-Preview pane on the right shows `memory.md.next` diff with syntax highlighting (Shiki).
- Keyboard shortcuts (global listener in a client component): J/K move focus, A/T/D act, U undoes last (10s window, Sonner toast).
- Bulk "Approve all N" per section — Server Action with single-row Linear-style Undo.
- Finalize button enabled when `count(approved) + count(tweaked) >= 1`. Confirmation modal: "Apply 8 decisions; 9 deferred to next dream. Proceed?" → triggers TS port of `apply_dream` flow.

### 6.5 Cross-cutting: nav + profile slug + command palette *(refactored 2026-05-13, Phase 4 Track B1)*

**Replaces the v0.1 horizontal `TopBar` with a vertical sidebar + 48px top locator bar.** Reference: shadcn [`sidebar-07` block](https://ui.shadcn.com/blocks/sidebar) ships a `team-switcher.tsx` that maps directly to the agent/profile dropdown. The Vercel dashboard redesign + Linear + Notion all converge on this layout for multi-scope tools.

**Layout shape:**

```
┌─[sidebar 240px / collapsed 56px]──────┬─[48px top bar]──────────────────────────────────────┐
│ ▾ luca / lwiki ● active               │ [☰] luca / lwiki  · local Claude daemon             │
│ ── Today ──                           │                              ⌘K [search] [🔔] [☾]  │
│   Home                                ├─────────────────────────────────────────────────────┤
│   Dreams ●                            │                                                     │
│   Cost                                │                                                     │
│ ── Build ──                           │                  main content                       │
│   Skills                              │                                                     │
│   Studio  (new in Phase 4)            │                                                     │
│   Memory                              │                                                     │
│ ── Ops ──                             │                                                     │
│   Integrations                        │                                                     │
│   Scheduled                           │                                                     │
│   Activity                            │                                                     │
│ ────────                              │                                                     │
│ ▾ @luca   ☾                           │                                                     │
└───────────────────────────────────────┴─────────────────────────────────────────────────────┘
```

**Sidebar (`components/nav/Sidebar.tsx` — replaces `TopBar.tsx`):**

- shadcn `sidebar-07` base — collapsible-to-icons. Expanded `--sidebar-width: 240px`; collapsed `56px`.
- `SidebarHeader` = `team-switcher.tsx` for the agent dropdown. v0.1 lists `lwiki ● active`; v0.2 adds `refactor-canon ○ inactive`. Status pill reflects jsonl activity in the last 24h.
- Three `SidebarGroup`s: **Today** (Home, Dreams, Cost), **Build** (Skills, Studio NEW, Memory), **Ops** (Integrations, Scheduled, Activity).
- `SidebarFooter` = user avatar dropdown + theme toggle.

**Top bar (`components/nav/TopLocator.tsx` — NEW):**

- 48px height (`--header-height: calc(var(--spacing) * 12)`), sticky `top-0 z-10`, `border-b border-border/50`.
- Slots (left → right):
  - `[SidebarTrigger]` (collapse/expand chevron — shadcn ships this).
  - **LocatorPill** — `<Button variant="ghost" size="sm">luca / lwiki <ChevronsUpDown/></Button>`. Clicking it opens the same profile dropdown as the sidebar's team-switcher (single source of truth).
  - **Source helper** — dot-separated muted text to the right of the pill: `· local Claude daemon` (laptop) or `· pei (Tailscale Serve)` (server-rendered remote). Computed from auth-mode (§6.3 pill) + runtime detection.
  - Spacer.
  - **Search ⌘K** — invokes the existing `CommandPalette` at `components/nav/CommandPalette.tsx`. Add typeahead sources in Phase 4: skills, workspaces, recent artifacts, dream runs. Shows `⌘K` kbd badge.
  - **Bell** — notification popover. Reads pending items from `memory/heartbeat.md` + `SELECT * FROM pipeline_runs WHERE status='pending'`. One-click "Open in studio" / "Open in dreams" per row.
  - **ThemeToggle** — `next-themes` light/dark; dark stays default. Persists via cookie.

**Command palette unchanged** — same component, additional sources. v0.1 commands kept ("go to dream", "open profile", "copy as prompt for…"); Phase 4 adds "open artifact <name>" and "send to Claude Code".

### 6.6 Artifact Studio *(added 2026-05-13, Phase 4 Track A — centerpiece)*

The studio is **gallery + provenance + handoff toolbar**, NOT a mini-IDE. Faro's user has Claude Code one keystroke away; in-browser editing would duplicate the writer and create sync conflicts with on-disk artifacts. This matches Anthropic's [Claude Design handoff-bundle pattern](https://www.anthropic.com/news/claude-design-anthropic-labs) (Apr 17 2026), Cursor Composer's per-artifact accept/reject, and Manus's atomic-evidence panel. See §14 decision 14 for the locked rationale.

**Route:** `/studio` (alias `/artifacts`). Reads from the `artifacts` table (§5.6).

**6.6.1 Three-pane layout**

```
┌─[gallery 240px]─────┬─[renderer flex]────────────────────────┬─[provenance 320px]──┐
│ ▼ Dream 2026-05-13  │ [Open in Claude Code] [Copy as prompt] │ Run a18b2c — dreams │
│   dream-report.html │ [Copy raw] [Pop out] [Highlight ▸]     │ • model: opus-4-7   │
│   claims.json       │                                        │ • cost: $0.42       │
│ ▼ Brief 2026-05-13  │ ┌─[iframe sandbox]───────────────────┐ │ • duration: 3m 12s  │
│   brief.html        │ │                                    │ │                     │
│ ▼ Ingest a1c3       │ │      rendered bundle.html          │ │ tool calls:         │
│   ingest-review     │ │      (Embla carousel, sliders…)    │ │ • Read memory.md    │
│ ▼ Wiki-lint b4d2    │ │                                    │ │ • Read raw/2026-…   │
│   triage.html       │ └────────────────────────────────────┘ │ • Write dream-…html │
└─────────────────────┴────────────────────────────────────────┴─────────────────────┘
```

- **Left pane (240px) — gallery.** Reverse-chronological list of artifacts, grouped by `run_id`. Each group shows the emitter name (dreams / brief / plan-feature / wiki-lint / ingest) and a phase badge (Replit Agent 4 pattern). Standalone wiki artifacts grouped under `wiki/<slug>`. Filter by profile (active profile only by default). No file tree — flat list is the cockpit primitive.
- **Center pane (flex) — mime-typed renderer.** Picked by `mime` column:
  - `text/html` → `<iframe sandbox="allow-scripts" src="/studio/raw/<artifact_id>">`. The raw endpoint streams the file with a Content-Security-Policy header restricting external network access.
  - `text/markdown` → `react-markdown` + `rehype-highlight`; existing `lib/shiki-diff.ts` reused for diff regions.
  - `image/svg+xml` → inline (sanitized via `DOMPurify`).
  - `application/json` → `react-json-view-lite` v2 (React 19 compatible; lighter than `react-json-view`).
  - `text/x-code` → **Shiki** server-rendered `<pre>` via `lib/shiki-diff.ts` patterns. No client bundle; line numbers via Shiki transformer; text selection only (no in-place find — use `[Open in Claude Code]` for long files).
- **Right pane (320px, collapsible) — provenance.** Reads from `pipeline_runs` joined with the originating jsonl session telemetry (existing `lib/jsonl.ts`). Renders: model + cost + duration, tool-call stream (with file paths linked into VS Code via `vscode://` URLs), and `claim_decisions` if this artifact is a dream report. Mirrors Manus's "Computer" pattern: *what the agent did to produce this artifact*.

**6.6.2 Toolbar (top of center pane)**

| Action | Behavior |
|---|---|
| **[Open in Claude Code]** | Deep-link: on laptop, opens VS Code via `vscode://file/<artifact_path>` and copies a pre-filled prompt to the clipboard with a Sonner toast. On pei (no local Code), copies a `claude --resume <run_id>` invocation to clipboard. |
| **[Copy as prompt]** | Handoff bundle, mirrors Claude Design's "send to Claude Code" loop. Template: `"In [artifact_path], <user description placeholder>. Context: emitted by <emitter> at <created_at> for run <run_id>."` |
| **[Copy raw]** | Raw file content to clipboard. |
| **[Pop out]** | Opens `/studio/raw/<artifact_id>` in a new tab (HTML only; non-HTML uses a `download` action). |
| **[Highlight to comment]** | Drag-select inside the iframe → child posts `{type: 'faro:highlight', text, selector}` via `postMessage` → parent drops the selection into a textbox → "Send to Claude Code" pre-fills a prompt scoped to the selection. **This is the only two-way primitive in v1.** OpenAI Canvas's pattern, adapted for the cockpit. |
| **[Promote to wiki]** | Moves the artifact from `drafts/artifacts/...` to `wiki/artifacts/<slug>/`, sets `artifacts.promoted_at`, git commit. Confirmation modal. |

**6.6.3 Phase-4 HTML emitters (the canonical list of where HTML lives)**

| Use case | Emitter | Today | Phase 4 output |
|---|---|---|---|
| Dream review | [`dreams/dream.py`](../dreams/dream.py) | `dream-report.md` + `claims.json` (Phase 1 sidecar) | + `dream-report.html` — rubric sliders, side-by-side current/proposed `memory.md` diff, promote/edit/reject kanban |
| Morning brief | [`heartbeat/morning_brief.py`](../heartbeat/morning_brief.py) (check existence) | MD via heartbeat | `brief.html` — triage kanban (Now/Later/Drop), pending-approvals list, heartbeat delta strip |
| Planning | `/plan-feature` skill | MD plan | `plan-approaches.html` — Thariq's N-approaches grid with tradeoff labels + "lock approach #N" copy-back |
| Presentations | existing `slidev` skill | Slidev MD | Register Slidev HTML deck as artifact type (no new emitter; just index it) |
| **Wiki-lint triage** *(NEW)* | `/wiki-lint` skill | MD report | Severity-grouped HTML with Fix/Defer/Ignore per finding + inline proposed-patch diff |
| **Ingest review** *(NEW)* | `/ingest` skill | MD digest | Source-digest left pane + proposed-pages right pane (frontmatter editable inline) + wikilink-graph edge diff (new green / contradicted red) + accept-per-page checkboxes |
| Weekly status | `/weekly-status` skill (NEW, optional) | none | `weekly-status.html` — banked patterns, 24h/72h winners (Shann's pattern), voice rules with example diffs |

The ingest review is the highest-leverage NEW use case: it's the single most-repeated approval moment in lwiki, currently a markdown wall.

**6.6.4 Security**

- Bundle.html iframes use `sandbox="allow-scripts"` (NOT `allow-scripts allow-same-origin` — combining the two flags lets the child remove its own sandbox per [MDN iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox)) — no top-navigation, no forms-to-origin, no popups.
- `/studio/raw/<artifact_id>` route enforces `path` is under the active profile's `agent_root` via the existing `_assert_under` TS port (see §8.2). 403 on traversal.
- Content-Security-Policy header on raw responses: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'` — bundle.html is fully self-contained per the `web-artifacts-builder` contract, so external connectivity is denied.
- `postMessage` handler validates `origin === window.location.origin` and `event.data.type === 'faro:highlight'`; drops everything else.
- Artifacts table writes go through the same `_git_commit_state_change` audit trail as claim decisions.

### 6.7 Run engine + live runs *(added 2026-05-15, v0.4 — the control-station centerpiece)*

A studio panel (Dockview tab from P2) that launches a Claude Code run via the Agent SDK and streams the §5.7 run-adapter envelope live: token stream, tool cards, inline `approval` / `clarify` gates, cost/usage on `done`. Reconnect-safe via the turn-journal — closing the browser or restarting faro does not lose a run. This is the reason the control station exists: faro *drives* agents, it does not merely view their output. Extends, does not replace, the Phase 4.5 studio Chat tab.

### 6.8 Skills tab — LIVE *(added 2026-05-15, v0.4)*

The Phase 2 Skills panel graduates from inventory-only to **live**: imported `html-anything` `SKILL.md` design briefs register and render in the Skills tab (no stub), are selectable as the brief for the artifact-generation path (§6.9), and display source + attribution. Acceptance bar: an imported skill appears in the tab and is selectable end-to-end. This is a hard v0.4 deliverable, not "wire later."

### 6.9 Artifact generation path *(added 2026-05-15, v0.4)*

A new generation surface, distinct from the deterministic Jinja emitters (§6.6.3): the user picks a `SKILL.md` brief → faro assembles `[shared anti-AI-slop directives] + [skill body] + [content]` → Agent SDK run → HTML rescued from the Write tool with `extract-html` fallback → streamed into a sandboxed iframe. Sandbox stays `allow-scripts` only — html-anything ships `allow-scripts allow-same-origin` (which defeats the sandbox); faro's Phase 4 contract (§6.6.4) is non-negotiable and must NOT regress. Generation routes are Tailnet-only and never exposed beyond loopback.

---

## 7. Tech stack

| Layer | Choice | Version (May 2026) | Rationale |
|---|---|---|---|
| Runtime (production) | **Node** | 22+ | `bun:sqlite` ships SQLite 3.51.2 (WAL bug window); better-sqlite3 lacks Bun ABI support. Node is the safe runtime. |
| Package manager / dev | **Bun** | 1.3.13+ | Fast installs, fast `bun dev`, `bun run` script-runner. Pinned via `packageManager` field. Avoid 1.3.6 (Next 16.1.2 dep-resolution bug) and 1.3.7 (Cache Components broken). |
| Framework | **Next.js** | 16 | App Router, RSC, Server Actions, standalone build for systemd deploy. |
| UI lib | **React** | 19 | Required by Next.js 16 + shadcn. |
| Styling | **Tailwind v4** | 4.x | shadcn Luma is built on Tailwind v4 + `@theme`. |
| Components | **shadcn/ui Luma preset** | shipped Mar 2026 | True Luma fidelity. Install via `npx shadcn@latest add` after `shadcn/create` Luma scaffold. |
| Primitives | Radix UI | latest | Underlies shadcn Luma. |
| Theme tooling | [tweakcn.com](https://tweakcn.com) | live | Tune Luma palette if needed. |
| Lint/format | **Biome** | latest | Matches midday-ai/v1 stack — single tool replaces ESLint + Prettier. |
| Animations | framer-motion | latest | `layoutId` for card transitions. |
| Carousel | embla-carousel-react | latest | shadcn's official carousel underpinning. |
| Command palette | cmdk | latest | shadcn's official cmdk integration. |
| Charts/sparklines | **Tremor** | latest | Tailwind-native, copy-paste shadcn-style. |
| Toasts | Sonner | latest | shadcn's official toast. |
| Knowledge graph (Phase 3) | react-sigma + graphology | latest | WebGL, 10K+ nodes. |
| Database | **better-sqlite3** | 12.x | Native Node binding, WAL-mode safe with Python sqlite3. Pinned same version as canon-bot. |
| State.db | shared with slack_agent at `slack_agent/runs/state.db` | — | Existing WAL contract preserved. |
| Usage parser | shell out to [`ccusage`](https://github.com/ryoppippi/ccusage) via Bun subprocess | latest | Don't reimplement. Fallback: parse jsonl directly via `lib/jsonl.ts`. |
| Pricing source | LiteLLM [`model_prices_and_context_window.json`](https://github.com/BerriAI/litellm) | refresh weekly | Canonical pricing table. |
| OpenRouter | HTTP API (`/credits`, `/generation`) | — | Direct fetch. |
| Auth | Tailscale-User-Login header gate via Next.js middleware | — | Existing pattern preserved. |
| Edge | **Caddy** on pei (NEW) | 2.x | Reverse-proxies Bun port 3000 → Tailscale Serve. Header preservation. Positions us for Phase 4 multi-host + future Ionos domain. |
| Trace backbone | Local jsonl parser + sqlite rollup | — | **Local-first per user direction.** Langfuse deferred to Phase 4 only if canon multi-user demand emerges. |
| Skill: rich artifacts | [`web-artifacts-builder`](https://github.com/anthropics/skills/tree/main/skills/web-artifacts-builder) | latest | Phase 5. |
| Skill: aesthetic | [`frontend-design`](https://github.com/anthropics/skills/tree/main/skills/frontend-design) | already loaded | Aesthetic guardrails. |
| Skill: design system | NEW `faro-design-guidelines` (clone of `brand-guidelines`) | TBD | Phase 0 — locks palette/fonts before any UI ships. |
| Mirror destination | `github.com/lucaramirezo/faro` | — | Subtree-pushed from GitLab on every main push. |
| CI/CD | **GitLab CI** for build + mirror (primary), **GitHub Actions** for OSS readers only | — | Primary CI stays on self-hosted GitLab. |
| Production deploy | systemd unit on pei, `node .next/standalone/server.js` on `:8766`, fronted by `tailscale serve --https=8443` | — | One process. Tailscale Serve injects `Tailscale-User-Login` directly to Node. |

**Phase 4 additions (Artifact Studio + Polish Pass, added 2026-05-13):**

| Layer | Choice | Version | Rationale |
|---|---|---|---|
| Sidebar block | **shadcn `sidebar-07`** | latest | Ships `team-switcher.tsx` for the agent dropdown; collapsible-to-icons. [Block ref](https://ui.shadcn.com/blocks/sidebar). |
| Theme | **`next-themes`** | latest | Standard shadcn pattern; cookie-persisted. |
| HTML iframe sandbox | native `<iframe sandbox>` + `postMessage` | — | No new lib; CSP already in place. Sandbox flags: `allow-scripts` only. |
| Markdown renderer | **`react-markdown`** + `rehype-highlight` | latest | Existing Shiki via `lib/shiki-diff.ts` reused for diff regions. |
| JSON viewer | **`react-json-view-lite`** | v2 | React 19 peer compatible; lighter than `react-json-view`; `react-json-tree` maintenance is dormant. RSC-safe. |
| Code viewer (read-only) | **Shiki** (server-rendered `<pre>`) | via `lib/shiki-diff.ts` | RSC-rendered at build time; no client bundle (~3MB saved vs Monaco); eliminates `worker-src` CSP carve-out; inherits existing diff pipeline. Trade-off: no in-place find-in-file — long files go through `[Open in Claude Code]` handoff per decision #14. |
| SVG sanitizer | **`DOMPurify`** | latest | Required before inline SVG render. |
| Mesh gradient | CSS-only radial-gradient stack | — | No Three.js, no canvas; RSC-safe; static (no animation). |
| Charts (full-bleed) | Existing **Tremor 3.18.7** via `<SparkAreaChart>` | — | Tremor chart absolutely positioned filling card + left-to-right scrim (`bg-gradient-to-r from-card via-card/70 to-transparent`) + relative KPI overlay. Shipped pattern in shadcn `stats-sparkline`. (Recharts was incorrectly listed in PRD v0.1; corrected 2026-05-13.) |
| Provider icons | hugeicons (already loaded) + per-brand SVG registry under `components/ui/provider-icons/` | — | Avoid CDN; brand assets committed locally. |
| Artifact bundler skill | Anthropic [`web-artifacts-builder`](https://github.com/anthropics/skills/tree/main/skills/web-artifacts-builder) | latest | Installed at project scope in Phase 4. React 18 + Vite + Parcel + `html-inline` → single `bundle.html`. |

**Explicit non-choices:**

- ❌ **Hybrid D (FastAPI + Basecoat + islands)** — reopened and rejected 2026-05-12. Basecoat is Luma-flavored, not true Luma. User directive: "perfect fit".
- ❌ FastAPI/Jinja anywhere in faro — `lwiki_ui/` retires at end of Phase 1.
- ❌ Astro 5 — viable but smaller community for dashboard pattern; Next.js wins on midday-ai/v1 cribbing.
- ❌ Phoenix LiveView / DatastarUI / Hermes-webui fork — language rewrites or wrong runtime.
- ❌ McCavity/claude-code-dashboard fork — license unclear; reference architecture only.
- ❌ **Three.js / OGL aurora** for hero cards *(2026-05-13)* — 50–100kB JS, requires `"use client"`, breaks RSC streaming. CSS radial-gradient stack achieves the same look with zero JS.
- ❌ **Monaco entirely** *(2026-05-13, iteration #3)* — first reduced to read-only (would have made faro a second writer to artifacts Claude Code owns on disk; sync conflicts), then dropped in favor of Shiki RSC: zero client bundle, no `worker-src` CSP carve-out, no second-writer surface. Editing/navigation goes through `[Open in Claude Code]` handoff.
- ❌ **File tree in the studio** *(2026-05-13)* — faro is a cockpit, not an IDE; the user has Claude Code one keystroke away. Reverse-chronological grouped-by-run list is the cockpit primitive (Manus/Replit Agent 4 pattern).
- ❌ **In-browser real-time collaboration** *(2026-05-13)* — single-user system; no Yjs/Liveblocks/CRDTs.

**v0.4 Control Station additions (added 2026-05-15):**

| Layer | Choice | Rationale |
|---|---|---|
| Agent integration | `@anthropic-ai/claude-agent-sdk` ONLY | Runs on Luca's Max sub/OAuth; never CLI subprocess. `ANTHROPIC_API_KEY` unset; headless via `claude setup-token`. Extends decision 23. |
| Run event contract | hermes-webui run-adapter envelope (design lifted, MIT) | Runtime-agnostic; reconnect/replay built in. |
| Crash-safe runs | hermes-webui turn-journal (design lifted, MIT) | WAL-style replay after a faro restart. |
| Workspace shell | Dockview (carried from the superseded 4.6 plan) | popout / split / serialize for free. |
| Server DOM / zip | linkedom, fflate (carried from 4.6) | sniper patches + bundle export. |
| Generation harness | html-anything `extract-html` + SSE convert pattern (lifted, Apache-2.0) | Claude-writes-HTML rescued from the Write tool. |
| Sniper edit | open-design edit-mode / source-patches / stub-guard (lifted, Apache-2.0) | manual element nudging (old 4.6 Workstream B). |

**Explicit non-choices (v0.4, added 2026-05-15):**

- ❌ **Claude CLI subprocess + stream-json parsing** — html-anything's spawn/argv layer. Rejected: the Agent SDK already runs on the subscription; a subprocess parser is a regression.
- ❌ **Org-chart / department / orchestrator abstractions** — Hermes is a mental model; even mature hermes-webui punted "teams of agents" to backlog. Not until earned.
- ❌ **Multi-tenant / tenancy build-out** — North Star only; `profile_id` seam exists, tenancy does not ship in v0.4.
- ❌ **Replacing Jinja approval pages with LLM generation** — the determinism/cost boundary (§5.7).
- ❌ **Per-skill license audit of lifted html-anything skills** — accepted as-is 2026-05-15; revisit only if faro is ever published beyond the Tailnet.

---

## 8. Security & configuration

### 8.1 Auth

- **Next.js middleware** (`middleware.ts`) reads `Tailscale-User-Login` header (auto-injected by Tailscale Serve; spoofed copies stripped). Owner allowlist in `faro/profiles/lwiki.yml`.
- **Caddy** preserves the header from Tailscale Serve → Bun. Caddy config explicitly: `header_up Tailscale-User-Login {http.request.header.Tailscale-User-Login}`.
- **v0.2+:** per-profile owner list — `lwiki` stays single-user, `refactor-canon` gets Duo + Marc. If public exposure demanded: Keycloak OIDC route added in Caddy as alternative auth path.
- **Never:** API keys, credentials, or tokens in HTML/JSON responses. Auth mode badge is "OAuth/Max" or "API key" — no secret values exposed.

### 8.2 CSRF / path traversal

- Next.js middleware injects CSRF token for non-GET requests; Server Actions get framework CSRF protection by default.
- Path operations use a TS port of `_assert_under` from [`slack_agent/pipeline_approvals.py`](../slack_agent/pipeline_approvals.py:291).
- All state-changing routes require the existing per-run `decision_token` (preserved from `lwiki_ui/routes/review.py`).

### 8.3 Outbound action guardrails

- **No autonomous outbound actions.** Faro is a *capture* surface for approvals; the actual outbound action runs in the agent backend (Slack agent, dreams pipeline, reflection pipeline).
- All state-changing routes go through a TS port of `_git_commit_state_change` so the audit trail is preserved.

### 8.4 Configuration

`.env.local` (gitignored):

```bash
FARO_PROFILE_DEFAULT=lwiki
FARO_BASE_URL=https://pei.tail<id>.ts.net
FARO_OWNER_LOGIN=lucaramirezol@gmail.com
FARO_OPENROUTER_API_KEY=<set in heartbeat/.env, mirrored>
FARO_PRICING_REFRESH_HOURS=168
FARO_CCUSAGE_PATH=ccusage
FARO_STATE_DB=/home/luca/projects/lwiki/slack_agent/runs/state.db  # laptop layout; on pei use /home/luca/lwiki/slack_agent/runs/state.db
```

`faro/profiles/*.yml` files declare each agent profile.

### 8.5 GitHub mirror authentication

GitLab CI job pushes `faro/` subtree to GitHub. Credentials options:

- **Deploy key on pei** (recommended) — generate `ssh-keygen -t ed25519 -f ~/.ssh/github_faro -C "faro-mirror@pei"`. Add public key to GitHub repo Deploy Keys. GitLab CI runner on pei uses this key.
- **PAT in GitLab CI variable** — alternative if pei isn't running CI runners.

Phase 0 includes the creds-discovery step (see §11.0).

---

## 9. API specification (selected)

### 9.1 Next.js routes (Phase 0 + 1)

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | redirects to `/home` |
| GET | `/home` | Home dashboard (RSC) |
| GET | `/cost` | Subscription + Plan limits |
| GET | `/dreams` | Pending dream queue |
| GET | `/dreams/[runId]` | Sharded review page |
| GET | `/api/home` | KPI sparkline JSON (cmdk + client refresh) |
| GET | `/api/cost/blocks` | Proxy `ccusage blocks --json` |
| GET | `/api/dreams/[runId]/claims` | List claims for a run |
| PATCH | `/api/dreams/[runId]/claims/[claimId]` | Update one claim |
| POST | `/api/dreams/[runId]/finalize` | Promote staging → memory.md |
| GET | `/api/profile` | Active profile metadata |
| POST | `/api/profile/switch` | Set session profile cookie (v0.1 no-op) |
| GET | `/api/health` | Liveness |

### 9.2 SSE (Phase 2+)

| Method | Path | Purpose |
|---|---|---|
| GET | `/sse/profile/[id]` | Server-sent events for active agent telemetry (token, tool, approval, done, error). Vocabulary cribbed from hermes-webui. |

### 9.3 Server Actions (Phase 1)

Used for per-claim mutations (faster than route handlers for form-driven actions):

- `approveClaimAction(runId, claimId)` — sets status=approved, writes audit JSON.
- `denyClaimAction(runId, claimId)` — sets status=denied.
- `tweakClaimAction(runId, claimId, tweakText)` — sets status=tweaked, captures text.
- `deferClaimAction(runId, claimId)` — sets status=deferred.
- `bulkApproveSection(runId, category)` — bulk-stamp.
- `finalizeDreamAction(runId)` — full apply.

---

## 10. Success criteria

### 10.1 MVP success (end of Phase 1)

- ✅ Faro home loads at `pei.tail<id>.ts.net/home` in <1s with three KPI cards populated.
- ✅ Cost page shows live OpenRouter credits + Claude Max 5h block %.
- ✅ Today's dream is reviewable claim-by-claim end-to-end through faro.
- ✅ The 2026-05-12 Phase-5 anomaly dispatches: "Remove stale Phase 5 DEFERRED line" card under PRUNED, approved, `memory/memory.md:10` is gone.
- ✅ Existing Slack dream-approval flow still works unchanged.
- ✅ Tailscale-User-Login auth gates 100% of routes; favicon-only exemption preserved.
- ✅ `lwiki_ui/` systemd unit stopped on pei; Tailscale Serve points at `:8443 → 127.0.0.1:8766` (Node faro).
- ✅ GitHub `lucaramirezo/faro` repo has the `faro/` subtree, last commit matching GitLab origin.

### 10.2 Quality bars

- All pages: WCAG 2.2 AA contrast.
- All pages: keyboard-navigable, focus-visible, no mouse-required flows.
- All API endpoints: typed responses (Zod schemas), structured error envelope.
- All state changes: append-only audit JSON to `raw/decisions/<date>/<run_id>/<claim_id>.json`.
- Test coverage: every new route has a happy-path test (Vitest unit + Playwright e2e on Tailnet).

---

## 11. Implementation phases

> Day estimates assume one focused half-day of build per "build-day" (matches Luca's cadence).

### Phase 0 — Scaffold + GitHub mirror (~2d) — **SHIPPED 2026-05-12**

**Goal:** stand up the Next.js monorepo at `faro/`, lock the design system, set up GitHub mirror. Zero application features.

> **Deviations captured during execute (2026-05-12)** — see [`AGENTS.md`](./AGENTS.md) §"Faro Phase 0 deviations" and §14 decision 6 for canonical refs. **Phase 1 planning must use the deviation list, not the original deliverable bullets below.**
>
> 1. **Runtime: Node 22+** in production (Bun → Node pivot due to `better-sqlite3` ABI gap + `bun:sqlite` SQLite 3.51 WAL bug).
> 2. **Port: 8766** in systemd (NOT 3000).
> 3. **Tailscale Serve: port `:8443`** on existing `pei.taild21074.ts.net` (NOT sub-path `/faro`, NOT separate hostname).
> 4. **Pei filesystem: `/home/luca/lwiki/`** (laptop is `/home/luca/projects/lwiki/`). Override via `FARO_AGENT_ROOT`.
> 5. **SQLite 3.53.1 built from source on pei** (jammy apt ships 3.51).
> 6. **Caddy: apt binary installed + systemd unit masked** (pei runs Duo's Docker Caddy on `:80`). `Caddyfile.faro` committed and validated (loopback `:8767 → :8766`), but NOT in either Caddy instance's active config in v0.1. v0.2 imports into Docker Caddy + flips Tailscale Serve to `:8443 → :8767`. See [`infra/pei/caddy/README.md`](../infra/pei/caddy/README.md).
> 7. **GitHub mirror from pei shell needs `GIT_SSH_COMMAND="ssh -p 22 ..."`** (pei's `/etc/ssh/ssh_config` forces port 2269 for GitLab). CI runner is clean — automated job works without override.
> 8. **Biome lint scopes out `components/ui/**`** (shadcn-shipped a11y warnings).
> 9. **`middleware` → `proxy` deprecation in Next.js 16.2.6** — cosmetic warning, tracked for Phase 1 rename pass.

**Deliverables:**

- [ ] `bun create next-app faro` at lwiki repo root.
- [ ] Initialize Tailwind v4, configure `@theme` with Luma palette.
- [ ] Install shadcn/ui Luma preset via `shadcn/create` workflow (see [Introducing Luma](https://ui.shadcn.com/docs/changelog/2026-03-luma)). Pre-add the components we'll need: `card`, `button`, `badge`, `separator`, `sonner`, `dialog`, `dropdown-menu`, `command` (cmdk), `progress`, `tabs`, `tooltip`, `kbd`.
- [ ] Install Tremor, framer-motion, embla-carousel-react, better-sqlite3, zod, sonner.
- [ ] Configure Biome (lint + format) — single tool, matches midday-ai/v1.
- [ ] **Move `faro-prd.md` from repo root into `faro/`.**
- [ ] **Author `faro/profiles/lwiki.yml`** with all paths.
- [ ] **Author `faro/README.md`** — public-facing readme for the GitHub mirror. Brief description, screenshots TBD, link to PRD, install instructions.
- [ ] **Author `faro/.gitignore`** — exclude `.next/`, `node_modules/`, `*.local`, etc.
- [ ] `middleware.ts` — Tailscale-User-Login validation + owner allowlist check.
- [ ] `lib/db.ts` — better-sqlite3 connection in WAL mode, exports typed reader/writer.
- [ ] `lib/profiles.ts` — profile resolver.
- [ ] **Migration**: `scripts/migrate.ts` — adds `claim_decisions` table + `profile_id` columns to `pipeline_runs` (additive; default 'lwiki').
- [ ] **GitHub mirror setup**:
  - [ ] Inventory pei creds (Task #5 — already running). If absent: generate ed25519 deploy key on pei, add public key to `github.com/lucaramirezo/faro` Deploy Keys (write access).
  - [ ] Create `github.com/lucaramirezo/faro` (public OR private — Luca's call at creation).
  - [ ] `.gitlab-ci.yml` job `mirror-faro-subtree` — runs on push to main, executes `git subtree split --prefix=faro -b _faro_only` then `git push github _faro_only:main`.
  - [ ] First manual push to validate.
- [ ] **NEW design-guidelines skill scaffolding**: `faro/.claude/skills/faro-design-guidelines/SKILL.md` — clone of Anthropic's `brand-guidelines` skill, palette = Luma + TRL accents, fonts = Geist (matches KULT Pro), enforces tokens before any UI component ships. NOTE: a full DESIGN.md draft for Phase 5 artifact pipeline is a separate phase gate.
- [x] **Caddy on pei** — apt binary installed (`/usr/bin/caddy`) + systemd unit **masked** (Docker Caddy from Duo's 2026-03 setup holds `:80`; no competing daemon). `Caddyfile.faro` committed + validated (loopback `:8767 → :8766`); **NOT in either Caddy instance's active config in v0.1** — Tailscale Serve still hits Node directly. v0.2 imports the snippet into Docker Caddy + flips Tailscale Serve to `:8443 → :8767`. See `infra/pei/caddy/README.md`.
- [ ] **systemd unit** `faro.service` at `/etc/systemd/system/faro.service` — runs `node .next/standalone/server.js` on port `8766` (after `bun next build`).
- [ ] **Decommission plan** for `lwiki_ui/`: documented but not executed (executed at end of Phase 1).

**Validation:**

- `bun dev` runs locally, loads `/home` (empty shell with nav + profile slug).
- pei `faro.service` starts, listens on 3000.
- Tailscale Serve → Caddy → Bun chain returns 200 on `/api/health`.
- 403 returned when `Tailscale-User-Login` header is absent.
- `git push origin main` triggers GitLab CI mirror job, GitHub `lucaramirezo/faro` updates.

### Phase 1 — MVP (~5d) — **SHIPPED 2026-05-12 (commit `cd91343`)**

**Goal:** Home + Subscription + Plan limits + Sharded Dreams. Cut over from `lwiki_ui/` to faro.

**Deliverables:**

- [ ] `lib/ccusage.ts` — wraps `ccusage blocks --json` + `daily --json`; falls back to direct jsonl parse if ccusage missing.
- [ ] `lib/pricing.ts` — fetches LiteLLM JSON, caches at `faro/data/pricing-cache.json` weekly.
- [ ] `lib/jsonl.ts` — direct fallback parser for `~/.claude/projects/<slug>/*.jsonl`.
- [ ] `lib/auth-mode.ts` — detects OAuth vs API key.
- [ ] `app/(dashboard)/page.tsx` + `components/home/*` — three KPI cards + sparklines via Tremor.
- [ ] `app/(dashboard)/cost/page.tsx` + `components/cost/*` — Subscription cards + Plan limits + auth-mode pill.
- [ ] `app/(dashboard)/dreams/page.tsx` — pending queue.
- [ ] `app/(dashboard)/dreams/[runId]/page.tsx` — sharded review (RSC server-side, client island for keyboard + Live-Preview).
- [ ] `components/dreams/ClaimCard.tsx`, `BulkApproveBar.tsx`, `LivePreview.tsx`, `KeyboardShortcuts.tsx`.
- [ ] Server Actions for all per-claim mutations.
- [ ] `components/nav/CommandPalette.tsx` — tiny cmdk with "go to dream", "copy as prompt", "open profile".
- [ ] Update [`dreams/dream.py`](../dreams/dream.py) to emit `claims.json` sidecar.
- [ ] Bulk Slack approve still works — add small Python helper to `pipeline_approvals.py` that bulk-stamps `claim_decisions` rows when Slack Approve fires.
- [ ] Finalize endpoint — TS port of `apply_dream` (cp + mv + git commit).
- [ ] **Cut over**: stop `lwiki_ui.service` on pei, point Tailscale Serve at faro, archive `lwiki_ui/` package to `_archive/lwiki_ui-2026-05-12/` (preserve git history via rename; full delete in Phase 2 after a week of stability).

**Validation:** end of day 5, Luca opens faro, sees subsidy KPI, reviews today's dream claim-by-claim, finalizes; stale Phase-5 line is gone. Slack flow regression test passes. `lwiki_ui` is gone from systemd.

### Phase 2 — Skills + Memory + Integrations + Scheduled tasks (~4d) — **SHIPPED 2026-05-13 (commit `080dd3c`)**

**Goal:** the four inventory panels. Delete archived `lwiki_ui/` after stability window.

> Tested 2026-05-13; small tweaks ongoing (integrations status probe + weekly plan-limit bar fixed in `d39bad3`). No PRD changes required.

**Deliverables:**

- [ ] `lib/skill-parser.ts` — port from [developer-hasm/claude-code-dashboard](https://github.com/developer-hasm/claude-code-dashboard) (MIT). Scans `~/.claude/skills/`, `.claude/skills/`, parses `SKILL.md` frontmatter, derives last-used + run-count from jsonl tool-call records.
- [ ] `app/(dashboard)/skills/page.tsx` — skill cards with $-saved/run/last-used.
- [ ] `app/(dashboard)/memory/page.tsx` — flat tree view of `memory/`, backlink counts, frontmatter parsed.
- [ ] `app/(dashboard)/integrations/page.tsx` — reads `memory/heartbeat.md` + systemd-unit status.
- [ ] `app/(dashboard)/scheduled/page.tsx` — parses `~/.claude/scheduled_tasks.lock` + heartbeat/reflection/dreams crons.
- [ ] Delete `_archive/lwiki_ui-*/`.

**Validation:** all four panels populate from real lwiki state.

### Phase 3 — Activity + Recommender + Knowledge graph (~3d)

**Goal:** the analytical panels + the recommender loop.

**Deliverables:**

- [ ] `app/(dashboard)/activity/page.tsx` — per-day session count + focused-hours via Tremor BarList.
- [ ] `app/(dashboard)/recommender/page.tsx` — surfaces approved "Surfaced" claims from past dreams flagged as "promote to skill" or "promote to wiki"; renders cards with `/install-skill <slug>` copy buttons.
- [ ] `components/graph/KnowledgeGraph.tsx` — Sigma + graphology rendering of memory backlinks. ForceAtlas2 layout. Click to open in Obsidian. No edit mode.

**Validation:** Activity shows last 7 days clearly; Recommender shows ≥1 candidate; graph renders 100+ nodes at 60fps.

**Phase gate:** before /execute on Phase 3 Recommender flow, draft `faro/.claude/skills/recommender/DESIGN.md` capturing:

- Skill-hub source (Anthropic skills marketplace, OpenClaw's clawhub, both)
- Skill-card data shape (name, description, confidence, install command, tags, source)
- Install command UX (copy-to-prompt vs faro-issued shell command)
- Safety: skills install in user scope; never overwrite project skills

(per Luca's note 2026-05-12: research clawhub + DESIGN.md gate before execute)

### Phase 4 — Artifact Studio + Polish Pass (~5–6d) *(NEW 2026-05-13; was Phase 5)*

**Goal:** ship the persistent HTML control surface promised in §0 — turn faro from "feature-complete" to "feels finished." Two parallel tracks: A) the centerpiece artifact studio, B) navigation + visual polish pass. Single coherent release.

#### Track A — Artifact Studio (~3d)

Centerpiece. See §6.6 for the full spec.

**Deliverables:**

- [ ] **Migration**: `scripts/migrate.ts` adds the `artifacts` table (§5.6) with `(artifact_id, run_id, profile_id, source, mime, path, label, emitter, bytes, content_hash, created_at, promoted_at)` + indexes.
- [ ] `lib/artifacts.ts` — disk scanner + index sync; emitter classifier; mime sniffer.
- [ ] `app/(dashboard)/studio/page.tsx` — three-pane RSC layout (gallery / renderer / provenance). Client island for `postMessage` highlight handler.
- [ ] `app/(dashboard)/studio/raw/[artifactId]/route.ts` — streams artifact content; enforces `_assert_under(agent_root)`; CSP header on HTML responses.
- [ ] `components/studio/Gallery.tsx` — grouped-by-run reverse-chronological list with phase badges.
- [ ] `components/studio/Renderer.tsx` — mime dispatcher → `HtmlRenderer` (iframe sandbox), `MarkdownRenderer` (react-markdown + rehype-highlight; `<!--faro:diff-->` pragma routes through `lib/shiki-diff.ts`), `JsonRenderer` (react-json-view-lite v2), `SvgRenderer` (DOMPurify), `CodeRenderer` (Shiki server-rendered `<pre>`).
- [ ] `components/studio/Provenance.tsx` — reads `pipeline_runs` + jsonl session, renders model + cost + duration + tool-call stream + linked `claim_decisions` if applicable.
- [ ] `components/studio/Toolbar.tsx` — 6 actions: Open in Claude Code, Copy as prompt, Copy raw, Pop out, Highlight to comment, Promote to wiki.
- [ ] `components/studio/HighlightBridge.tsx` — `postMessage` listener (origin + type validated); pre-fills prompt textbox with selected text + DOM selector.
- [ ] **Install Anthropic skill** [`web-artifacts-builder`](https://github.com/anthropics/skills/tree/main/skills/web-artifacts-builder) at project scope — React 18 + Vite + Parcel + `html-inline` → single `bundle.html`. Lock to a specific commit in the skill repo.
- [ ] **HTML emitters** (per §6.6.3 table):
  - [ ] `dreams/dream.py` — emit `dream-report.html` alongside existing `dream-report.md` + `claims.json`.
  - [ ] `heartbeat/morning_brief.py` — emit `brief.html` (audit if file exists; create if not).
  - [ ] `/plan-feature` skill — emit `plan-approaches.html` (Thariq's N-approaches grid).
  - [ ] `/wiki-lint` skill — emit `triage.html` (severity-grouped + Fix/Defer/Ignore + proposed-patch diffs).
  - [ ] `/ingest` skill — emit `ingest-review.html` (source-digest left, proposed-pages right, wikilink-graph edge diff). **Highest leverage NEW emitter.**
  - [ ] Register existing Slidev exports as artifact type (no new emitter).
- [ ] **Phase gate (kept from former Phase 5):** before /execute on the studio, draft `faro/.claude/skills/artifacts/DESIGN.md` capturing:
  - Bundle-builder pinning policy (skill commit + Parcel + html-inline versions)
  - Shared `faro/design-tokens.yml` consumed by both Tailwind config and `web-artifacts-builder`
  - Iframe CSP exact directives + `postMessage` schema
  - Artifact-id stability (sha256 of content vs run_id+path — see §15.3)
  - Prune policy for `drafts/artifacts/` (see §15.3)

**Validation Track A:** Open `/studio`. Today's dream emits both `dream-report.md` and `dream-report.html`; the HTML renders inside a sandboxed iframe with rubric sliders. Click [Highlight to comment], drag-select, hit "Send to Claude Code" — clipboard contains the pre-filled prompt. Click [Promote to wiki] on the brief.html — file moves to `wiki/artifacts/<slug>/`, git commit lands.

#### Track B — Polish Pass (~2–3d)

Bundled with Track A; ships as one "faro feels finished" release.

- [ ] **B1. Nav rebuild** — replace `components/nav/TopBar.tsx` with `components/nav/Sidebar.tsx` (shadcn [`sidebar-07`](https://ui.shadcn.com/blocks/sidebar)) and new `components/nav/TopLocator.tsx`. See §6.5 for the full spec.
  - [ ] `Sidebar.tsx` — `SidebarHeader` = `team-switcher.tsx` (agent dropdown); three groups (Today / Build / Ops); `SidebarFooter` = avatar + theme toggle.
  - [ ] `TopLocator.tsx` — 48px sticky bar with `[SidebarTrigger] [LocatorPill] · [source-helper] · · · [Search ⌘K] [Bell] [ThemeToggle]`.
  - [ ] `components/nav/LocatorPill.tsx` — Vercel-style scope pill; shares state with team-switcher.
  - [ ] `components/nav/NotificationBell.tsx` — popover; reads `memory/heartbeat.md` + pending `pipeline_runs`.
  - [ ] `components/nav/ThemeToggle.tsx` — `next-themes`.
  - [ ] Update `app/(dashboard)/layout.tsx` to the sidebar + top-locator grid.
- [ ] **B2. Provider chip system.**
  - [ ] Add brand `oklch` CSS vars to `app/globals.css` `@theme` for: anthropic (`#D97757`), gemini (`#078EFA` + `#AD89EB`), supabase (`#3ECF8E`), openai (`#10A37F`), openrouter (`#6E40C9` — unverified), linear (`#5E6AD2`), slack (`#4A154B`), github (`#24292F`), vercel (`oklch(0.20 0 0)`).
  - [ ] `components/ui/provider-chip.tsx` — `<ProviderChip provider="anthropic" />`; tint pattern `bg-[color-mix(in_oklab,var(--brand-anthropic)_12%,transparent)] text-[var(--brand-anthropic)] ring-[color-mix(in_oklab,var(--brand-anthropic)_25%,transparent)]`. Auto-resolves icon from `components/ui/provider-icons/<slug>.svg` registry.
  - [ ] Wire into auth-mode pill (cost page), KPI cards (when a provider is the source), studio gallery (artifact emitter chip).
- [ ] **B3. Home KPI full-bleed chart cards.**
  - [ ] Refactor `components/home/KpiCard.tsx`: drop `w-24 h-12` sparkline → `<Card className="relative overflow-hidden h-32">` with full-bleed **Tremor `<SparkAreaChart>`** + left-to-right scrim `bg-gradient-to-r from-card via-card/70 to-transparent` + `tabular-nums` KPI overlay.
  - [ ] Apply to all three home KPIs (today $, this week $, subsidy this week).
- [ ] **B4. Mesh-gradient hero card** — apply ONLY to the subsidy KPI card (the §10 wedge). Pure CSS radial-gradient stack as `::before`, `mix-blend-mode: plus-lighter`, `opacity: 0.55`, no animation. Reject Three.js (see §7 non-choices).
- [ ] **B5. Tabular-nums sweep** — `font-variant-numeric: tabular-nums` on every numeric span across home, cost, dreams pages.
- [x] **B6. Embla dreams carousel arrow fix** — `min-h-[360px]` → `h-[360px] shrink-0`, button disabled state wired to `canScrollPrev/canScrollNext` + `reInit` listener. **Hot-fixed 2026-05-13 in `components/dreams/EmblaCarousel.tsx` (not yet committed).**

**Validation Track B:** Open faro on laptop. Sidebar collapses to icons (56px). Top bar shows `luca / lwiki · local Claude daemon`. ⌘K finds artifacts + skills + dream runs. Bell popover lists pending items from heartbeat. Theme toggle persists across reloads. Subsidy KPI card has a subtle aurora-feel mesh background, full-bleed area chart, tabular numbers. Provider chips on the cost page render Anthropic in tinted orange, OpenRouter in tinted purple.

**Phase gate:** before `/execute`, the §6.6 spec and §5.6 schema must pass review on (a) iframe sandbox flags + CSP, (b) artifact-id stability strategy (§15.3 open), (c) `web-artifacts-builder` skill version pin.

### Phase 5 — Multi-agent + (optional) Langfuse (~3d) *(was Phase 4; swapped 2026-05-13)*

**Goal:** profile switcher activated for canon + (if demanded) shared trace backbone.

**Deliverables:**

- [ ] Profile switcher in nav — real, lists discovered `faro/profiles/*.yml`. Uses the same `team-switcher.tsx` already shipped in Phase 4 Track B1; v0.1 inert dropdown becomes live.
- [ ] `refactor-canon` profile YAML (placement: `faro/profiles/refactor-canon.yml` OR canon repo — decide; see §15.3 open).
- [ ] Profile-scoped queries — every panel reads `profile_id`-filtered data. Migrations are additive; v0.1 already baked `profile_id` columns.
- [ ] Studio scoping — gallery filter respects active profile; cross-profile view is a future enhancement.
- [ ] (If multi-user demanded) Caddy + Keycloak OIDC route; per-profile ACL on `Tailscale-User-Login` allowlist.
- [ ] (If trace demanded) Langfuse v3 self-host on pei via Docker Compose; Claude Code OTEL exporter pointed at it; `app/(dashboard)/sessions/page.tsx` embeds Langfuse iframe inline.

**Validation:** switch profile in the team-switcher, every panel rescopes including the studio gallery; canon-bot writes traces faro can browse.

### Phase 4.6+ — Control Station (v0.4) *(added 2026-05-15 — supersedes the content of [`.agents/plans/faro-phase-4.6-agent-os.md`](../.agents/plans/faro-phase-4.6-agent-os.md))*

**Goal:** turn faro from a viewer/approver into the Control Station — faro launches, observes, gates, and hands off Claude Code runs. Built on top of Phase 4.5 (kept). **Increment ambition, not a rewrite.** The locked 4.6 A/B/D workstreams re-sequence here; the old `Phase 5 — Multi-agent + Langfuse` still follows, unchanged, gated on canon multi-user demand.

- [x] **P0 — This PRD.** Control Station repositioning captured: boundary contract, lift posture, determinism boundary, run-engine spine, roadmap below. No code. *(complete on write, 2026-05-15)*
- [ ] **P1 — Run-engine spine.** Extend `lib/agent-sdk.ts:streamChat`; adopt the hermes-webui run-adapter event contract + turn-journal; add `runs`/`run_events` tables; live Skills tab (§6.8); artifact-generation path (§6.9).
  - **Phase gate:** a research-exploration prime + an explicit acceptance round (clarifying-question gate) BEFORE `/plan-feature` (mirrors the working pattern of the 2026-05-15 priming session). The P1 DESIGN.md must answer: run-event envelope vs the existing 4.5 SSE vocabulary; turn-journal storage shape (`run_events` table vs append-only jsonl); Agent SDK session + permission model on pei; Skills-tab registration/namespacing/attribution contract; generation-iframe sandbox hardening.
- [ ] **P2 — Studio-as-surface.** Dockview workspace + projects table (old 4.6 Workstream A). Panels now include Run + Board, not just artifacts.
- [ ] **P3 — HIL gate unification.** `approval` / `clarify` as run primitives merged with the dreams/claims surfaces (old 4.6 + hermes-webui flow). Preserves partner mode.
- [ ] **P4 — Sniper + Handoff carryover.** Old 4.6 Workstreams B + D (open-design sniper, Claude-Design handoff modal, PDF/ZIP/standalone exports), largely intact.
  - **Phase gate:** artifact-pipeline DESIGN.md (sniper write-path, stub-guard, `faro.manifest.v1` schema) before `/execute` — carries the §6.6 / §15.3 DESIGN.md discipline forward.

**Validation:** faro launches a Claude Code run, streams tokens/tools live, an inline approval gate blocks then resumes it, the run survives a faro restart (turn-journal replay), an imported skill appears in the live Skills tab and generates a streamed HTML artifact.

---

## 12. Future considerations

- **Multi-user RBAC for canon** — out of scope until canon usage proves the need.
- **Public Ionos domain** — out of scope for v0.1; Caddy ready for it.
- **Mobile responsive** — defer; Tailnet implies desktop primary.
- **In-app skill install** — copy-as-prompt for now; later phases may shell out to `claude plugin install` with approval.
- **Two-way artifact interaction** (Thariq sliders, knobs, drag-reorder) — Phase 5+.
- **Eval workflows via Langfuse datasets** — only if dream quality regresses.
- **Public-facing SaaS version** — explicit non-goal.
- **Agent org-chart / department brains / orchestrator** *(2026-05-15)* — the Hermes model is a mental model; explicit non-goal until earned. Brains live in refactor-canon, not faro.
- **Automated orchestration / routing** *(2026-05-15)* — the operator routes manually via faro in v0.4; an automated router is net-new and out of scope.
- **Multi-tenant SaaS** *(2026-05-15)* — North Star only; the `profile_id` seam is designed, tenancy is not built.
- **Multi-provider / non-Claude agents** *(2026-05-15)* — Claude Code only for now; pluggable harnesses are a future aspiration, not v0.4.

---

## 13. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `claim_decisions` migration breaks Slack flow | Med | High | Phase 0 ships migration empty; Slack flow keeps hitting existing `apply_dream`. Phase 1 wires Slack `Approve` to bulk-stamp claims AFTER e2e test of new flow. |
| `ccusage` CLI absent on pei | Low | Med | `scripts/install.sh` installs ccusage globally; fallback `lib/jsonl.ts` parses directly. |
| ~~Bun + better-sqlite3 ABI mismatch~~ Realized 2026-05-12 — Bun lacks better-sqlite3 support (`oven-sh/bun#4290`). | Realized | High | **Mitigated**: pivoted production runtime to Node 22; Bun stays for install + dev only. Captured in §14 decision 6. |
| Ubuntu jammy ships SQLite 3.51 (WAL bug window) | Realized | Med | **Mitigated**: pei rebuilt SQLite to 3.53.1 from source. See `infra/pei/README.md` §SQLite. |
| Next.js standalone deploy unfamiliar | Low | Med | midday-ai/v1 ships a working Bun + Next.js + standalone systemd recipe — crib it. |
| Profile generalization premature | Low | Low | `profile_id` baked in v0.1; switcher inert. Cheapest hedge. |
| Luma preset drifts from current shadcn | Low | Low | Pin via `shadcn/create` snapshot at Phase 0; re-pull on next PRD iteration. |
| Carousel-vs-list pushback | Low | Med | Vertical list decided; carousel toggle off by default. |
| Skill-hub / clawhub direction unclear | High | Low | Phase 3 recommender phase-gates on `DESIGN.md`. |
| HTML artifacts diverge from persistent UI styling | Med | Low | Shared `faro/design-tokens.yml` consumed by both Tailwind config and `web-artifacts-builder` skill in Phase 5. |
| GitHub mirror leaks private memory accidentally | Med | High | Subtree push only `faro/` — `memory/`, `raw/`, `wiki/` NEVER cross the boundary. Verify with first manual push. CI job has explicit `--prefix=faro/` flag; no `--all`. |
| Caddy + Tailscale-User-Login header forwarding subtle | Low | Med | Explicit `header_up` directive; integration test in Phase 0 hits faro through Tailscale + Caddy chain. |
| Token cost explosion on bundled HTML artifacts | Low | Low | 2–4× MD cost per Thariq; only for high-value artifacts; hard-cap via SDK `max_tokens`. |
| **Iframe sandbox + `postMessage` XSS surface** *(Phase 4)* | Low | High | Sandbox flags `allow-scripts` only — no `allow-top-navigation`, no `allow-forms`, no `allow-popups`. CSP on `/studio/raw` denies `connect-src`. `postMessage` handler validates `origin` + message `type` strictly. E2E test in Phase 4 hits a hostile bundle.html to verify isolation. |
| **`artifacts` table growth** *(Phase 4)* | High | Low | No auto-prune in Phase 4; manual quarterly sweep. Index on `(emitter, profile_id, created_at DESC)` keeps gallery queries fast at 10K+ rows. §15.3 open question tracks prune policy. |
| **bundle.html size on the wire** *(Phase 4)* | Med | Low | `web-artifacts-builder` inlines data URIs which can balloon files. Cap at 5MB per bundle in the emitter wrapper; surface a "this artifact is large" warning in the gallery if `bytes > 1MB`. |
| **Provider-chip palette drift** *(Phase 4)* | Low | Low | Brand hexes are committed as `oklch` CSS vars in one place (`globals.css` `@theme`); never inlined per-component. Annual brand audit OR on user request. OpenRouter hex is unverified — fallback documented in source comment. |
| **shadcn `sidebar-07` upstream drift** *(Phase 4)* | Med | Low | Pin via `shadcn/create` snapshot at the start of Phase 4 Track B; re-pull on next PRD iteration. Layout-level component, so drift is visible immediately. |
| **`postMessage` highlight feature breaks on cross-origin bundles** *(Phase 4)* | Med | Med | Bundle.html is served from same origin (`/studio/raw/<id>`), so `origin` check passes. If a future feature hosts artifacts on a separate subdomain, the highlight bridge needs an explicit origin allowlist. |
| **SDK→CLI regression temptation** *(v0.4)* | Low | Med | Locked: Agent SDK only (§7 non-choices, decision 26). Lift html-anything's *shaping* layer, never its spawn/argv. |
| **html-anything bus-factor** — 4-day-old repo, 2 humans, AI-authored commits, no tests *(v0.4)* | High | Low | Vendored with attribution, NOT a tracked dep; only stable shaping/extract logic + `SKILL.md` assets lifted. |
| **Un-audited bundled skills carry upstream licenses** *(v0.4)* | Med | Low | Accepted 2026-05-15 (no per-skill audit). Revisit only if faro is published beyond the Tailnet. |
| **iframe sandbox regression when lifting html-anything preview** *(v0.4)* | Med | High | html-anything ships `allow-scripts allow-same-origin`; faro's Phase 4 `allow-scripts`-only contract (§6.6.4, §6.9) is non-negotiable. E2E hostile-bundle test in P4. |
| **"Control Station" scope creep** *(v0.4)* | High | Med | Increment ambition, not a rewrite; org-chart/orchestrator explicitly out (§12); P1 gated on DESIGN.md + acceptance round. |
| **Phase 4.5 kept but only lightly tested** *(v0.4)* | Med | Med | User tested 2026-05-15 ("mostly good"); P1 extends, never rebuilds; turn-journal + P1 tests harden the run path it sits on. |

---

## 14. Decisions captured

**2026-05-12 (initial):**

1. **Stack: Hybrid D.** FastAPI shell + compiled Tailwind v4 + Basecoat UI + React/Vite islands. ❌ **Reopened and reversed same day** (see #5 below).
2. **Dream UX: vertical card list grouped by category.** NOT carousel. Carousel left as off-by-default toggle.
3. **Scope: lwiki-only in v0.1.** Profile-slug + active pill ship in v0.1 nav; `profile_id` column added to tables in Phase 0. Multi-agent switcher activates in Phase 4.
4. **Trace backbone: local-first.** Parse `~/.claude/projects/*.jsonl` + `stats-cache.json` directly. Langfuse v3 deferred to Phase 4.

**2026-05-12 (revised, post-Luma directive):**

5. **Stack: Full Next.js 16 + shadcn Luma preset (Radix).** Reverses #1. Rationale: true Luma fidelity requires Radix React; Basecoat is Luma-flavored at best. Matches KULT Pro stack — maximum pattern reuse. FastAPI/lwiki_ui retires at end of Phase 1.
6. **Runtime: Node 22+ in production; Bun 1.3.13+ for install + dev only.** Reopened 2026-05-12 during Phase 0 execute: Bun lacks `better-sqlite3` ABI support (`oven-sh/bun#4290`); `bun:sqlite` bundles SQLite 3.51.2 (inside WAL bug window). `better-sqlite3@12.9.0` bundles 3.53.0 patched. Ubuntu jammy on pei rebuilt to SQLite 3.53.1 from source for the system CLI + Python `sqlite3` module.
7. **Auth: Tailscale-User-Login only for v0.1.** Public domain via Ionos + Caddy + Keycloak deferred to v0.2+ when canon multi-user demand arrives. Caddy installed in Phase 0 to position us for later.
8. **GitHub mirror: faro/ subtree only.** Push to `github.com/lucaramirezo/faro` from GitLab CI on every main push. `memory/`, `raw/`, `wiki/` NEVER cross to GitHub.
9. **Naming: faro v0.1**, not v1.0. Cuando se semantiza el versionado real (post-Phase-1 launch), bumps to v1.0.
10. **Subsidy-captured KPI** is the home-page wedge. No existing dashboard surfaces this.
11. **Phase-3 recommender is gated.** Requires `DESIGN.md` + clawhub research before /execute.
12. **Phase-5 artifact pipeline is gated.** Requires `DESIGN.md` before /execute.

**2026-05-13 (iteration #2 — post Phase 2 ship, post 5-subagent research synthesis):**

13. **Phase reorder.** New Phase 4 = Artifact Studio + Polish Pass (was Phase 5). New Phase 5 = Multi-agent + Langfuse (was Phase 4). Rationale: user wants the HTML/studio surface ASAP — markdown is fine for agent ↔ agent context but HTML earns its rendering cost the moment a human has to steer (per [the_unreasonable_effectiveness_of_html](../raw/articles/2026-05-12-unreasonable-effectiveness-of-html.md)). Multi-agent + Langfuse can wait until canon multi-user demand actually arrives.
14. **Studio shape: gallery + provenance + handoff, NOT IDE.** No file tree (faro's user has Claude Code one keystroke away — the cockpit primitive is grouped-by-run reverse-chronological list, per Manus / Replit Agent 4). No in-browser code editor at all (Monaco read-write was rejected first for the second-writer race with Claude Code; then dropped entirely in iteration #3 in favor of Shiki RSC for read-only viewing). The only two-way primitive in v1 is **highlight-to-comment-back-into-prompt** (OpenAI Canvas pattern). Matches Anthropic's [Claude Design handoff-bundle loop](https://www.anthropic.com/news/claude-design-anthropic-labs) (Apr 17 2026). Locked after a 5-subagent research synthesis on 2026-05-13: in-browser editing recommendation reversed in favor of the gallery+handoff shape; user approved the pushback.
15. **Nav: vertical sidebar (shadcn `sidebar-07`) + 48px top bar with locator pill + ⌘K + Bell + ThemeToggle.** Replaces v0.1 horizontal `TopBar.tsx`. Top-bar locator helper-text dot-separated (`· local Claude daemon` vs `· pei (Tailscale Serve)`). Source of truth for the agent dropdown is `team-switcher.tsx` (shared between sidebar header and locator pill click). References: [Vercel dashboard redesign](https://vercel.com/changelog/dashboard-navigation-redesign-rollout), [Linear UI redesign](https://linear.app/now/how-we-redesigned-the-linear-ui), [Notion sidebar breakdown](https://medium.com/@quickmasum/ui-breakdown-of-notions-sidebar-2121364ec78d).
16. **Provider chip system via `color-mix(in oklab, var(--brand) 12%, transparent)`.** 9 brands locked with `oklch` CSS vars in `globals.css` `@theme`: anthropic (`#D97757`), gemini (`#078EFA` + `#AD89EB`), supabase (`#3ECF8E`), openai (`#10A37F`), openrouter (`#6E40C9` — unverified, fallback documented), linear (`#5E6AD2`), slack (`#4A154B`), github (`#24292F`), vercel (`oklch(0.20 0 0)`). Linear-style 12% tint with 25% ring; never paint chips in pure brand color.
17. **One mesh-gradient hero card only.** Subsidy KPI card gets a pure-CSS radial-gradient stack as `::before`, `mix-blend-mode: plus-lighter`, `opacity: 0.55`, no animation. Reject Three.js / OGL aurora (50–100kB JS, RSC-hostile). Scarcity = premium — apply this effect to one card, not everywhere.
18. **Embla dreams carousel hot-fix shipped out-of-phase 2026-05-13.** `min-h-[360px]` (which Embla's Y-axis cannot use as a snap stride) → `h-[360px] shrink-0`; button disabled state rewired from local `index` to Embla's `canScrollPrev`/`canScrollNext` API + `reInit` listener. Not bundled into Phase 4 because user was actively testing dreams when the bug surfaced.

**2026-05-13 (iteration #3 — Phase 4 mid-flight cleanup, post DESIGN.md gate):**

19. **DESIGN.md gate locked** at [`faro/.claude/skills/artifacts/DESIGN.md`](.claude/skills/artifacts/DESIGN.md). 10 locked decisions: web-artifacts-builder skill pin (`b9e19e6`), Tailwind v3/v4 split accepted, `sandbox="allow-scripts"` alone (no `allow-same-origin`), `artifact_id = sha256(content_hash + run_id)[:16]`, no auto-prune in v1 (manual quarterly /artifact-gc deferred), 48/280/flex/320 studio shell, highlight bridge injected at bundle time, code renderer = Shiki RSC, all 5 emitters ship in main PR, B1 hard-cut before A4. Source of truth for any §6.6 / §15.3 conflict.
20. **JSON viewer: `react-json-view-lite` v2.** Replaces `react-json-tree`. Reason: React 19 peer compatibility; `react-json-tree` maintenance is dormant. Bundle delta: negligible.
21. **Code renderer: Shiki RSC.** Replaces Monaco entirely (not just read-only). Server-rendered `<pre>` via existing `lib/shiki-diff.ts`; no client bundle (~3MB saved vs Monaco); eliminates `worker-src` CSP carve-out documented in §3.2 of DESIGN.md. Trade-off: no in-place find-in-file or go-to-line — long files go through `[Open in Claude Code]` handoff per decision #14.
22. **Recharts citation removed from §15.2.** PRD §7 already corrected Recharts → Tremor 3.18.7 in iteration #2; the lingering reference link was historical noise. Phase 4 full-bleed KPI charts use Tremor `<SparkAreaChart>` exclusively.

**2026-05-14 (iteration #4 — Phase 4.5 "Feels Alive"):**

23. **Phase 4.5 locked decisions** (shipped as commits `e249894` pre-flight → `127d70b` Workstream D, 7 commits over four workstreams A/B/C/D):
    - **`@tailwindcss/typography` registered via CSS-side `@plugin`** (Tailwind v4 — no `tailwind.config.{js,ts}`). Fixes the most visible Phase 4 regression: `MarkdownRenderer`'s `prose prose-sm dark:prose-invert` actually styles now.
    - **Chat provider: `@anthropic-ai/claude-agent-sdk`** ONLY. Never `@ai-sdk/anthropic`. Both `rerunClaim` (dreams tweak) and `streamChat` (studio chat) call `query()` against the Max-sub OAuth. The empty-string folklore `Environment=ANTHROPIC_API_KEY=` is documented as broken — `UnsetEnvironment=` + `CLAUDE_CODE_OAUTH_TOKEN` via systemd `LoadCredential` is the only correct pei pattern.
    - **Image-gen: multi-provider day 1.** `lib/providers.ts` switches on `models.<feature>.provider` from the active profile YAML. Imagen 4 ships as the `wiki_image` default; gpt-image-1 is one YAML edit + `requireOpenAIKey()` away. Costs land in `provider_calls` via `recordCall`.
    - **`TweakPatch` is a Zod discriminated union** with a `{schema_version: 1, patch}` envelope persisted on `claim_decisions.tweak_patch`. Four variants (`set-text`, `set-status`, `merge-with`, `set-rubric-score`); the rubric-score variant round-trips on `reviewer_note` as `[rubric:N/10]` until a dedicated column lands in Phase 5.
    - **Studio chat tab in `/studio` only** (no persistent `/chat` route). Provenance + Chat wrap in shadcn `<Tabs>` via `ProvenanceTabs.tsx`. Chat messages persist to `localStorage` keyed by `artifact_id` and drop on artifact promote (decision #5). Tools off in v1; `ToolCard.tsx` registry primed for Read/Write/Bash when they graduate.
    - **Studio "modes" + persistent `/chat`: DEFERRED to Phase 5** when the canon profile lands. Modes only earn their weight at ≥2 profiles.
    - **Per-session cost cap $0.25** in `TweakEditor` (UI hard-cap; backend logs only). `provider_calls.meta` is open-ended JSON in v1 (decision #4) — Zod-tighten in Phase 5 once usage settles.
    - **Image-gen approval gate: drafts first, manual promote** (decision #6). PNG lands in `drafts/artifacts/<date>/imagegen-<HHMMSS>-<slug>/`. Promote-to-wiki is the existing Phase 4 path.
    - **gpt-image-1 default = medium ($0.04)** (decision #7); high ($0.167) is a per-call toggle in the Illustrate modal.
    - **Raw studio endpoint emits `image/png|jpeg|webp` without `charset=utf-8`** — binary mimes get the bare type so browsers don't misinterpret bytes.
    - **No vector store / no RAG** — chat system prompt loads the open artifact's content directly (50KB cap with `...[truncated]` suffix). Phase 5 may add retrieval when canon volume warrants.

**2026-05-15 (iteration #5 — Control Station repositioning):**

24. **faro = the Control Station** of an agent OS for a solo operator running many Claude Code agents. The studio becomes one surface; the spine is a run engine (§5.7, §6.7). The Holmberg agent-org-chart is a mental model, not a build target. This repositions the *product* framing above decisions 13–14 (the studio-shape decisions themselves still stand).
25. **Scope = incremental v0.4, not a v2 rewrite.** Built on top of Phase 4.5 (kept — tested 2026-05-15, mostly good). Supersedes the *content* of [`.agents/plans/faro-phase-4.6-agent-os.md`](../.agents/plans/faro-phase-4.6-agent-os.md); its A/B/D workstreams re-sequence into the §11 Control Station roadmap.
26. **Agent integration: Claude Agent SDK ONLY; CLI subprocess rejected.** Reason: the SDK runs on Luca's Max subscription/OAuth. Reaffirms decision 23's chat-provider lock and extends it to the run engine. `ANTHROPIC_API_KEY` unset; headless via `claude setup-token`.
27. **Boundary: control station only.** Company/department "brains" stay in refactor-canon / TRL Company Brain; faro never owns company knowledge. The orchestrator role is unfilled — heartbeat/reflection are pipelines faro *observes*, not a router; the operator routes manually. No org-chart/orchestrator abstractions until earned.
28. **Lift posture: vendor with attribution, no per-skill license audit.** Sources: `nexu-io/open-design` (Apache-2.0 — sniper), `nexu-io/html-anything` (Apache-2.0 — shaping/`extract-html`/SSE/`SKILL.md` + ~75 skills; NOT its CLI layer, NOT CJK/WeChat surfaces), `nesquena/hermes-webui` (MIT — run-adapter contract + approval/clarify + turn-journal; NOT the org-chart Hermes — it is a UI for Nous Research's single Hermes Agent, "teams of agents" is unbuilt upstream backlog issue #719).
29. **Skills tab goes LIVE.** Imported html-anything skills register + render in the Skills tab (no stub) and are selectable for the artifact-generation path. A hard v0.4 deliverable.
30. **Determinism boundary.** Jinja stays for deterministic approval/review pages; LLM-constrained generation only for rich one-off artifacts (cost/latency/non-determinism). Extends the §6.6.3 emitter table; does not replace it.
31. **P1 is phase-gated on a research-exploration prime + an acceptance round before `/plan-feature`** (mirrors the 2026-05-15 priming-session pattern that produced this iteration).

**2026-05-15 (iteration #6 — P1 Run-engine spine SHIPPED; plan `.agents/plans/faro-p1-run-engine-spine.md`):**

32. **P1 run-engine spine — the 6 locked gate answers (acceptance round 2026-05-15), implemented, not redesigned:**
    - **Q1 — Event contract: WRAP, not replace.** New `lib/run-events.ts` `RunEvent` discriminated union on a `kind` discriminant, disjoint from Phase 4.5 `ChatSSEEvent` (`type`). 4.5 `streamChat` / `/api/chat` / `Chat.tsx` byte-for-byte unchanged (`agent-sdk.test.ts` still green). Runs stream from a NEW `/api/runs/[runId]/stream`; data-only SSE wire (`data: <json>\n\n`); reconnect via `?after_seq=` replayed from the journal.
    - **Q2 — Journal: JSONL = source of truth, SQLite = rebuildable index.** `drafts/runs/<run_id>/journal.jsonl`, append-only, fsync on first event + every approval/clarify/gate_resolved/terminal + a best-effort directory fsync. `runs`/`run_events` are derived (`reconcileRunsFromJournals`, idempotent, run guarded once on first `getDb()`); run durability never touches the Python-shared `state.db` hot path. The engine is the SINGLE journal writer; the SSE route only tails (250ms poll).
    - **Q3 — Session/permission: setup-token auth UNCHANGED + default-deny `canUseTool` (no allowlist).** `ensureOAuthAuth`/`signalToController`/`getClaudeCodePath` exported from `agent-sdk.ts` (export-only, zero behavior change) and reused. `maxTurns` = `FARO_RUN_MAX_TURNS`, default **16**, env-overridable.
    - **N1 — Gate vs SDK wall-clock: cancel + resume-replay (CONFIRMED viable).** Verified against the installed `@anthropic-ai/claude-agent-sdk@0.2.140` `sdk.d.ts`: `Options.resume?: string` (session id), `canUseTool` is 3-arg returning `{behavior:"deny",message,interrupt?}` — `interrupt` OMITTED cancels only the tool, the turn ends naturally (no process kill); a `system/permission_denied` message accompanies the deny and is tolerated. Gate denies → journals `approval` (fsync) → turn ends → operator answer resumes the session (`resume=session_id`) with a continuation message; seq stays monotonic across the resumed turn (persisted `runs.last_seq`, robust to a restart between gate and answer). **No abort-mid-tool fallback needed.**
    - **Q4 — Skills: dedicated `imported` scope.** `SkillScope` widened; third scan root `<agent_root>/faro/.claude/skills/imported/`; `attribution` parsed from frontmatter → card badge; lazy `loadSkillBody()` for §6.9. Precedence **project > imported > global**.
    - **Q5 — Generation sandbox: reuse the existing `/studio/raw` `allow-scripts`-only CSP UNCHANGED.** Generation v1 is tools-OFF (`allowedTools:[]`, no `canUseTool`); HTML recovered from streamed assistant TEXT via the vendored `lib/extract-html.ts` ladder (html-anything Apache-2.0 @b699e8a; rung-5 `cdn.tailwindcss.com` scaffold replaced with a self-contained inline doc) and written to `drafts/artifacts/<date>/<run_id>/generated.html` where `scanArtifacts` indexes it. Never `allow-same-origin`.
    - **Scope boundary held:** Dockview workspace = P2; HIL gate *unification* with dreams/claims = P3 (P1 ships the gate *primitive*); sniper/handoff/exports = P4. `db.ts:ensureSchema` ⇆ `migrate.ts` drift reconciled for the new tables only (the pre-existing `artifacts`/`provider_calls` `ensureSchema` omission is left as-is, flagged for future cleanup). `recordCall` deliberately NOT called for runs (Max-sub OAuth absorbs cost). All 5 validation levels green (Level 4 manual = pei live test); 125/125 tests; standalone build OK.

---

## 15. Appendix

### 15.1 Related documents

- [`lwiki-prd.md`](../lwiki-prd.md) — parent PRD for lwiki system
- [`the_unreasonable_effectiveness_of_html.md`](../raw/articles/2026-05-12-unreasonable-effectiveness-of-html.md) — Thariq Shihipar's article; foundational thesis · digest [[unreasonable-effectiveness-of-html]]
- [`CLAUDE.md`](../CLAUDE.md) — vault structure, session protocol
- [`.claude/commands/create-agent-os-prd.md`](../.claude/commands/create-agent-os-prd.md) — iterator for this PRD
- [`lwiki_ui/`](../lwiki_ui/) — predecessor package; retires at end of Phase 1
- [`.agents/plans/faro-phase-4.6-agent-os.md`](../.agents/plans/faro-phase-4.6-agent-os.md) — superseded 2026-05-15; A/B/D workstreams re-sequenced into the §11 Control Station roadmap
- *Hermes Agent company org-chart explained* (Shann Holmberg model) — user-provided 2026-05-15; mental model only, not tracked in-repo

### 15.2 Research citations

**Architectural references:**

- [vercel/next.js](https://github.com/vercel/next.js) v16 — App Router, RSC, Server Actions, standalone build.
- [midday-ai/v1](https://github.com/midday-ai/v1) — Bun + Next.js + shadcn Luma + Biome starter. **Primary cribbing target for scaffold.**
- [shadcn/ui](https://ui.shadcn.com) + [Luma preset announcement](https://ui.shadcn.com/docs/changelog/2026-03-luma).
- [tweakcn.com](https://tweakcn.com) — live Luma theme editor.
- [oven-sh/bun](https://github.com/oven-sh/bun) — runtime.
- [WiseLibs/better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — Node SQLite binding, WAL-safe.
- [developer-hasm/claude-code-dashboard](https://github.com/developer-hasm/claude-code-dashboard) — MIT, Next.js 15. Skill parser logic.
- [ryoppippi/ccusage](https://github.com/ryoppippi/ccusage) — MIT. CLI we shell out to.
- [langfuse/langfuse](https://github.com/langfuse/langfuse) — MIT v3. Phase 4 trace backbone (deferred).
- [abhi1693/openclaw-mission-control](https://github.com/abhi1693/openclaw-mission-control) — MIT. Approval-flow UX reference.
- [nesquena/hermes-webui](https://github.com/nesquena/hermes-webui) — inspiration only.

**Control Station lift sources — added 2026-05-15 (vendored with attribution, NOT dependencies):**

- [nexu-io/open-design](https://github.com/nexu-io/open-design) — Apache-2.0. Sniper edit-mode bridge / source-patches / projects / stub-guard (old 4.6 Workstream B).
- [nexu-io/html-anything](https://github.com/nexu-io/html-anything) — Apache-2.0 (released ~2026-05-11; young, 2 contributors, AI-authored, no tests — reference to lift, not track). Lifted: `extract-html`, SSE convert-route pattern, `SKILL.md` anti-AI-slop design directives + ~75 skills. **NOT lifted:** the spawn/argv **CLI** layer; WeChat/Zhihu/Weibo/XHS export surfaces + CJK-only skills.
- [nesquena/hermes-webui](https://github.com/nesquena/hermes-webui) — MIT (mature; 5.3k tests). Lifted as *design*: run-adapter event contract (`docs/rfcs/hermes-run-adapter-contract.md`), approval/clarify HIL flow, turn-journal replay. **Correction:** this is a UI for Nous Research's *single* Hermes Agent, NOT the Holmberg org-chart — "teams of agents" is unbuilt upstream backlog (issue #719). The org-chart is net-new and out of scope.

**UX references for sharded dream review:**

- [elie222/inbox-zero](https://github.com/elie222/inbox-zero) — MIT 6k★. Card-triage primitive.
- [usememos/memos](https://github.com/usememos/memos) — MIT. Card-stream UI.
- [khoj-ai/khoj](https://github.com/khoj-ai/khoj) — citation-chip pattern.
- Superhuman / Hey / Things 3 — keyboard-first triage models (pattern-only).
- Cursor / Notion AI — per-claim accept/reject (pattern-only).

**Anthropic skills:**

- [`frontend-design`](https://github.com/anthropics/skills/tree/main/skills/frontend-design) — already loaded.
- [`web-artifacts-builder`](https://github.com/anthropics/skills/tree/main/skills/web-artifacts-builder) — Phase 5 pipeline.
- [`skill-creator`](https://github.com/anthropics/skills/tree/main/skills/skill-creator) — for new faro-specific skills.
- [`brand-guidelines`](https://github.com/anthropics/skills/tree/main/skills/brand-guidelines) — template to clone for `faro-design-guidelines`.
- [Impeccable](https://impeccable.style) — third-party design-skill suite (`/impeccable audit`, `/impeccable polish`).

**HTML thesis & gallery:**

- [Thariq Shihipar HTML effectiveness gallery](https://thariqs.github.io/html-effectiveness) — 20 examples.

**Existing infrastructure references:**

- [Caddy](https://caddyserver.com/docs) — reverse proxy on pei.
- [Tailscale Serve](https://tailscale.com/kb/1242/tailscale-serve) — Tailnet ingress.
- [Ionos DNS](https://www.ionos.com) — for v0.2+ public domain.

**Phase 4 (Artifact Studio) — added 2026-05-13:**

*Anthropic artifact surfaces (May 2026):*

- [Introducing Claude Design — Anthropic](https://www.anthropic.com/news/claude-design-anthropic-labs) — Apr 17 2026 launch announcement. The "handoff bundle → Claude Code" loop is faro's model.
- [TechCrunch — Anthropic launches Claude Design](https://techcrunch.com/2026/04/17/anthropic-launches-claude-design-a-new-product-for-creating-quick-visuals/) — secondary source.
- [Claude Help Center — Artifacts](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them) — Preview/Code toggle, version selector, copy/download in lower-right corner.
- [`web-artifacts-builder` skill](https://github.com/anthropics/skills/tree/main/skills/web-artifacts-builder) — canonical `bundle.html` contract (React 18 + Vite + Parcel + `html-inline`).
- [`frontend-design` skill](https://github.com/anthropics/skills/tree/main/skills/frontend-design) — aesthetic guardrails (avoid generic-AI-slop fonts and gradients).

*Competitor artifact studios (informed the studio-shape decision):*

- [OpenAI Canvas announcement](https://openai.com/index/introducing-canvas/) — highlight-to-edit, Suggest edits, version back-button. faro adopts highlight-to-comment as the only two-way primitive.
- [Vercel v0.app docs](https://v0.app/docs/faqs) — file tree + preview, visual-edit mode. **Rejected the file tree** for faro.
- [Bolt.new repo](https://github.com/stackblitz/bolt.new) + [WebContainers](https://webcontainers.io/) — port-forwarded preview tabs. Out of scope for single-user cockpit.
- [Cursor 2.0 / Composer](https://www.codecademy.com/article/cursor-2-0-new-ai-model-explained) — per-file accept/reject; partner-mode primitive faro reuses for `[Promote to wiki]`.
- [Replit Agent 4](https://replit.com/agent4) — phase-aware UI; gallery groups artifacts by phase badge.
- [Manus AI analysis (arxiv 2505.02024)](https://arxiv.org/html/2505.02024v1) — atomic-evidence panel; faro's provenance pane mirrors this.
- [Roo Code v2.1 update notes](https://docs.roocode.com/update-notes/v2.1) — defensive auto-reject on truncated writes.

*HTML-for-agents practitioners:*

- [Geoffrey Litt — Enough AI Copilots! We need AI HUDs](https://www.geoffreylitt.com/2025/07/27/enough-ai-copilots-we-need-ai-huds) — ambient awareness UIs over chat.
- [Maggie Appleton — One Developer, Two Dozen Agents, Zero Alignment (ACE)](https://maggieappleton.com/zero-alignment) — always-on summary block, Team Pulse, knobs/sliders.
- [Simon Willison on HTML effectiveness](https://simonwillison.net/2026/May/8/unreasonable-effectiveness-of-html/) — endorsement of Thariq's thesis with concrete demos.
- [Thariq's playgrounds post](https://x.com/trq212/status/2017024445244924382) — sliders + copy-to-prompt buttons as the two-way loop.
- Shann Holmberg ([@shannholmberg](https://x.com/shannholmberg)) tri-pane framework (review dashboard / system overview / performance dashboard) — referenced by user; specific posts not independently verified, taken as guidance not citation.

*Phase 4 UI references:*

- [shadcn sidebar blocks](https://ui.shadcn.com/blocks/sidebar) — `sidebar-07` is the base for the nav rebuild; ships `team-switcher.tsx`.
- [Vercel dashboard redesign 2026](https://vercel.com/changelog/dashboard-navigation-redesign-rollout) — workspace switcher at top of sidebar.
- [Linear UI redesign](https://linear.app/now/how-we-redesigned-the-linear-ui) — reduced visual noise in top bar.
- [Notion sidebar UI breakdown](https://medium.com/@quickmasum/ui-breakdown-of-notions-sidebar-2121364ec78d) — sidebar info density patterns.
- Brand palettes: [Anthropic (mobbin)](https://mobbin.com/colors/brand/claude), [Gemini (brandarchive)](https://brandarchive.xyz/identity/gemini-google-2025), [Supabase](https://supabase.com/brand-assets), [OpenAI](https://openai.com/brand/), [Linear (mobbin)](https://mobbin.com/colors/brand/linear), [Slack PDF](https://a.slack-edge.com/0f43e/marketing/img/media-kit/Slack-Brand-Guidelines.pdf), [GitHub](https://colorcode.tools/brands/github).
- Aurora / mesh: [Aceternity Aurora Background](https://ui.aceternity.com/components/aurora-background) (reference; rejected the JS-required version), [mesh gradient CSS guide](https://better-gradient.com/blog/mesh-gradient-css-guide).
- Full-card charts: [Tremor SparkChart docs](https://www.tremor.so/docs/visualizations/spark-chart), [shadcn stats-sparkline block](https://www.shadcn.io/blocks/stats-sparkline), [Stripe dashboard home charts pattern](https://support.stripe.com/questions/dashboard-home-charts-overview).
- [`embla-carousel-react` API](https://www.embla-carousel.com/api/) — `canScrollPrev`/`canScrollNext` + `reInit` event used in the dreams-carousel fix.

### 15.3 Open questions for next iteration

- **GitHub repo visibility** — `github.com/lucaramirezo/faro` public vs private at creation time. Public showcases the work; private gates portfolio. Defer to repo-creation moment.
- **`refactor-canon` profile location** — `faro/profiles/refactor-canon.yml` in lwiki repo, or `faro-profile.yml` at canon repo root. Affects where multi-agent state lives.
- **Where Phase 0 DESIGN.md draft lands** — root of `faro/.claude/skills/faro-design-guidelines/` vs `faro/DESIGN.md`. Tracks the KULT pattern (which uses `/kult/DESIGN.md`).
- **`bun next build` outputs to git or not** — committing `.next/standalone/` simplifies pei deploy but bloats the GitHub mirror. Recommendation: build in GitLab CI, deploy artifact to pei via rsync, don't commit `.next/`. Confirm at Phase 0 execute.
- **Caddy install on pei** — Docker Compose vs system package. Recommendation: system package (Debian repo); systemd manages it.

**Phase 4 (Artifact Studio) — added 2026-05-13:**

- **Prune policy for `drafts/artifacts/`** — no auto-prune in Phase 4; need a rule (age-based? size-cap-based? "after promoted_at + N days drop"?) and the `/artifact-gc` skill design before the table grows past ~10K rows.
  - **Closed (2026-05-13):** Deferred to `/artifact-gc` skill (Phase 5+); manual quarterly sweep in v1. See [`faro/.claude/skills/artifacts/DESIGN.md`](.claude/skills/artifacts/DESIGN.md) §5.
- **Artifact-id stability** — `sha256(profile_id + relative_path + content_hash)[:16]` *vs* `sha256(content_hash + run_id)[:16]`. Path-keyed survives renames poorly; content-keyed duplicates when the same bundle is re-emitted. Phase 4 DESIGN.md must lock this before the migration runs.
  - **Closed (2026-05-13):** Locked in [`faro/.claude/skills/artifacts/DESIGN.md`](.claude/skills/artifacts/DESIGN.md) §4: `sha256(content_hash + run_id)[:16]`, content-addressed.
- **Per-profile artifact namespacing** — does each profile's `drafts/artifacts/` live under its `agent_root` (current assumption) or in a shared `faro/data/artifacts/<profile>/` so studio can index all profiles in one walk? Trade: locality vs single-scan ergonomics.
- **`wiki/artifacts/` and GitHub mirror** — `wiki/` is *not* mirrored to GitHub today (privacy boundary). Should `wiki/artifacts/<slug>/bundle.html` files be mirrored *if* they're explicitly marked public (frontmatter `visibility: public`)? Or stay private like the rest of `wiki/`? Affects whether faro can ship "share-this-artifact" external links.
- **VS Code deep-link UX on pei** — laptop has VS Code via `vscode://`; pei doesn't. The `[Open in Claude Code]` toolbar action currently copies a `claude --resume` invocation to clipboard on pei. Is that enough, or do we need a server-side "spawn claude session" endpoint? Defer unless it bites.
- **`heartbeat/morning_brief.py` existence** — Phase 4 Track A assumes this file exists; audit at execute time. If not, the brief emitter ships as a new file co-located with `heartbeat/`.
- **Bell notification scope** — pull-only popover vs SSE push? Pull is simpler; SSE earns its keep only if pending-items volume gets high. Start with pull; revisit in Phase 5.

**Control Station (v0.4) — added 2026-05-15; ALL CLOSED 2026-05-15 by the P1 acceptance round + the shipped P1 spine (decision 32, plan `.agents/plans/faro-p1-run-engine-spine.md`):**

- **Run-event envelope vs Phase 4.5 SSE** — ~~replace or wrap?~~ **Closed (2026-05-15, Q1):** WRAP. New `RunEvent`/`kind` union disjoint from `ChatSSEEvent`; 4.5 path byte-for-byte unchanged; new `/api/runs/[runId]/stream` + `?after_seq=` replay.
- **Turn-journal storage** — ~~`run_events` table vs append-only jsonl?~~ **Closed (2026-05-15, Q2):** BOTH — JSONL is the source of truth (`drafts/runs/<run_id>/journal.jsonl`, fsync-on-gate), `runs`/`run_events` a rebuildable index reconciled on boot.
- **Agent SDK session + permission model on pei** — ~~resumable sessions; canUseTool posture?~~ **Closed (2026-05-15, Q3/N1):** setup-token auth unchanged; SDK `resume` + raised `maxTurns` (env `FARO_RUN_MAX_TURNS`, default 16) + default-deny `canUseTool`; deny-then-resume verified against installed SDK `0.2.140`.
- **Skills-tab registration contract** — ~~discovery/namespacing/attribution/dedup?~~ **Closed (2026-05-15, Q4):** dedicated `imported` scope; root `<agent_root>/faro/.claude/skills/imported/`; `attribution` frontmatter→badge; lazy `loadSkillBody()`; precedence project > imported > global.
- **Generation sandbox hardening** — ~~separate-origin vs allow-scripts-only?~~ **Closed (2026-05-15, Q5):** reuse the existing `/studio/raw` `allow-scripts`-only CSP UNCHANGED; generation tools-OFF, HTML via `extract-html` (self-contained scaffold, no external CDN); never `allow-same-origin`.
