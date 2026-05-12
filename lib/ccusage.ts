import { spawn } from "node:child_process";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import { env } from "@/lib/env";
import { getDailyFromJsonl } from "@/lib/jsonl";
import { getProfile, type Profile } from "@/lib/profiles";

/**
 * Thin wrapper around the ``ccusage`` CLI. Three exports:
 *   getActiveBlock(): the current 5-hour billing block (null if none active)
 *   getDaily(): rolling daily breakdown (matches ccusage's ``daily --json``)
 *   getWeekly(): weekly breakdown
 *
 * Each shells out via ``child_process.spawn`` — never compose command strings.
 * Resolution: ``FARO_CCUSAGE_PATH`` (default ``ccusage``); on ENOENT, falls back
 * to ``npx -y ccusage@latest``. If both fail, the daily path falls back to a
 * local ``lib/jsonl.ts`` parser; blocks/weekly return null/empty respectively.
 *
 * All calls are wrapped in ``unstable_cache`` with a 30s TTL — never invoke
 * from a Server Component render path. Route handlers and Server Actions only.
 *
 * Cost figures from ``ccusage`` (``costUSD`` / ``totalCost``) include the
 * v18.0.10+ 6× fast-mode multiplier already — trust the field, don't
 * back-compute from raw token counts.
 */

const BlockSchema = z.object({
  id: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  actualEndTime: z.string().nullable().optional(),
  isActive: z.boolean(),
  isGap: z.boolean().optional().default(false),
  entries: z.number().optional().default(0),
  tokenCounts: z
    .object({
      inputTokens: z.number().optional().default(0),
      outputTokens: z.number().optional().default(0),
      cacheCreationInputTokens: z.number().optional().default(0),
      cacheReadInputTokens: z.number().optional().default(0),
    })
    .optional(),
  totalTokens: z.number().optional().default(0),
  costUSD: z.number().optional().default(0),
  models: z.array(z.string()).optional().default([]),
  burnRate: z
    .object({
      tokensPerMinute: z.number().optional(),
      tokensPerMinuteForIndicator: z.number().optional(),
      costPerHour: z.number().optional(),
    })
    .nullable()
    .optional(),
  projection: z
    .object({
      totalTokens: z.number().optional(),
      totalCost: z.number().optional(),
      remainingMinutes: z.number().optional(),
    })
    .nullable()
    .optional(),
});
export type Block = z.infer<typeof BlockSchema>;

const BlocksResponseSchema = z.object({
  blocks: z.array(BlockSchema),
});

const DailyEntrySchema = z.object({
  date: z.string(),
  inputTokens: z.number().optional().default(0),
  outputTokens: z.number().optional().default(0),
  cacheCreationTokens: z.number().optional().default(0),
  cacheReadTokens: z.number().optional().default(0),
  totalTokens: z.number().optional().default(0),
  totalCost: z.number().optional().default(0),
  modelsUsed: z.array(z.string()).optional().default([]),
  modelBreakdowns: z
    .array(
      z.object({
        modelName: z.string(),
        inputTokens: z.number().optional().default(0),
        outputTokens: z.number().optional().default(0),
        cacheCreationTokens: z.number().optional().default(0),
        cacheReadTokens: z.number().optional().default(0),
        cost: z.number().optional().default(0),
      }),
    )
    .optional()
    .default([]),
});
export type DailyEntry = z.infer<typeof DailyEntrySchema>;

const DailyResponseSchema = z.object({ daily: z.array(DailyEntrySchema) });

const WeeklyEntrySchema = DailyEntrySchema.extend({
  week: z.string().optional(),
});
export type WeeklyEntry = z.infer<typeof WeeklyEntrySchema>;

const WeeklyResponseSchema = z.object({ weekly: z.array(WeeklyEntrySchema) });

type SpawnResult = { code: number; stdout: string; stderr: string };

function spawnJson(cmd: string, args: string[]): Promise<SpawnResult> {
  return new Promise((resolveP) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, HOME: process.env.HOME, ANTHROPIC_API_KEY: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 15_000);
    child.stdout.on("data", (b: Buffer) => {
      stdout += b.toString("utf8");
    });
    child.stderr.on("data", (b: Buffer) => {
      stderr += b.toString("utf8");
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveP({ code: code ?? 1, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolveP({ code: 127, stdout, stderr: err.message });
    });
  });
}

let _resolvedCmd: { cmd: string; args: string[] } | null = null;

async function resolveCcusage(): Promise<{ cmd: string; args: string[] } | null> {
  if (_resolvedCmd) return _resolvedCmd;
  const direct = await spawnJson(env.FARO_CCUSAGE_PATH, ["--version"]);
  if (direct.code === 0) {
    _resolvedCmd = { cmd: env.FARO_CCUSAGE_PATH, args: [] };
    return _resolvedCmd;
  }
  const npx = await spawnJson("npx", ["-y", "ccusage@latest", "--version"]);
  if (npx.code === 0) {
    _resolvedCmd = { cmd: "npx", args: ["-y", "ccusage@latest"] };
    return _resolvedCmd;
  }
  return null;
}

async function runCcusage(subcommand: string, extra: string[] = []): Promise<unknown | null> {
  const resolved = await resolveCcusage();
  if (!resolved) return null;
  const args = [...resolved.args, subcommand, "--json", "--offline", ...extra];
  const res = await spawnJson(resolved.cmd, args);
  if (res.code !== 0) {
    console.warn(`[faro] ccusage ${subcommand}: exit ${res.code}: ${res.stderr.trim()}`);
    return null;
  }
  try {
    return JSON.parse(res.stdout);
  } catch (err) {
    console.warn(
      `[faro] ccusage ${subcommand}: malformed JSON: ${err instanceof Error ? err.message : "unknown"}`,
    );
    return null;
  }
}

async function fetchActiveBlock(): Promise<Block | null> {
  const data = await runCcusage("blocks");
  if (!data) return null;
  const parsed = BlocksResponseSchema.safeParse(data);
  if (!parsed.success) {
    console.warn(`[faro] ccusage blocks: schema mismatch: ${parsed.error.message}`);
    return null;
  }
  return parsed.data.blocks.find((b) => b.isActive) ?? null;
}

async function fetchDaily(profile: Profile): Promise<DailyEntry[]> {
  const data = await runCcusage("daily");
  if (!data) {
    console.warn("[faro] ccusage daily: unavailable, falling back to jsonl parser");
    const fallback = await getDailyFromJsonl(profile);
    return fallback.daily;
  }
  const parsed = DailyResponseSchema.safeParse(data);
  if (!parsed.success) {
    console.warn(`[faro] ccusage daily: schema mismatch: ${parsed.error.message}`);
    return [];
  }
  return parsed.data.daily;
}

async function fetchWeekly(): Promise<WeeklyEntry[]> {
  const data = await runCcusage("weekly");
  if (!data) return [];
  const parsed = WeeklyResponseSchema.safeParse(data);
  if (!parsed.success) {
    console.warn(`[faro] ccusage weekly: schema mismatch: ${parsed.error.message}`);
    return [];
  }
  return parsed.data.weekly;
}

export const getActiveBlock = unstable_cache(
  async (): Promise<Block | null> => fetchActiveBlock(),
  ["faro:ccusage:block"],
  { revalidate: 30, tags: ["faro:ccusage"] },
);

export const getDaily = unstable_cache(
  async (): Promise<DailyEntry[]> => fetchDaily(getProfile()),
  ["faro:ccusage:daily"],
  { revalidate: 30, tags: ["faro:ccusage"] },
);

export const getWeekly = unstable_cache(
  async (): Promise<WeeklyEntry[]> => fetchWeekly(),
  ["faro:ccusage:weekly"],
  { revalidate: 30, tags: ["faro:ccusage"] },
);
