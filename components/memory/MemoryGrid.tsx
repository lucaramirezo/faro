"use client";

import Link from "next/link";
import { useState } from "react";
import { MemoryCard } from "@/components/memory/MemoryCard";
import { MemorySheet } from "@/components/memory/MemorySheet";
import { Button } from "@/components/ui/button";
import type { MemoryPage } from "@/lib/memory-types";

export interface MemoryGridProps {
  pages: MemoryPage[];
}

export function MemoryGrid({ pages }: MemoryGridProps) {
  const [selected, setSelected] = useState<MemoryPage | null>(null);
  return (
    <>
      <div className="flex items-center justify-end mb-2">
        <Link href="/graph">
          <Button variant="ghost" size="sm">
            Open in Graph →
          </Button>
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {pages.map((page) => (
          <MemoryCard
            key={page.slug}
            page={page}
            onOpen={(slug) => {
              const target = pages.find((p) => p.slug === slug);
              if (target) setSelected(target);
            }}
          />
        ))}
      </div>
      <MemorySheet page={selected} onClose={() => setSelected(null)} />
    </>
  );
}
