import { MemoryGrid } from "@/components/memory/MemoryGrid";
import { getMemoryPages } from "@/lib/memory";
import { getProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const profile = getProfile();
  const pages = await getMemoryPages({ agentRoot: profile.agent_root });
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Memory</h1>
        <p className="text-sm text-muted-foreground">
          The {pages.length} files under <code>{`${profile.agent_root}/memory/`}</code> with their
          inbound backlinks from <code>wiki/</code>. Click a card to inspect.
        </p>
      </header>
      {pages.length === 0 ? (
        <p className="text-sm text-muted-foreground">No memory files found.</p>
      ) : (
        <MemoryGrid pages={pages} />
      )}
    </main>
  );
}
