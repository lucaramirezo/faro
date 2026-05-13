import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type {
  ClaimCategory,
  ClaimRow,
  ClaimStatus,
  GroupedClaims,
  PromoteTo,
} from "@/lib/claims-types";
import { getDb } from "@/lib/db";
import { getProfile } from "@/lib/profiles";
import { assertUnder } from "@/lib/security";

export {
  CLAIM_CATEGORIES,
  type ClaimCategory,
  type ClaimRow,
  type ClaimStatus,
  type GroupedClaims,
  type PromoteTo,
} from "@/lib/claims-types";

interface ClaimsJsonEntry {
  claim_id: string;
  category: string;
  section_path: string;
  section_path_canonical: string;
  claim_text: string;
  evidence?: unknown[];
  promote_to?: PromoteTo;
}

const ClaimsFileSchema = z.object({
  schema_version: z.number(),
  run_id: z.string(),
  profile_id: z.string(),
  generated_at: z.string(),
  draft_dir: z.string(),
  memory_md_path: z.string().optional(),
  dream_report_md_path: z.string().optional(),
  claims: z.array(
    z.object({
      claim_id: z.string(),
      category: z.string(),
      section_path: z.string(),
      section_path_canonical: z.string(),
      claim_text: z.string(),
      evidence: z.array(z.unknown()).optional().default([]),
      // Added in schema_version 2 (Phase 3). Optional + nullable so older
      // schema_version 1 claims.json files still parse cleanly.
      promote_to: z.enum(["skill", "wiki"]).nullable().optional(),
    }),
  ),
});

interface PipelineRunRow {
  run_id: string;
  pipeline: string;
  run_date: string;
  status: string;
  draft_dir: string;
  decision_token: string | null;
}

function getDraftDir(runId: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT draft_dir FROM pipeline_runs WHERE run_id = ?").get(runId) as
    | { draft_dir: string }
    | undefined;
  return row?.draft_dir ?? null;
}

export async function readClaimsJsonForRun(runId: string): Promise<{
  entries: ClaimsJsonEntry[];
  draftDir: string;
}> {
  const profile = getProfile();
  const relDraft = getDraftDir(runId);
  if (!relDraft) {
    throw new Error(`No pipeline_runs row for run_id=${runId}`);
  }
  // pipeline_runs.draft_dir can be stored as absolute (e.g. dreams pipeline)
  // or relative (some legacy rows). Resolve safely either way.
  const draftPath = relDraft.startsWith("/") ? relDraft : join(profile.agent_root, relDraft);
  const resolved = assertUnder(draftPath, profile.agent_root);
  const claimsPath = join(resolved, "claims.json");
  const raw = await readFile(claimsPath, "utf8");
  const parsed = ClaimsFileSchema.parse(JSON.parse(raw));
  return { entries: parsed.claims, draftDir: relDraft };
}

export async function materializeClaimRows(runId: string): Promise<number> {
  const { entries } = await readClaimsJsonForRun(runId);
  const profile = getProfile();
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO claim_decisions (
       claim_id, run_id, profile_id, category, section_path,
       section_path_canonical, claim_text, evidence, status, promote_to
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  );
  const tx = db.transaction((rows: ClaimsJsonEntry[]) => {
    let n = 0;
    for (const c of rows) {
      const info = insert.run(
        c.claim_id,
        runId,
        profile.profile,
        c.category,
        c.section_path,
        c.section_path_canonical,
        c.claim_text,
        JSON.stringify(c.evidence ?? []),
        c.promote_to ?? null,
      );
      if (info.changes > 0) n++;
    }
    return n;
  });
  return tx(entries);
}

function rowToClaim(raw: Record<string, unknown>): ClaimRow {
  let evidence: ClaimRow["evidence"] = [];
  const rawEvidence = raw.evidence;
  if (typeof rawEvidence === "string" && rawEvidence) {
    try {
      const parsed = JSON.parse(rawEvidence);
      if (Array.isArray(parsed)) evidence = parsed as ClaimRow["evidence"];
    } catch {
      // swallow — bad evidence is a render concern, not a query failure
    }
  }
  return {
    claim_id: String(raw.claim_id),
    run_id: String(raw.run_id),
    profile_id: String(raw.profile_id ?? "lwiki"),
    category: String(raw.category) as ClaimCategory,
    section_path: String(raw.section_path),
    section_path_canonical: (raw.section_path_canonical as string | null) ?? null,
    claim_text: String(raw.claim_text),
    evidence,
    status: String(raw.status) as ClaimStatus,
    tweak_text: (raw.tweak_text as string | null) ?? null,
    reviewer_note: (raw.reviewer_note as string | null) ?? null,
    decided_at: (raw.decided_at as string | null) ?? null,
    decided_by: (raw.decided_by as string | null) ?? null,
    parent_claim_id: (raw.parent_claim_id as string | null) ?? null,
    superseded_at: (raw.superseded_at as string | null) ?? null,
    promote_to: (raw.promote_to as PromoteTo) ?? null,
  };
}

export function getClaimsByRunGrouped(runId: string): GroupedClaims {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM claim_decisions WHERE run_id = ? ORDER BY category, claim_id")
    .all(runId) as Record<string, unknown>[];
  const claims = rows.map(rowToClaim);
  const byCategory: Record<ClaimCategory, ClaimRow[]> = {
    merged: [],
    resolved: [],
    pruned: [],
    surfaced: [],
  };
  const pending: ClaimRow[] = [];
  const decided: ClaimRow[] = [];
  for (const c of claims) {
    if (byCategory[c.category]) byCategory[c.category].push(c);
    if (c.status === "pending") pending.push(c);
    else decided.push(c);
  }
  return { pending, decided, byCategory, total: claims.length };
}

export function setClaimStatus({
  runId,
  claimId,
  status,
  decidedBy,
  tweakText,
  reviewerNote,
  tweakPatchJson,
  parentClaimId,
}: {
  runId: string;
  claimId: string;
  status: ClaimStatus;
  decidedBy: string;
  tweakText?: string | null;
  reviewerNote?: string | null;
  /** Encoded TweakPatch envelope JSON (schema_version + patch). */
  tweakPatchJson?: string | null;
  /** Set on merge-with patches; mirrors parent_claim_id FK. */
  parentClaimId?: string | null;
}): void {
  const db = getDb();
  db.prepare(
    `UPDATE claim_decisions
        SET status = ?,
            decided_at = CURRENT_TIMESTAMP,
            decided_by = ?,
            tweak_text = COALESCE(?, tweak_text),
            reviewer_note = COALESCE(?, reviewer_note),
            tweak_patch = COALESCE(?, tweak_patch),
            parent_claim_id = COALESCE(?, parent_claim_id)
      WHERE run_id = ? AND claim_id = ?`,
  ).run(
    status,
    decidedBy,
    tweakText ?? null,
    reviewerNote ?? null,
    tweakPatchJson ?? null,
    parentClaimId ?? null,
    runId,
    claimId,
  );
}

/**
 * Fetch a single claim by composite key. Returns null if the row doesn't
 * exist (e.g. stale claim_id from a UI that races a deletion).
 */
export function getClaim(runId: string, claimId: string): ClaimRow | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM claim_decisions WHERE run_id = ? AND claim_id = ? LIMIT 1")
    .get(runId, claimId) as Record<string, unknown> | undefined;
  return row ? rowToClaim(row) : null;
}

export function bulkSetClaimStatusForCategory({
  runId,
  category,
  status,
  decidedBy,
  fromStatus = "pending",
}: {
  runId: string;
  category: ClaimCategory;
  status: ClaimStatus;
  decidedBy: string;
  fromStatus?: ClaimStatus;
}): number {
  const db = getDb();
  const info = db
    .prepare(
      `UPDATE claim_decisions
          SET status = ?, decided_at = CURRENT_TIMESTAMP, decided_by = ?
        WHERE run_id = ? AND category = ? AND status = ?`,
    )
    .run(status, decidedBy, runId, category, fromStatus);
  return info.changes;
}

export function getPipelineRun(runId: string): PipelineRunRow | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT run_id, pipeline, run_date, status, draft_dir, decision_token
         FROM pipeline_runs WHERE run_id = ?`,
    )
    .get(runId) as PipelineRunRow | undefined;
  return row ?? null;
}

export function setClaimPromoteTo({
  runId,
  claimId,
  promoteTo,
}: {
  runId: string;
  claimId: string;
  promoteTo: PromoteTo;
}): void {
  const db = getDb();
  db.prepare(
    `UPDATE claim_decisions
        SET promote_to = ?
      WHERE run_id = ? AND claim_id = ?`,
  ).run(promoteTo, runId, claimId);
}

export interface ApprovedSurfacedRow extends ClaimRow {
  run_date: string;
}

export function getApprovedSurfacedClaimsWithPromote(): {
  rows: ApprovedSurfacedRow[];
  bySource: Record<"skill" | "wiki", ApprovedSurfacedRow[]>;
} {
  const profile = getProfile();
  const db = getDb();
  const raws = db
    .prepare(
      `SELECT cd.*, pr.run_date AS run_date
         FROM claim_decisions cd
         LEFT JOIN pipeline_runs pr ON pr.run_id = cd.run_id
        WHERE cd.profile_id = ?
          AND cd.status = 'approved'
          AND cd.category = 'surfaced'
          AND cd.promote_to IS NOT NULL
        ORDER BY cd.decided_at DESC`,
    )
    .all(profile.profile) as Record<string, unknown>[];

  const rows: ApprovedSurfacedRow[] = raws.map((r) => ({
    ...rowToClaim(r),
    run_date: String(r.run_date ?? ""),
  }));

  const bySource: Record<"skill" | "wiki", ApprovedSurfacedRow[]> = {
    skill: [],
    wiki: [],
  };
  for (const row of rows) {
    if (row.promote_to === "skill") bySource.skill.push(row);
    else if (row.promote_to === "wiki") bySource.wiki.push(row);
  }
  return { rows, bySource };
}
