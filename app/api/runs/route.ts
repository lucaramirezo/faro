import { getDb } from "@/lib/db";
import { assembleGenerationPrompt, GENERATION_SYSTEM_PROMPT } from "@/lib/generation";
import { getProfile } from "@/lib/profiles";
import { createRun } from "@/lib/run-engine";
import { loadSkillBody, scanSkills } from "@/lib/skills/parser";

/**
 * /api/runs — P1 Control Station run launcher + list.
 *
 * POST { mode, skillName?, content?, prompt? } → { runId } (201). The engine
 * journals in the background; the client tails /api/runs/[runId]/stream.
 * GET → recent runs (RSC list in Task 13 also reads `runs` directly).
 *
 * Auth: Tailscale-User-Login at the proxy (same posture as /api/chat — no
 * extra check; loopback-only on the tailnet). No `import "server-only"` in a
 * route; no middleware (Next 16 middleware→proxy rename is pending — do not
 * add one).
 */

export const dynamic = "force-dynamic";

interface RunRequestBody {
  mode?: unknown;
  skillName?: unknown;
  content?: unknown;
  prompt?: unknown;
}

export async function POST(req: Request): Promise<Response> {
  let parsed: RunRequestBody;
  try {
    parsed = (await req.json()) as RunRequestBody;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const mode = parsed.mode;
  if (mode !== "agent" && mode !== "generation") {
    return new Response('mode must be "agent" or "generation"', { status: 400 });
  }

  if (mode === "generation") {
    const skillName = parsed.skillName;
    const content = parsed.content;
    if (typeof skillName !== "string" || skillName.length === 0) {
      return new Response("skillName required for generation", { status: 400 });
    }
    if (typeof content !== "string" || content.length === 0) {
      return new Response("content required for generation", { status: 400 });
    }
    const skills = await scanSkills({ agentRoot: getProfile().agent_root });
    // Single-user override of P1 Q4 (imported-only): accept project scope too
    // (loadSkillBody/scanSkills are scope-agnostic). 2026-05-18.
    const skill = skills.find(
      (s) => s.name === skillName && (s.scope === "imported" || s.scope === "project"),
    );
    if (!skill) {
      return new Response(`generatable skill not found: ${skillName}`, { status: 404 });
    }
    let skillBody: string;
    try {
      skillBody = await loadSkillBody(skill.path);
    } catch (err) {
      return new Response(
        `failed to load skill body: ${err instanceof Error ? err.message : String(err)}`,
        { status: 500 },
      );
    }
    const promptText = assembleGenerationPrompt({
      skillBody,
      content,
      format: "text",
    });
    const { runId } = createRun({
      mode: "generation",
      prompt: promptText,
      systemPrompt: GENERATION_SYSTEM_PROMPT,
      skillName,
    });
    return Response.json({ runId }, { status: 201 });
  }

  // mode === "agent"
  const prompt = parsed.prompt;
  if (typeof prompt !== "string" || prompt.length === 0) {
    return new Response("prompt required for agent runs", { status: 400 });
  }
  const { runId } = createRun({ mode: "agent", prompt });
  return Response.json({ runId }, { status: 201 });
}

interface RunRow {
  run_id: string;
  profile_id: string;
  status: string;
  skill_name: string | null;
  created_at: string;
  ended_at: string | null;
  cost_usd: number | null;
  last_seq: number;
}

export function GET(): Response {
  const rows = getDb()
    .prepare(
      `SELECT run_id, profile_id, status, skill_name, created_at, ended_at, cost_usd, last_seq
         FROM runs WHERE profile_id = ? ORDER BY created_at DESC LIMIT 100`,
    )
    .all(getProfile().profile) as RunRow[];
  return Response.json({ runs: rows });
}
