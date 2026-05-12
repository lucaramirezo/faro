import { copyFile, mkdir, rename, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { getDb } from "@/lib/db";
import { getProfile } from "@/lib/profiles";
import { assertUnder, gitCommitStateChange } from "@/lib/security";

const DREAMS_DRAFTS_REL = "drafts/dreams";
const EXPIRED_DRAFTS_REL = "drafts/expired";
const MEMORY_MD_REL = "memory/memory.md";

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Mirror of ``slack_agent/pipeline_approvals.py:_expired_target``:
 * ``drafts/dreams/2026-05-07`` + ``applied`` →
 * ``drafts/expired/2026-05-07-applied``; on collision, suffix ``-2``, ``-3``…
 */
export async function expiredTarget(draftDir: string, suffix: string): Promise<string> {
  const profile = getProfile();
  const base = `${basename(draftDir)}-${suffix}`;
  const expiredRoot = join(profile.agent_root, EXPIRED_DRAFTS_REL);
  await mkdir(expiredRoot, { recursive: true });
  let candidate = join(expiredRoot, base);
  let n = 2;
  while (await pathExists(candidate)) {
    candidate = join(expiredRoot, `${base}-${n}`);
    n++;
  }
  return candidate;
}

export interface ApplyResult {
  summary: string;
  archivedTo: string;
}

export async function applyDream({ draftDir }: { draftDir: string }): Promise<ApplyResult> {
  const profile = getProfile();
  const dreamsRoot = join(profile.agent_root, DREAMS_DRAFTS_REL);
  const resolved = assertUnder(draftDir, dreamsRoot);
  const nextSrc = join(resolved, "memory.md.next");
  const baseSrc = join(resolved, "memory.md");
  const src = (await pathExists(nextSrc)) ? nextSrc : baseSrc;
  if (!(await pathExists(src))) {
    throw new Error(`missing memory.md in ${resolved}`);
  }
  const memoryDest = join(profile.agent_root, MEMORY_MD_REL);
  await mkdir(dirname(memoryDest), { recursive: true });
  await copyFile(src, memoryDest);
  const archive = await expiredTarget(resolved, "applied");
  await rename(resolved, archive);
  await gitCommitStateChange({
    paths: [MEMORY_MD_REL, `${DREAMS_DRAFTS_REL}/`, `${EXPIRED_DRAFTS_REL}/`],
    message: `dreams: approved ${basename(resolved)} → ${MEMORY_MD_REL}`,
    cwd: profile.agent_root,
  });
  return {
    summary: `Applied to ${MEMORY_MD_REL}, archived to \`${archive.slice(profile.agent_root.length + 1)}\`.`,
    archivedTo: archive,
  };
}

export async function denyDream({ draftDir }: { draftDir: string }): Promise<ApplyResult> {
  const profile = getProfile();
  const dreamsRoot = join(profile.agent_root, DREAMS_DRAFTS_REL);
  const resolved = assertUnder(draftDir, dreamsRoot);
  const archive = await expiredTarget(resolved, "denied");
  await rename(resolved, archive);
  await gitCommitStateChange({
    paths: [`${DREAMS_DRAFTS_REL}/`, `${EXPIRED_DRAFTS_REL}/`],
    message: `dreams: denied ${basename(resolved)}`,
    cwd: profile.agent_root,
  });
  return {
    summary: `Denied; archived to \`${archive.slice(profile.agent_root.length + 1)}\`.`,
    archivedTo: archive,
  };
}

export interface FinalizeResult {
  summary: string;
  archivedTo: string;
  appliedCount: number;
  deferredCount: number;
}

interface PipelineRunRow {
  run_id: string;
  pipeline: string;
  draft_dir: string;
  decision_token: string | null;
  status: string;
}

/**
 * Finalize a dream by consuming the per-run decision token atomically, then
 * staging memory.md → memory/memory.md via :func:`applyDream`. Refuses to
 * proceed if no claim has a terminal status (approved/tweaked).
 */
export async function finalizeDream({
  runId,
  decisionToken,
  decidedBy,
}: {
  runId: string;
  decisionToken: string;
  decidedBy: string;
}): Promise<FinalizeResult> {
  const profile = getProfile();
  const db = getDb();

  const consume = db.transaction((token: string): PipelineRunRow => {
    const row = db
      .prepare(
        `SELECT run_id, pipeline, draft_dir, decision_token, status
           FROM pipeline_runs WHERE run_id = ?`,
      )
      .get(runId) as PipelineRunRow | undefined;
    if (!row) throw new Error(`No pipeline_runs row for run_id=${runId}`);
    if (row.pipeline !== "dreams") {
      throw new Error(`run_id=${runId} is not a dream (pipeline=${row.pipeline})`);
    }
    if (!row.decision_token) {
      throw new Error(`Decision token for run_id=${runId} already consumed`);
    }
    if (row.decision_token !== token) {
      throw new Error(`Decision token mismatch for run_id=${runId}`);
    }
    db.prepare(
      `UPDATE pipeline_runs SET decision_token = NULL WHERE run_id = ? AND decision_token = ?`,
    ).run(runId, token);
    return row;
  });

  const row = consume(decisionToken);

  const claimCounts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status IN ('approved', 'tweaked') THEN 1 ELSE 0 END) AS applied,
         SUM(CASE WHEN status IN ('pending', 'deferred') THEN 1 ELSE 0 END) AS deferred
       FROM claim_decisions WHERE run_id = ?`,
    )
    .get(runId) as { applied: number | null; deferred: number | null };
  const appliedCount = claimCounts.applied ?? 0;
  const deferredCount = claimCounts.deferred ?? 0;
  if (appliedCount === 0) {
    throw new Error(`Refusing to finalize run_id=${runId}: no claims in approved/tweaked state`);
  }

  const absDraftDir = row.draft_dir.startsWith("/")
    ? row.draft_dir
    : join(profile.agent_root, row.draft_dir);
  const result = await applyDream({ draftDir: absDraftDir });

  db.prepare(
    `UPDATE pipeline_runs
        SET status = 'approved',
            resolved_at = CURRENT_TIMESTAMP,
            result_summary = ?
      WHERE run_id = ?`,
  ).run(
    `Finalized by ${decidedBy}: applied ${appliedCount}, deferred ${deferredCount}. ${result.summary}`,
    runId,
  );

  return {
    summary: result.summary,
    archivedTo: result.archivedTo,
    appliedCount,
    deferredCount,
  };
}
