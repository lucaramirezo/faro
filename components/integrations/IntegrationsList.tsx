import {
  IntegrationRow,
  type IntegrationStatusDot,
} from "@/components/integrations/IntegrationRow";
import { Card } from "@/components/ui/card";
import type { HeartbeatSummary } from "@/lib/heartbeat";
import type { TrackedUnit, UnitStatus } from "@/lib/systemd";

function unitDot(status: UnitStatus): IntegrationStatusDot {
  if (status === "active") return "green";
  if (status === "failed") return "red";
  if (status === "inactive") return "amber";
  return "neutral";
}

function heartbeatDot(status: HeartbeatSummary["status"]): IntegrationStatusDot {
  if (status === "ok") return "green";
  if (status === "warn") return "amber";
  if (status === "error") return "red";
  return "neutral";
}

function botDot(ok: boolean): IntegrationStatusDot {
  return ok ? "green" : "amber";
}

const UNIT_DISPLAY: Record<TrackedUnit, { name: string; group: "bots" | "timers" | "services" }> = {
  "telegram_agent.service": { name: "telegram_agent", group: "bots" },
  "slack_agent.service": { name: "slack_agent", group: "bots" },
  "heartbeat.timer": { name: "heartbeat", group: "timers" },
  "reflection.timer": { name: "reflection", group: "timers" },
  "dreams.timer": { name: "dreams", group: "timers" },
  "faro.service": { name: "faro", group: "services" },
};

export interface IntegrationsListProps {
  heartbeat: HeartbeatSummary;
  unitStatuses: Record<TrackedUnit, UnitStatus>;
}

export function IntegrationsList({ heartbeat, unitStatuses }: IntegrationsListProps) {
  const bots: Array<[TrackedUnit, UnitStatus]> = [];
  const timers: Array<[TrackedUnit, UnitStatus]> = [];
  const services: Array<[TrackedUnit, UnitStatus]> = [];
  for (const [unit, status] of Object.entries(unitStatuses) as Array<[TrackedUnit, UnitStatus]>) {
    const meta = UNIT_DISPLAY[unit];
    if (!meta) continue;
    if (meta.group === "bots") bots.push([unit, status]);
    else if (meta.group === "timers") timers.push([unit, status]);
    else services.push([unit, status]);
  }

  return (
    <div className="space-y-6">
      <Section title="Bots">
        <Card className="py-0 overflow-hidden">
          {bots.map(([unit, status]) => (
            <IntegrationRow
              key={unit}
              name={UNIT_DISPLAY[unit].name}
              status={unitDot(status)}
              statusLabel={status}
            />
          ))}
        </Card>
      </Section>

      <Section title="Services">
        <Card className="py-0 overflow-hidden">
          {services.map(([unit, status]) => (
            <IntegrationRow
              key={unit}
              name={UNIT_DISPLAY[unit].name}
              status={unitDot(status)}
              statusLabel={status}
            />
          ))}
        </Card>
      </Section>

      <Section title="Timers (heartbeat / reflection / dreams)">
        <Card className="py-0 overflow-hidden">
          {timers.map(([unit, status]) => (
            <IntegrationRow
              key={unit}
              name={UNIT_DISPLAY[unit].name}
              status={unitDot(status)}
              statusLabel={status}
            />
          ))}
        </Card>
      </Section>

      <Section title="Heartbeat report">
        <Card className="py-0 overflow-hidden">
          <IntegrationRow
            name="heartbeat.md"
            status={heartbeatDot(heartbeat.status)}
            statusLabel={heartbeat.status}
            lastRun={heartbeat.lastRun ?? undefined}
            nextScheduled={heartbeat.nextScheduled ?? undefined}
            meta={[
              { label: "pending attention", value: String(heartbeat.pendingAttention.length) },
              { label: "errors", value: String(heartbeat.errors.length) },
            ]}
            errors={heartbeat.errors}
          />
          {heartbeat.botServices.map((bot) => (
            <IntegrationRow
              key={bot.name}
              name={bot.name}
              status={botDot(bot.ok)}
              statusLabel={bot.ok ? "ok" : "attention"}
              meta={bot.note ? [{ label: "note", value: bot.note }] : []}
            />
          ))}
        </Card>
      </Section>

      {heartbeat.pendingAttention.length > 0 && (
        <Section title="Pending your attention">
          <Card className="p-4">
            <ul className="space-y-1 text-sm">
              {heartbeat.pendingAttention.map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm uppercase tracking-wider font-medium text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}
