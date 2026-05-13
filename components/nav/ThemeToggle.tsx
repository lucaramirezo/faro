"use client";

import { ComputerIcon, Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type ResolvedTheme = "system" | "light" | "dark";

const NEXT_THEME: Record<ResolvedTheme, ResolvedTheme> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const ICON: Record<ResolvedTheme, typeof Sun01Icon> = {
  system: ComputerIcon,
  light: Sun01Icon,
  dark: Moon02Icon,
};

const LABEL: Record<ResolvedTheme, string> = {
  system: "System theme",
  light: "Light theme",
  dark: "Dark theme",
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <Skeleton className="size-8 rounded-md" />;
  }

  const current = (theme ?? "system") as ResolvedTheme;
  const next = NEXT_THEME[current] ?? "system";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={LABEL[current]}
          onClick={() => setTheme(next)}
        >
          <HugeiconsIcon icon={ICON[current]} size={16} strokeWidth={2} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{LABEL[current]} (click to cycle)</TooltipContent>
    </Tooltip>
  );
}
