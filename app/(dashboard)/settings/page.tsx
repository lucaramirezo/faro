import { Card } from "@/components/ui/card";

export const dynamic = "force-static";

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Profile, owner allowlist, and integration toggles will live here.
        </p>
      </header>
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Coming in Phase 4 — profile switcher, owner allowlist, integration toggles.
        </p>
      </Card>
    </main>
  );
}
