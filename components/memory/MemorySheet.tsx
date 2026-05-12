"use client";

import { useState } from "react";
import { WikiPreviewSheet } from "@/components/memory/WikiPreviewSheet";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { MemoryPage } from "@/lib/memory-types";

export interface MemorySheetProps {
  page: MemoryPage | null;
  onClose: () => void;
}

export function MemorySheet({ page, onClose }: MemorySheetProps) {
  const [wikiSlug, setWikiSlug] = useState<string | null>(null);

  return (
    <>
      <Sheet open={page != null} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {page && (
            <>
              <SheetHeader>
                <SheetTitle>{page.title}</SheetTitle>
                <SheetDescription className="font-mono text-xs">{page.slug}.md</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6 space-y-4">
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed bg-muted/40 p-3 rounded-md">
                  {page.body.trim()}
                </pre>

                <section className="space-y-2">
                  <h4 className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
                    Backlinks ({page.inboundBacklinks.length})
                  </h4>
                  {page.inboundBacklinks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No wiki pages reference this memory yet.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {page.inboundBacklinks.map((b) => (
                        <li key={b.sourceSlug}>
                          <button
                            type="button"
                            onClick={() => setWikiSlug(b.sourceSlug)}
                            className="text-sm text-left text-foreground hover:underline underline-offset-4"
                          >
                            {b.title ?? b.sourceSlug}{" "}
                            <span className="text-xs text-muted-foreground font-mono">
                              ({b.sourceSlug})
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      <WikiPreviewSheet slug={wikiSlug} onClose={() => setWikiSlug(null)} />
    </>
  );
}
