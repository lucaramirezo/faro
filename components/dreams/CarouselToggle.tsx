"use client";

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
          {on ? "Carousel · on" : "Carousel · off"}
        </Button>
      </TooltipTrigger>
      <TooltipContent>One-card-at-a-time review (persists per host)</TooltipContent>
    </Tooltip>
  );
}
