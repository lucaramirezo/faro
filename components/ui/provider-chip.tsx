/**
 * EXCEPTION to the "no new code under components/ui" Biome carve-out
 * (AGENTS.md §8). Provider chips are a Badge-class primitive — they belong
 * with the other UI atoms. This is the ONE Phase 4 file that intentionally
 * lands here. See faro/.claude/skills/artifacts/DESIGN.md §7 (decisions
 * #7 + #9 cross-reference).
 *
 * Tint pattern: color-mix(in oklab, var(--brand-X) <pct>%, transparent).
 * vercel + github are near-black — `color-mix(... 12%, transparent)` is
 * invisible on dark cards, so those two get a contrast carve-out (transparent
 * background + ring-1 + lifted-lightness text). Discovered during dogfood-002
 * QA on 2026-05-13.
 */
import type { HTMLAttributes } from "react";
import { providerIcons } from "@/components/ui/provider-icons";
import { cn } from "@/lib/utils";

export const PROVIDERS = [
  "anthropic",
  "gemini",
  "gemini-2",
  "supabase",
  "openai",
  "openrouter",
  "linear",
  "slack",
  "github",
  "vercel",
] as const;

export type Provider = (typeof PROVIDERS)[number];

const NEAR_BLACK: ReadonlySet<Provider> = new Set(["vercel", "github"]);

const HUMAN_NAME: Record<Provider, string> = {
  anthropic: "Anthropic",
  gemini: "Gemini",
  "gemini-2": "Gemini 2",
  supabase: "Supabase",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  linear: "Linear",
  slack: "Slack",
  github: "GitHub",
  vercel: "Vercel",
};

export interface ProviderChipProps extends HTMLAttributes<HTMLSpanElement> {
  provider: Provider;
  /** Render only the icon (e.g. in tight gallery rows). */
  iconOnly?: boolean;
  /** Override the visible label text. Defaults to the humanized provider name. */
  label?: string;
}

export function ProviderChip({
  provider,
  iconOnly = false,
  label,
  className,
  style,
  ...rest
}: ProviderChipProps) {
  const Icon = providerIcons[provider];
  const visibleLabel = label ?? HUMAN_NAME[provider];
  const tokenVar = `var(--brand-${provider})`;
  const isCarveOut = NEAR_BLACK.has(provider);

  // Inline style: dynamic brand-tinted colors don't slot into Tailwind's
  // safelist cleanly across 10 brands × 3 surfaces. The class layer handles
  // shape (radii, padding, font), inline style handles brand color math.
  const inlineStyle: React.CSSProperties = isCarveOut
    ? {
        backgroundColor: "transparent",
        color: `color-mix(in oklab, ${tokenVar} 30%, var(--foreground))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${tokenVar} 50%, var(--border))`,
      }
    : {
        backgroundColor: `color-mix(in oklab, ${tokenVar} 12%, transparent)`,
        color: tokenVar,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${tokenVar} 25%, transparent)`,
      };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
        className,
      )}
      style={{ ...inlineStyle, ...style }}
      {...rest}
    >
      {Icon ? <Icon className="h-3 w-3 shrink-0" /> : null}
      {!iconOnly && <span>{visibleLabel}</span>}
    </span>
  );
}
