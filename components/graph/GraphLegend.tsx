import { Card } from "@/components/ui/card";

interface GraphLegendProps {
  nodeCount: number;
  edgeCount: number;
  brokenLinks: number;
}

export function GraphLegend({ nodeCount, edgeCount, brokenLinks }: GraphLegendProps) {
  return (
    <Card className="p-4 space-y-3 text-xs">
      <div className="space-y-1">
        <p className="text-muted-foreground uppercase tracking-wider text-[10px]">Legend</p>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: "#D97757" }}
          />
          <span>memory/</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: "#10A37F" }}
          />
          <span>wiki/</span>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground uppercase tracking-wider text-[10px]">Node size</p>
        <p>Scales with inbound backlink count.</p>
      </div>
      <div className="space-y-1 border-t border-border/40 pt-2">
        <p className="tabular-nums">
          {nodeCount} nodes · {edgeCount} edges
        </p>
        {brokenLinks > 0 && (
          <p className="text-amber-400/80 tabular-nums">{brokenLinks} broken wikilinks omitted</p>
        )}
        <p className="text-muted-foreground">Click a node to open in Obsidian.</p>
      </div>
    </Card>
  );
}
