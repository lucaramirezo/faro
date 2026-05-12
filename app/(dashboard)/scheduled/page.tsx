import { ScheduledTable } from "@/components/scheduled/ScheduledTable";
import { SessionLockBadge } from "@/components/scheduled/SessionLockBadge";
import { Card } from "@/components/ui/card";
import { getProfile } from "@/lib/profiles";
import { getScheduledTasks } from "@/lib/scheduled";

export const dynamic = "force-dynamic";

export default async function ScheduledPage() {
  const profile = getProfile();
  const data = await getScheduledTasks({ agentRoot: profile.agent_root });

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Scheduled</h1>
        <p className="text-sm text-muted-foreground">
          Cron entries and systemd timers driving the autonomous pipeline.
        </p>
      </header>

      {!data.enabled ? (
        <Card className="p-6">
          <p className="text-sm">
            Scheduled tasks panel populates on pei deployment. Run faro on{" "}
            <code>pei.taild21074.ts.net:8443</code> to see cron + systemd schedules.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.sessionLock && <SessionLockBadge lock={data.sessionLock} />}
          {data.tasks.length === 0 ? (
            <Card className="p-6">
              <p className="text-sm text-muted-foreground">No scheduled tasks discovered.</p>
            </Card>
          ) : (
            <Card className="py-0 overflow-hidden">
              <ScheduledTable tasks={data.tasks} />
            </Card>
          )}
          {data.errors.length > 0 && (
            <Card className="p-4 space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Errors</p>
              {data.errors.map((e) => (
                <p key={e} className="text-xs text-destructive font-mono">
                  {e}
                </p>
              ))}
            </Card>
          )}
        </div>
      )}
    </main>
  );
}
