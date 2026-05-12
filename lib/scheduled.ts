import "server-only";

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parseExpression } from "cron-parser";
import type { ScheduledData, ScheduledTask, SessionLock } from "@/lib/scheduled-types";

const execFileAsync = promisify(execFile);

function isOnPei(agentRoot: string): boolean {
  if (agentRoot === "/home/luca/lwiki") return true;
  try {
    return /^pei/i.test(os.hostname());
  } catch {
    return false;
  }
}

interface SystemdTimerJson {
  next?: number; // microseconds since epoch
  last?: number;
  unit?: string;
  activates?: string;
  passed?: string;
  left?: string;
}

async function readCronTasks(): Promise<{ tasks: ScheduledTask[]; errors: string[] }> {
  const errors: string[] = [];
  let raw: string;
  try {
    const res = await execFileAsync("crontab", ["-l"], { timeout: 3_000 });
    raw = res.stdout;
  } catch (err) {
    const errno = (err as { code?: number | string }).code;
    if (errno === 1 || errno === "ENOENT") {
      return { tasks: [], errors: [] };
    }
    errors.push(`crontab -l failed: ${(err as Error).message}`);
    return { tasks: [], errors };
  }

  const tasks: ScheduledTask[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 6) continue;
    const cronExpr = parts.slice(0, 5).join(" ");
    const command = parts.slice(5).join(" ");
    let nextFire: string | null = null;
    try {
      nextFire = parseExpression(cronExpr, { tz: "Europe/Madrid" }).next().toISOString();
    } catch (err) {
      errors.push(`cron parse failed for "${cronExpr}": ${(err as Error).message}`);
    }
    const name = inferCronName(command);
    tasks.push({
      name,
      source: "cron",
      schedule: cronExpr,
      nextFire,
      lastFire: null,
      lastStatus: "unknown",
      command,
    });
  }
  return { tasks, errors };
}

function inferCronName(command: string): string {
  const lower = command.toLowerCase();
  for (const k of ["heartbeat", "reflection", "dreams", "lwiki", "morning"]) {
    if (lower.includes(k)) return k;
  }
  // fallback: last path segment of the first token
  const first = command.split(/\s+/)[0] ?? "";
  return path.basename(first) || "cron-task";
}

async function readSystemdTimers(): Promise<{ tasks: ScheduledTask[]; errors: string[] }> {
  const errors: string[] = [];
  let raw: string;
  try {
    const res = await execFileAsync("systemctl", ["list-timers", "--all", "--output=json"], {
      timeout: 3_000,
    });
    raw = res.stdout;
  } catch (err) {
    errors.push(`systemctl list-timers failed: ${(err as Error).message}`);
    return { tasks: [], errors };
  }
  let parsed: SystemdTimerJson[];
  try {
    parsed = JSON.parse(raw) as SystemdTimerJson[];
  } catch (err) {
    errors.push(`systemctl JSON parse failed: ${(err as Error).message}`);
    return { tasks: [], errors };
  }
  const ALLOW = /^(lwiki-|faro|heartbeat|reflection|dreams)/i;
  const tasks: ScheduledTask[] = [];
  for (const t of parsed) {
    const unit = t.unit ?? "";
    if (!ALLOW.test(unit)) continue;
    const nextFire =
      typeof t.next === "number" && t.next > 0 ? new Date(t.next / 1000).toISOString() : null;
    const lastFire =
      typeof t.last === "number" && t.last > 0 ? new Date(t.last / 1000).toISOString() : null;
    tasks.push({
      name: unit.replace(/\.timer$/, ""),
      source: "systemd",
      schedule: t.activates ?? unit,
      nextFire,
      lastFire,
      lastStatus: lastFire ? "ok" : "unknown",
      unit,
    });
  }
  return { tasks, errors };
}

async function readSessionLock(agentRoot: string): Promise<SessionLock | null> {
  const lockPath = path.join(agentRoot, ".claude", "scheduled_tasks.lock");
  try {
    const raw = await fs.readFile(lockPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<SessionLock>;
    if (
      typeof parsed.sessionId !== "string" ||
      typeof parsed.pid !== "number" ||
      typeof parsed.acquiredAt !== "number"
    ) {
      return null;
    }
    return {
      sessionId: parsed.sessionId,
      pid: parsed.pid,
      acquiredAt: parsed.acquiredAt,
    };
  } catch {
    return null;
  }
}

async function annotateLastFire(
  agentRoot: string,
  tasks: ScheduledTask[],
): Promise<ScheduledTask[]> {
  return Promise.all(
    tasks.map(async (task) => {
      if (task.lastFire) return task;
      if (task.source !== "cron") return task;
      const integrationDir = path.join(agentRoot, task.name, "runs");
      try {
        const entries = await fs.readdir(integrationDir);
        const logs = entries.filter((e) => e.endsWith(".log") || e.endsWith(".json"));
        if (logs.length === 0) return task;
        const stats = await Promise.all(
          logs.map(async (f) => ({
            f,
            mtime: (await fs.stat(path.join(integrationDir, f))).mtimeMs,
          })),
        );
        stats.sort((a, b) => b.mtime - a.mtime);
        const newest = stats[0];
        if (!newest) return task;
        return {
          ...task,
          lastFire: new Date(newest.mtime).toISOString(),
          lastStatus: "ok",
        };
      } catch {
        return task;
      }
    }),
  );
}

export interface GetScheduledTasksOptions {
  agentRoot: string;
  forceEnabled?: boolean; // test hook
}

export async function getScheduledTasks(opts: GetScheduledTasksOptions): Promise<ScheduledData> {
  const enabled = opts.forceEnabled ?? isOnPei(opts.agentRoot);
  if (!enabled) {
    return { enabled: false, tasks: [], sessionLock: null, errors: [] };
  }
  const errors: string[] = [];
  const [cron, systemd, lock] = await Promise.all([
    readCronTasks(),
    readSystemdTimers(),
    readSessionLock(opts.agentRoot),
  ]);
  errors.push(...cron.errors, ...systemd.errors);
  const annotated = await annotateLastFire(opts.agentRoot, cron.tasks);
  const tasks = [...annotated, ...systemd.tasks].sort((a, b) => {
    const aT = a.nextFire ?? "";
    const bT = b.nextFire ?? "";
    return aT.localeCompare(bT);
  });
  return { enabled: true, tasks, sessionLock: lock, errors };
}
