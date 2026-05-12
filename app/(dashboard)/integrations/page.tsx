import { IntegrationsList } from "@/components/integrations/IntegrationsList";
import { parseHeartbeat } from "@/lib/heartbeat";
import { getProfile } from "@/lib/profiles";
import { getAllBotStatuses } from "@/lib/systemd";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const profile = getProfile();
  const [heartbeat, unitStatuses] = await Promise.all([
    parseHeartbeat(profile),
    getAllBotStatuses(),
  ]);
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Systemd unit health for bots, timers, and services, plus the latest heartbeat report.
        </p>
      </header>
      <IntegrationsList heartbeat={heartbeat} unitStatuses={unitStatuses} />
    </main>
  );
}
