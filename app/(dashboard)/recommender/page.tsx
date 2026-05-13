import Link from "next/link";
import { RecCard } from "@/components/recommender/RecCard";
import { RecFilterTabs } from "@/components/recommender/RecFilterTabs";
import { Button } from "@/components/ui/button";
import { getRecommenderCandidates } from "@/lib/recommender";

export const dynamic = "force-dynamic";

type SourceFilter = "all" | "skill" | "wiki";

function asFilter(raw: string | string[] | undefined): SourceFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "skill" || v === "wiki" ? v : "all";
}

interface PageProps {
  searchParams: Promise<{ source?: string }>;
}

export default async function RecommenderPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filter = asFilter(params.source);
  const { skills, wikiCandidates, total } = await getRecommenderCandidates();

  const visible =
    filter === "skill"
      ? skills
      : filter === "wiki"
        ? wikiCandidates
        : [...skills, ...wikiCandidates];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Recommender</h1>
        <p className="text-sm text-muted-foreground">
          Surfaced from dreams. Approved candidates tagged <code>promote_to</code>, ready to install
          as skills or promote to wiki pages.
        </p>
      </header>

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            No promoted candidates yet. Approve <span className="font-mono">Surfaced</span> claims
            in dreams to populate this list.
          </p>
          <Link href="/dreams">
            <Button variant="default" size="sm">
              Open dreams →
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <RecFilterTabs
            active={filter}
            total={total}
            skillCount={skills.length}
            wikiCount={wikiCandidates.length}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {visible.map((c) => (
              <RecCard key={`${c.run_id}-${c.claim_id}`} candidate={c} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
