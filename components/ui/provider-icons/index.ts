import type { ComponentType, SVGProps } from "react";
import {
  AnthropicIcon,
  Gemini2Icon,
  GeminiIcon,
  GitHubIcon,
  LinearIcon,
  OpenAIIcon,
  OpenRouterIcon,
  SlackIcon,
  SupabaseIcon,
  VercelIcon,
} from "@/components/ui/provider-icons/icons";

export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

export const providerIcons = {
  anthropic: AnthropicIcon,
  gemini: GeminiIcon,
  "gemini-2": Gemini2Icon,
  supabase: SupabaseIcon,
  openai: OpenAIIcon,
  openrouter: OpenRouterIcon,
  linear: LinearIcon,
  slack: SlackIcon,
  github: GitHubIcon,
  vercel: VercelIcon,
} as const satisfies Record<string, IconComponent>;
