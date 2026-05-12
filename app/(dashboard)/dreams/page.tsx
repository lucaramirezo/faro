import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface DreamRunRow {
  run_id: string;
  run_date: string;
  status: string;
  draft_dir: string;
  created_at: string;
  result_summary: string | null;
}

const PENDING_STATUSES = new Set(["pending", "rerunning"]);
const DECIDED_STATUSES = new Set(["approved", "denied", "rerun_ok", "rerun_failed"]);

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "approved" || s === "rerun_ok") return "default";
  if (s === "pending" || s === "rerunning") return "secondary";
  if (s === "denied" || s === "rerun_failed") return "destructive";
  return "outline";
}

function DreamTable({ rows, empty }: { rows: DreamRunRow[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{empty}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[140px]">Run date</TableHead>
          <TableHead>Run ID</TableHead>
          <TableHead className="w-[120px]">Status</TableHead>
          <TableHead className="text-right">Summary</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.run_id}>
            <TableCell className="tabular-nums">{r.run_date}</TableCell>
            <TableCell>
              <Link
                href={`/dreams/${r.run_id}`}
                className="text-foreground hover:underline tabular-nums"
              >
                {r.run_id}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
            </TableCell>
            <TableCell className="text-right text-xs text-muted-foreground max-w-[280px] truncate">
              {r.result_summary ?? "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function DreamsQueuePage() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT run_id, run_date, status, draft_dir, created_at, result_summary
         FROM pipeline_runs
        WHERE pipeline = 'dreams'
        ORDER BY created_at DESC
        LIMIT 20`,
    )
    .all() as DreamRunRow[];
  const pending = rows.filter((r) => PENDING_STATUSES.has(r.status));
  const decided = rows.filter((r) => DECIDED_STATUSES.has(r.status));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dreams</h1>
        <p className="text-sm text-muted-foreground">
          Weekly memory candidates awaiting per-claim review.
        </p>
      </header>
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold">Pending review</h2>
        <DreamTable rows={pending} empty="No dreams pending review." />
      </Card>
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold">Recently decided</h2>
        <DreamTable rows={decided} empty="No recently decided dreams." />
      </Card>
    </div>
  );
}
