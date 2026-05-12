"use client";

import { motion } from "motion/react";
import { type ReactNode, useTransition } from "react";
import { toast } from "sonner";
import { decideClaimAction } from "@/app/actions/claims";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ClaimRow } from "@/lib/claims-types";

export interface ClientCardShellProps {
  claim: ClaimRow;
  runId: string;
  onOptimistic: (action: { kind: "decide" | "tweak"; claimId: string; status: string }) => void;
  onUndoRecord: (claimId: string, prevStatus: string) => void;
  onOpenTweak: (claim: ClaimRow) => void;
  children: ReactNode;
}

function statusTone(status: string): string {
  if (status === "approved") return "border-emerald-500/30 bg-emerald-500/5";
  if (status === "denied") return "border-rose-500/30 bg-rose-500/5";
  if (status === "tweaked") return "border-violet-500/30 bg-violet-500/5";
  return "border-border bg-background";
}

export function ClientCardShell({
  claim,
  runId,
  onOptimistic,
  onUndoRecord,
  onOpenTweak,
  children,
}: ClientCardShellProps) {
  const [pending, startTransition] = useTransition();
  const isDecided = claim.status !== "pending";

  const decide = (verb: "approved" | "denied") => {
    onUndoRecord(claim.claim_id, claim.status);
    onOptimistic({ kind: "decide", claimId: claim.claim_id, status: verb });
    const fd = new FormData();
    fd.set("runId", runId);
    fd.set("claimId", claim.claim_id);
    fd.set("verb", verb);
    startTransition(async () => {
      try {
        await decideClaimAction(fd);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Decision failed");
      }
    });
  };

  return (
    <motion.div
      layoutId={claim.claim_id}
      layout
      style={{ borderRadius: "0.75rem" }}
      transition={{ type: "spring", stiffness: 400, damping: 35 }}
      className={`border rounded-xl p-3 flex items-start gap-3 ${statusTone(claim.status)}`}
    >
      <div className="flex-1 min-w-0">{children}</div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {!isDecided && (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="default"
              onClick={() => decide("approved")}
              disabled={pending}
              title="Approve (A)"
            >
              A
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onOpenTweak(claim)}
              disabled={pending}
              title="Tweak (T)"
            >
              T
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => decide("denied")}
              disabled={pending}
              title="Deny (D)"
            >
              D
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" disabled={pending} title="More">
                  ⋯
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem disabled>Defer (soon)</DropdownMenuItem>
                <DropdownMenuItem disabled>Add note (soon)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        {isDecided && (
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {claim.status}
          </span>
        )}
      </div>
    </motion.div>
  );
}
