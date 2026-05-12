"use client";

import { ArrowDown01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import useEmblaCarousel from "embla-carousel-react";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export interface EmblaCarouselProps {
  children: ReactElement[];
}

export function EmblaCarousel({ children }: EmblaCarouselProps) {
  const [ref, api] = useEmblaCarousel({ loop: false, axis: "y" });
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setIndex(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  const prev = useCallback(() => api?.scrollPrev(), [api]);
  const next = useCallback(() => api?.scrollNext(), [api]);

  if (children.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">No claims to review.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden h-[360px]" ref={ref}>
        <div className="flex flex-col">
          {children.map((child, i) => (
            <div
              key={child.key ?? `slide-${i}`}
              className="min-h-[360px] flex items-stretch [&>*]:flex-1"
            >
              {child}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={prev} disabled={index === 0}>
          <HugeiconsIcon icon={ArrowUp01Icon} size={14} strokeWidth={2} />
          Prev
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {index + 1} / {children.length}
        </span>
        <Button size="sm" variant="ghost" onClick={next} disabled={index >= children.length - 1}>
          Next
          <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={2} />
        </Button>
      </div>
    </div>
  );
}
