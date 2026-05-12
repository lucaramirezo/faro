import { Card } from "@/components/ui/card";

export interface PendingAttentionProps {
  items: string[];
}

export function PendingAttention({ items }: PendingAttentionProps) {
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold mb-3">Pending your attention</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">All clear.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.slice(0, 80)} className="text-sm text-foreground/90 leading-snug">
              {it}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
