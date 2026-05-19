import "server-only";

import { getClaimsByRunGrouped } from "@/lib/claims";
import { getDb } from "@/lib/db";
import { resolveGate } from "@/lib/run-engine";
import { readJournalAfter } from "@/lib/run-journal";

/**
 * P3 HIL gate unification — the read-projection + write-through dispatcher.
 *
 * Two structurally disjoint HIL gates (the P1 run-engine gate and the Phase-1
 * dreams/claims gate) are projected into ONE envelope here WITHOUT physically
 * merging their stores (the hermes-webui design lesson — separate stores /
 * endpoints / cards, unify only the resolve contract). No new SQLite table, no
 * schema change, no Python/Slack change. `claim_decisions` stays the dreams
 * authority.
 *
 * `GateResult` is a design lift (MIT, design only) of hermes-webui's
 * `ControlResult` dataclass + the resolution-status contract in
 * docs/rfcs/hermes-run-adapter-contract.md @71c70352c113c57bef959b751e276c38b2c6caf1.
 * faro narrows the status set to exactly the control-resolution subset it
 * needs; `message` mirrors hermes `safe_message` (populated only when NOT
 * accepted). See LICENSE-third-party.md.
 *
 * SCOPING (operator-locked, P3 acceptance round 2026-05-19 — §14 decision 35):
 * the RUN projection is profile-scoped (`runs` has `profile_id`); the CLAIM
 * projection is DELIBERATELY NOT profile-scoped — it lifts the existing
 * `/dreams` queue query VERBATIM (app/(dashboard)/dreams/page.tsx), which is
 * itself unscoped (`pipeline_runs`/`claim_decisions` carry no usable
 * profile_id), so the Inbox agrees byte-for-byte with the page operators
 * already review. This asymmetry overrides the generic "profile-scope every
 * read" pattern for the claim branch only.
 */

interface UnifiedGateBase {
  gateId: string;
  runId: string;
  title: string;
  createdAt: number;
}

/** One pending human decision, discriminated on `source`. The `source:"run"`
 *  field set is kept IDENTICAL to GatePrompt.tsx's `ActiveGate` so the run
 *  rows reuse that component with no adapter. */
export type UnifiedGate =
  | (UnifiedGateBase & {
      source: "run";
      kind: "approval" | "clarify";
      tool?: string;
      args?: unknown;
      question?: string;
    })
  | (UnifiedGateBase & {
      source: "claim";
      kind: "dream-review";
      pendingCount: number;
      totalCount: number;
      reviewHref: string;
    });

/**
 * The resolution envelope. Design-lifted from hermes-webui `ControlResult`
 * (api/runtime_adapter.py, MIT, pin 71c70352…): `accepted` bool, a narrowed
 * `status` literal set, and an optional human `message` (← `safe_message`,
 * convention: set only when NOT accepted).
 */
export interface GateResult {
  accepted: boolean;
  status: "accepted" | "not-active" | "unsupported";
  message?: string;
}

const DENY_DECISIONS = new Set(["deny", "reject", "no"]);
const PENDING_DREAM_STATUSES = new Set(["pending", "rerunning"]);

function isDeny(decision: string): boolean {
  return DENY_DECISIONS.has(decision.trim().toLowerCase());
}

/**
 * Normalize a SQLite timestamp to epoch ms. `runs.created_at` is UTC ISO
 * (…Z, from run-journal tsToSql); `pipeline_runs.created_at` is the Python
 * pipeline's `YYYY-MM-DD HH:MM:SS` (UTC, no zone). Mirrors the locked 4.5
 * read-back UTC normalizer so a missing zone is treated as UTC, not local.
 */
function toEpochMs(s: unknown): number {
  if (typeof s === "number") return s;
  if (typeof s !== "string" || !s) return 0;
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const withZ = /[Z]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const t = Date.parse(withZ);
  return Number.isNaN(t) ? 0 : t;
}

interface RunGateRow {
  run_id: string;
  status: string;
}

/**
 * `pipeline_runs` is slack_agent-owned (the dreams authority); ensureSchema
 * deliberately does NOT create it and a fresh laptop DB lacks it until
 * `bun run migrate` stubs it (db.ts / migrate.ts comments). The Inbox is a
 * high-traffic surface — a missing table must degrade to "no claim gates",
 * NOT 500 the whole inbox (which would also blind run-gate visibility). Same
 * defensive posture as db.ts's `tableExists(db,"artifacts")` guard.
 */
function tableExists(db: ReturnType<typeof getDb>, table: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as unknown[]).length > 0;
}

/**
 * Project both sources into one ordered list.
 *
 * Run gates: `runs.status` is the cheap rebuildable-index prefilter (P1 Q2);
 * the JOURNAL is the gate-payload source of truth. A run can carry an
 * `approval`/`clarify` event that was already resolved (its event stays in the
 * journal forever) — only gates with NO matching later `gate_resolved` are
 * live.
 *
 * Claim gates: the dreams-queue query is lifted VERBATIM from
 * app/(dashboard)/dreams/page.tsx (unscoped, by contract — see file header);
 * "pending" is the same JS filter the page applies; counts come from
 * getClaimsByRunGrouped (NOT a SQL join). A pending dream with 0 pending
 * claims (all decided, awaiting Finalize) is still surfaced — it is an
 * actionable gate (Finalize) reached via the deep-link.
 */
export function listPendingGates(profileId: string): UnifiedGate[] {
  const db = getDb();
  const gates: UnifiedGate[] = [];

  // --- run gates (profile-scoped) ---
  const runRows = db
    .prepare(
      `SELECT run_id, status FROM runs
        WHERE profile_id = ? AND status IN ('awaiting_approval','awaiting_clarify')
        ORDER BY created_at DESC
        LIMIT 100`,
    )
    .all(profileId) as RunGateRow[];

  for (const { run_id: runId } of runRows) {
    const events = readJournalAfter(runId, Number.NEGATIVE_INFINITY);
    const resolved = new Set<string>();
    for (const e of events) {
      if (e.kind === "gate_resolved") resolved.add(e.gateId);
    }
    // Last UNRESOLVED approval|clarify wins (the run may have cycled gates).
    let gateEv: (typeof events)[number] | undefined;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if ((e.kind === "approval" || e.kind === "clarify") && !resolved.has(e.gateId)) {
        gateEv = e;
        break;
      }
    }
    if (!gateEv || (gateEv.kind !== "approval" && gateEv.kind !== "clarify")) continue;

    gates.push({
      source: "run",
      kind: gateEv.kind,
      gateId: gateEv.gateId,
      runId,
      tool: gateEv.kind === "approval" ? gateEv.tool : undefined,
      args: gateEv.kind === "approval" ? gateEv.args : undefined,
      question: gateEv.kind === "clarify" ? gateEv.question : undefined,
      title: `Run ${runId.slice(0, 8)}`,
      createdAt: gateEv.ts,
    });
  }

  // --- claim gates (UNscoped — verbatim lift of the /dreams queue query) ---
  // Degrade to run-gates-only on ANY claim-side failure rather than 500 the
  // whole Inbox (which would also blind run-gate visibility — the worse
  // failure). Two non-prod cases this absorbs: (1) `pipeline_runs` absent
  // (tableExists fast-path); (2) the `scripts/migrate.ts` stub of
  // `pipeline_runs` lacks `created_at`/`result_summary` that the lifted
  // /dreams query selects (prod's slack_agent-owned table HAS them — see
  // migrate.ts comment; migrate.ts is NOT modified, NOTE-3a/out of P3 scope).
  // Same defensive posture as db.ts's tableExists guard + non-fatal reconcile.
  try {
    const dreamRows: Array<{ run_id: string; status: string; created_at: string }> = !tableExists(
      db,
      "pipeline_runs",
    )
      ? []
      : (db
          .prepare(
            `SELECT run_id, run_date, status, draft_dir, created_at, result_summary
               FROM pipeline_runs
              WHERE pipeline = 'dreams'
              ORDER BY created_at DESC
              LIMIT 20`,
          )
          .all() as Array<{ run_id: string; status: string; created_at: string }>);

    for (const r of dreamRows) {
      if (!PENDING_DREAM_STATUSES.has(r.status)) continue;
      const grouped = getClaimsByRunGrouped(r.run_id);
      gates.push({
        source: "claim",
        kind: "dream-review",
        gateId: r.run_id,
        runId: r.run_id,
        pendingCount: grouped.pending.length,
        totalCount: grouped.total,
        reviewHref: `/dreams/${r.run_id}`,
        title: `Dream ${r.run_id.slice(0, 8)}`,
        createdAt: toEpochMs(r.created_at),
      });
    }
  } catch (err) {
    console.warn(
      "[faro] gate-inbox: claim projection skipped (pipeline_runs unavailable/incompatible):",
      err instanceof Error ? err.message : String(err),
    );
  }

  gates.sort((a, b) => b.createdAt - a.createdAt);
  return gates;
}

/**
 * Dispatch a resolution by source. Run gates resolve INLINE via the existing,
 * UNCHANGED P1 `resolveGate` (one step: resume/cancel the SDK session). Claim
 * gates are NAVIGATIONAL only — the Inbox NEVER stamps `claim_decisions`
 * (preserves the two-phase Finalize+token, the Slack bulk-stamp authority, and
 * partner mode — P3 locked answers 1/4/5).
 *
 * Note: the run-gate HTTP path stays the existing /api/runs/[runId]/answer
 * route (locked answer 1, minimal blast radius). This function is the
 * library-level dispatcher contract (and the unit-tested resolution shape);
 * the unified panel POSTs run gates straight to that proven endpoint.
 */
export function resolveUnifiedGate(input: {
  gateId: string;
  runId: string;
  source: "run" | "claim";
  decision: string;
}): GateResult {
  if (input.source === "run") {
    const { resumed } = resolveGate({
      runId: input.runId,
      gateId: input.gateId,
      decision: input.decision,
    });
    if (!resumed && !isDeny(input.decision)) {
      return {
        accepted: false,
        status: "not-active",
        message: `Run ${input.runId} could not be resumed (no active session for gate ${input.gateId}).`,
      };
    }
    return { accepted: true, status: "accepted" };
  }

  return {
    accepted: false,
    status: "unsupported",
    message: "Claim review is two-phase — open the sharded review.",
  };
}
