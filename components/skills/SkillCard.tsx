import { SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Skill, SkillUsage } from "@/lib/skills/types";

export interface SkillCardProps {
  skill: Skill;
  usage?: SkillUsage;
}

function relativeFromNow(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(months / 12);
  return `${years}y ago`;
}

export function SkillCard({ skill, usage }: SkillCardProps) {
  const runs = usage?.runs7d ?? 0;
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="mt-0.5 rounded-md bg-muted/40 p-1.5">
            <HugeiconsIcon
              icon={SparklesIcon}
              size={16}
              strokeWidth={2}
              className="text-foreground/80"
            />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight truncate">{skill.name}</h3>
            <p className="text-xs text-muted-foreground truncate">
              {skill.description || "No description"}
            </p>
            {skill.attribution && (
              <p className="mt-1 font-mono text-[10px] text-muted-foreground/80 truncate">
                src: {skill.attribution.repo} · {skill.attribution.license}
                {skill.attribution.commit ? ` · ${skill.attribution.commit}` : ""}
              </p>
            )}
          </div>
        </div>
        <Badge variant="outline" className="text-xs shrink-0">
          {skill.scope}
        </Badge>
      </div>
      <ul className="space-y-1 text-xs">
        <li className="flex items-center justify-between gap-2 text-foreground/85">
          <span className="text-muted-foreground">runs (7d)</span>
          <span className="tabular-nums">{runs}</span>
        </li>
        <li className="flex items-center justify-between gap-2 text-foreground/85">
          <span className="text-muted-foreground">last used</span>
          <span className="tabular-nums">{relativeFromNow(usage?.lastUsed ?? null)}</span>
        </li>
      </ul>
      {skill.scope === "imported" && (
        <Link
          href={`/runs?new=generation&skill=${encodeURIComponent(skill.name)}`}
          className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Generate
        </Link>
      )}
    </Card>
  );
}
