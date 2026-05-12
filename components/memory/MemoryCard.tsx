"use client";

import { Database01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { MemoryPage } from "@/lib/memory-types";

export interface MemoryCardProps {
  page: MemoryPage;
  onOpen: (slug: string) => void;
}

function fmFirstValue(fm: Record<string, unknown>): { key: string; value: string } | null {
  const order = ["role", "version", "updated", "last_run", "status", "type"];
  for (const k of order) {
    const v = fm[k];
    if (v == null) continue;
    return { key: k, value: typeof v === "string" ? v : JSON.stringify(v) };
  }
  const [key, value] = Object.entries(fm)[0] ?? [];
  if (key == null || value == null) return null;
  return { key, value: typeof value === "string" ? value : JSON.stringify(value) };
}

export function MemoryCard({ page, onOpen }: MemoryCardProps) {
  const fm = fmFirstValue(page.frontmatter);
  return (
    <Card
      className="p-4 space-y-3 cursor-pointer hover:ring-foreground/15 transition-shadow"
      onClick={() => onOpen(page.slug)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="mt-0.5 rounded-md bg-muted/40 p-1.5">
            <HugeiconsIcon
              icon={Database01Icon}
              size={16}
              strokeWidth={2}
              className="text-foreground/80"
            />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight truncate">{page.title}</h3>
            <p className="text-xs text-muted-foreground truncate">{page.slug}.md</p>
          </div>
        </div>
        {fm && (
          <Badge variant="outline" className="text-xs shrink-0">
            {fm.key}: {fm.value}
          </Badge>
        )}
      </div>
      <ul className="space-y-1 text-xs">
        <li className="flex items-center justify-between gap-2 text-foreground/85">
          <span className="text-muted-foreground">outbound links</span>
          <span className="tabular-nums">{page.outboundLinks.length}</span>
        </li>
        <li className="flex items-center justify-between gap-2 text-foreground/85">
          <span className="text-muted-foreground">inbound backlinks</span>
          <span className="tabular-nums">{page.inboundBacklinks.length}</span>
        </li>
      </ul>
    </Card>
  );
}
