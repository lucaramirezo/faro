import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ClaimCategory, ClaimRow, ClaimStatus, GroupedClaims } from "@/lib/claims-types";
import { getDb } from "@/lib/db";
import { getProfile } from "@/lib/profiles";
import { assertUnder } from "@/lib/security";

export {
  CLAIM_CATEGORIES,
  type ClaimCategory,
  type ClaimRow,
  type ClaimStatus,
  type GroupedClaims,
} from "@/lib/claims-types";

interface ClaimsJsonEntry {
  claim_id: string;
  category: string;
  section_path: string;
  section_path_canonical: string;
  claim_text: string;
  evidence?: unknown[];
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
       section_path_canonical, claim_text, evidence, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
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
}: {
  runId: string;
  claimId: string;
  status: ClaimStatus;
  decidedBy: string;
  tweakText?: string | null;
  reviewerNote?: string | null;
}): void {
  const db = getDb();
  db.prepare(
    `UPDATE claim_decisions
        SET status = ?,
            decided_at = CURRENT_TIMESTAMP,
            decided_by = ?,
            tweak_text = COALESCE(?, tweak_text),
            reviewer_note = COALESCE(?, reviewer_note)
      WHERE run_id = ? AND claim_id = ?`,
  ).run(status, decidedBy, tweakText ?? null, reviewerNote ?? null, runId, claimId);
}

export function bulkSetClaimStatusForCategory({
  runId,
  category,
  status,
  decidedBy,
}: {
  runId: string;
  category: ClaimCategory;
  status: ClaimStatus;
  decidedBy: string;
}): number {
  const db = getDb();
  const info = db
    .prepare(
      `UPDATE claim_decisions
          SET status = ?, decided_at = CURRENT_TIMESTAMP, decided_by = ?
        WHERE run_id = ? AND category = ? AND status = 'pending'`,
    )
    .run(status, decidedBy, runId, category);
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
