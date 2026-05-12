import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export interface RecentDreamRow {
  run_id: string;
  run_date: string;
  status: string;
  draft_dir: string;
}

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "approved" || s === "rerun_ok") return "default";
  if (s === "pending" || s === "rerunning") return "secondary";
  if (s === "denied" || s === "rerun_failed") return "destructive";
  return "outline";
}

export function RecentDreams({ rows }: { rows: RecentDreamRow[] }) {
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold mb-3">Recent dreams</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No dream runs yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.run_id} className="flex items-center justify-between gap-2 text-sm">
              <Link
                href={`/dreams/${r.run_id}`}
                className="hover:underline tabular-nums text-foreground/90"
              >
                {r.run_date}
              </Link>
              <Badge variant={statusVariant(r.status)} className="text-xs">
                {r.status}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
