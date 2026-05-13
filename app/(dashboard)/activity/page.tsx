import { ActivityBarList } from "@/components/activity/ActivityBarList";
import { ActivityCards } from "@/components/activity/ActivityCards";
import { getProfile } from "@/lib/profiles";
import { getActivityByDay } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const profile = getProfile();
  const entries = await getActivityByDay({ profile, days: 14 });
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Per-day session count, turn count, and focused-hours over the last 14 days. Focused-hours
          sum consecutive jsonl-record gaps under 15 minutes — anything ≥ 15 min is treated as an
          idle break.
        </p>
      </header>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No session data found in <code>~/.claude/projects/</code>. Use Claude Code on this profile
          for a day and refresh.
        </p>
      ) : (
        <>
          <ActivityCards entries={entries} />
          <ActivityBarList entries={entries} />
        </>
      )}
    </main>
  );
}
