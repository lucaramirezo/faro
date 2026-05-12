"use client";

import { Layers01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface CarouselToggleProps {
  on: boolean;
  onChange: (on: boolean) => void;
}

export function CarouselToggle({ on, onChange }: CarouselToggleProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant={on ? "secondary" : "ghost"} size="sm" onClick={() => onChange(!on)}>
          <HugeiconsIcon icon={Layers01Icon} size={14} strokeWidth={2} />
          {on ? "Carousel · on" : "Carousel · off"}
        </Button>
      </TooltipTrigger>
      <TooltipContent>One-card-at-a-time review (persists per host)</TooltipContent>
    </Tooltip>
  );
}
