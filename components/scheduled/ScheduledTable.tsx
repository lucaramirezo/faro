import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ScheduledTask } from "@/lib/scheduled-types";

export interface ScheduledTableProps {
  tasks: ScheduledTask[];
}

function relativeFromIso(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  const sec = Math.round(abs / 1000);
  let value: string;
  if (sec < 60) value = `${sec}s`;
  else if (sec < 3600) value = `${Math.round(sec / 60)}m`;
  else if (sec < 86400) value = `${Math.round(sec / 3600)}h`;
  else value = `${Math.round(sec / 86400)}d`;
  return diff >= 0 ? `in ${value}` : `${value} ago`;
}

function statusBadge(status: ScheduledTask["lastStatus"]) {
  const tone =
    status === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : status === "stale"
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";
  return (
    <Badge variant="outline" className={`text-xs ${tone}`}>
      {status}
    </Badge>
  );
}

export function ScheduledTable({ tasks }: ScheduledTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Schedule</TableHead>
          <TableHead>Next fire</TableHead>
          <TableHead>Last fire</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow key={`${task.source}-${task.name}-${task.schedule}`}>
            <TableCell className="font-medium">{task.name}</TableCell>
            <TableCell className="text-xs text-muted-foreground uppercase tracking-wider">
              {task.source}
            </TableCell>
            <TableCell className="font-mono text-xs">{task.schedule}</TableCell>
            <TableCell className="tabular-nums">
              {task.nextFire ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>{relativeFromIso(task.nextFire)}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <span className="font-mono text-xs">{task.nextFire}</span>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="tabular-nums">
              {task.lastFire ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>{relativeFromIso(task.lastFire)}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <span className="font-mono text-xs">{task.lastFire}</span>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>{statusBadge(task.lastStatus)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
