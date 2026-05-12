import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getPipelineRun } from "@/lib/claims";
import { getProfile } from "@/lib/profiles";
import { assertUnder } from "@/lib/security";
import { renderDiffHTML } from "@/lib/shiki-diff";

export const dynamic = "force-dynamic";

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  try {
    const run = getPipelineRun(runId);
    if (!run) {
      return new NextResponse(`run not found: ${runId}`, { status: 404 });
    }
    const profile = getProfile();
    const draftPath = run.draft_dir.startsWith("/")
      ? run.draft_dir
      : join(profile.agent_root, run.draft_dir);
    const draftDir = assertUnder(draftPath, profile.agent_root);
    const currentMemoryPath = join(profile.agent_root, "memory", "memory.md");
    const nextMemoryPath = join(draftDir, "memory.md.next");
    const baseMemoryPath = join(draftDir, "memory.md");
    const proposedPath = (await pathExists(nextMemoryPath)) ? nextMemoryPath : baseMemoryPath;
    if (!(await pathExists(proposedPath))) {
      return new NextResponse(`memory.md missing in ${run.draft_dir}`, {
        status: 404,
      });
    }
    const before = (await pathExists(currentMemoryPath))
      ? await readFile(currentMemoryPath, "utf8")
      : "";
    const after = await readFile(proposedPath, "utf8");
    const html = await renderDiffHTML(before, after);
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[faro] api/dreams/diff: ${msg}`);
    return new NextResponse(msg, { status: 500 });
  }
}
