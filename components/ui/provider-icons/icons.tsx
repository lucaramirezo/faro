/**
 * Phase 4 — Provider brand icons.
 *
 * Each icon is a 16x16 inline SVG with `currentColor` fills/strokes so the
 * parent's `color` token (set by <ProviderChip>) drives the visual. Keep
 * geometry minimal — these read at h-3 w-3 (12px) inside chip rows. Replace
 * with brand-true marks any time without changing the chip primitive.
 *
 * Plan called for one .svg per brand; we coalesced into a single .tsx file
 * to keep the registry one import deep. The runtime contract (typed registry
 * Provider -> ComponentType) is unchanged.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

const base = {
  viewBox: "0 0 16 16",
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function AnthropicIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5.2 12.5L8 3.5l2.8 9M6.2 9.6h3.6" />
    </svg>
  );
}

export function GeminiIcon(props: IconProps) {
  // 4-pointed sparkle
  return (
    <svg {...base} {...props}>
      <path d="M8 1.8v4M8 10.2v4M1.8 8h4M10.2 8h4" />
      <path d="M8 1.8c0 3.4 2.8 6.2 6.2 6.2-3.4 0-6.2 2.8-6.2 6.2 0-3.4-2.8-6.2-6.2-6.2 3.4 0 6.2-2.8 6.2-6.2z" />
    </svg>
  );
}

export function Gemini2Icon(props: IconProps) {
  // Same shape as Gemini, intentional — distinguished purely by --brand-gemini-2 tint.
  return <GeminiIcon {...props} />;
}

export function SupabaseIcon(props: IconProps) {
  // Lightning bolt
  return (
    <svg {...base} fill="currentColor" stroke="none" {...props}>
      <path d="M9 1.2L3 9.5h4l-1 5.3 6-8.3H8l1-5.3z" />
    </svg>
  );
}

export function OpenAIIcon(props: IconProps) {
  // 6-petal flower
  return (
    <svg {...base} {...props}>
      <circle cx="8" cy="8" r="3.4" />
      <path d="M8 4.6V1.4M11.4 6.3l2.8-1.6M11.4 9.7l2.8 1.6M8 11.4v3.2M4.6 9.7l-2.8 1.6M4.6 6.3L1.8 4.7" />
    </svg>
  );
}

export function OpenRouterIcon(props: IconProps) {
  // Branching arrow
  return (
    <svg {...base} {...props}>
      <path d="M2 8h12" />
      <path d="M9 4l5 4-5 4" />
      <path d="M6 2v3" />
      <path d="M6 11v3" />
    </svg>
  );
}

export function LinearIcon(props: IconProps) {
  // Three offset bars (Linear-ish)
  return (
    <svg {...base} {...props}>
      <path d="M2 5h12M3 8h10M5 11h8" />
    </svg>
  );
}

export function SlackIcon(props: IconProps) {
  // 4-segment hash
  return (
    <svg {...base} {...props}>
      <rect x="2" y="7" width="5" height="2" rx="1" />
      <rect x="9" y="7" width="5" height="2" rx="1" />
      <rect x="7" y="2" width="2" height="5" rx="1" />
      <rect x="7" y="9" width="2" height="5" rx="1" />
    </svg>
  );
}

export function GitHubIcon(props: IconProps) {
  // Octocat-ish circle with a stem
  return (
    <svg {...base} fill="currentColor" stroke="none" {...props}>
      <path d="M8 1.4a6.6 6.6 0 00-2.1 12.9c.33.06.45-.14.45-.32v-1.1c-1.83.4-2.22-.88-2.22-.88-.3-.76-.74-.97-.74-.97-.6-.41.05-.4.05-.4.66.05 1.01.68 1.01.68.59 1 1.54.71 1.92.54.06-.42.23-.71.42-.87-1.46-.17-3-.73-3-3.25 0-.72.26-1.31.68-1.77-.07-.17-.3-.84.06-1.76 0 0 .56-.18 1.83.68a6.4 6.4 0 013.32 0c1.27-.86 1.83-.68 1.83-.68.36.92.13 1.59.06 1.76.42.46.68 1.05.68 1.77 0 2.53-1.55 3.08-3.02 3.24.24.2.45.6.45 1.22v1.81c0 .18.12.39.45.32A6.6 6.6 0 008 1.4z" />
    </svg>
  );
}

export function VercelIcon(props: IconProps) {
  // Triangle
  return (
    <svg {...base} fill="currentColor" stroke="none" {...props}>
      <path d="M8 2L14.5 13.5h-13L8 2z" />
    </svg>
  );
}
