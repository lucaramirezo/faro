export type ScheduledSource = "cron" | "systemd";

export interface ScheduledTask {
  name: string;
  source: ScheduledSource;
  schedule: string;
  nextFire: string | null;
  lastFire: string | null;
  lastStatus: "ok" | "stale" | "unknown";
  command?: string;
  unit?: string;
}

export interface SessionLock {
  sessionId: string;
  pid: number;
  acquiredAt: number;
}

export interface ScheduledData {
  enabled: boolean;
  tasks: ScheduledTask[];
  sessionLock: SessionLock | null;
  errors: string[];
}
