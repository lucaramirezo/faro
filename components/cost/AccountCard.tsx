import { UserAccountIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export interface AccountCardProps {
  email: string | null;
  displayName?: string | null;
  orgName?: string | null;
  rateLimitTier?: string | null;
  subscriptionStatus?: string | null;
  hasClaudeMax?: boolean;
  hasClaudePro?: boolean;
}

function planLabel(opts: Pick<AccountCardProps, "hasClaudeMax" | "hasClaudePro">): string {
  if (opts.hasClaudeMax) return "Max";
  if (opts.hasClaudePro) return "Pro";
  return "Free";
}

function prettyTier(tier: string | null | undefined): string | null {
  if (!tier) return null;
  // upstream emits e.g. "default_claude_max_20x" — surface as "Max · 20x"
  const m = tier.match(/claude_(max|pro)_?(\d+x)?/i);
  if (!m) return tier;
  const plan = m[1].slice(0, 1).toUpperCase() + m[1].slice(1).toLowerCase();
  return m[2] ? `${plan} · ${m[2]}` : plan;
}

export function AccountCard({
  email,
  displayName,
  orgName,
  rateLimitTier,
  subscriptionStatus,
  hasClaudeMax,
  hasClaudePro,
}: AccountCardProps) {
  if (!email) {
    return (
      <Card className="p-4 space-y-2">
        <h3 className="text-sm font-semibold tracking-tight">Claude account</h3>
        <p className="text-xs text-muted-foreground">
          No OAuth credentials detected at <code>~/.claude/.credentials.json</code>. Run{" "}
          <code>claude /login</code> on this host to attach a Max subscription.
        </p>
      </Card>
    );
  }
  const tier = prettyTier(rateLimitTier);
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-3 min-w-0">
        <span className="mt-0.5 rounded-md bg-muted/40 p-1.5">
          <HugeiconsIcon
            icon={UserAccountIcon}
            size={16}
            strokeWidth={2}
            className="text-foreground/80"
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold tracking-tight truncate">
              {displayName ?? email.split("@")[0]}
            </h3>
            <Badge variant="outline" className="text-xs shrink-0">
              {planLabel({ hasClaudeMax, hasClaudePro })}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono truncate">{email}</p>
        </div>
      </div>
      <ul className="space-y-1 text-xs">
        {orgName && (
          <li className="flex items-center justify-between gap-2 text-foreground/85">
            <span className="text-muted-foreground">organization</span>
            <span className="truncate text-right">{orgName}</span>
          </li>
        )}
        {tier && (
          <li className="flex items-center justify-between gap-2 text-foreground/85">
            <span className="text-muted-foreground">rate-limit tier</span>
            <span className="tabular-nums">{tier}</span>
          </li>
        )}
        {subscriptionStatus && (
          <li className="flex items-center justify-between gap-2 text-foreground/85">
            <span className="text-muted-foreground">subscription</span>
            <span>{subscriptionStatus}</span>
          </li>
        )}
      </ul>
    </Card>
  );
}
