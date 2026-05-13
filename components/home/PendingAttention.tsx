import { InboxIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Card } from "@/components/ui/card";

export interface PendingAttentionProps {
  items: string[];
}

export function PendingAttention({ items }: PendingAttentionProps) {
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold mb-3 inline-flex items-center gap-2">
        <HugeiconsIcon
          icon={InboxIcon}
          size={16}
          strokeWidth={2}
          className="text-muted-foreground"
        />
        Pending your attention
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">All clear.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={it.slice(0, 80)}
              className="text-sm text-foreground/90 leading-snug tabular-nums"
            >
              {it}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
