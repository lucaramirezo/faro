import { spawn } from "node:child_process";
import { unstable_cache } from "next/cache";

export type UnitStatus = "active" | "inactive" | "failed" | "unknown";

export const FARO_TRACKED_UNITS = [
  "telegram_agent.service",
  "slack_agent.service",
  "heartbeat.timer",
  "reflection.timer",
  "dreams.timer",
  "faro.service",
] as const;

export type TrackedUnit = (typeof FARO_TRACKED_UNITS)[number];

function probeOnce(unit: string): Promise<UnitStatus> {
  return new Promise((resolveP) => {
    const proc = spawn("systemctl", ["--user", "is-active", unit], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    const timer = setTimeout(() => proc.kill("SIGTERM"), 3_000);
    proc.stdout.on("data", (b: Buffer) => {
      out += b.toString("utf8");
    });
    proc.on("close", () => {
      clearTimeout(timer);
      const raw = out.trim().toLowerCase();
      if (raw === "active") return resolveP("active");
      if (raw === "inactive" || raw === "deactivating") return resolveP("inactive");
      if (raw === "failed") return resolveP("failed");
      resolveP("unknown");
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolveP("unknown");
    });
  });
}

export const getUnitStatus = unstable_cache(
  async (unit: string): Promise<UnitStatus> => probeOnce(unit),
  ["faro:systemd:unit"],
  { revalidate: 30, tags: ["faro:systemd"] },
);

export async function getAllBotStatuses(): Promise<Record<TrackedUnit, UnitStatus>> {
  const entries = await Promise.all(
    FARO_TRACKED_UNITS.map(async (u) => [u, await getUnitStatus(u)] as const),
  );
  return Object.fromEntries(entries) as Record<TrackedUnit, UnitStatus>;
}
