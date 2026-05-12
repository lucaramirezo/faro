"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { bulkApproveCategoryAction } from "@/app/actions/claims";
import { Button } from "@/components/ui/button";
import type { ClaimCategory } from "@/lib/claims-types";

export interface BulkApproveBarProps {
  runId: string;
  category: ClaimCategory;
  pendingCount: number;
}

const CATEGORY_HEADER: Record<ClaimCategory, string> = {
  merged: "MERGED",
  resolved: "RESOLVED",
  pruned: "PRUNED",
  surfaced: "SURFACED",
};

export function BulkApproveBar({ runId, category, pendingCount }: BulkApproveBarProps) {
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    const fd = new FormData();
    fd.set("runId", runId);
    fd.set("category", category);
    fd.set("verb", "approved");
    startTransition(async () => {
      try {
        const n = await bulkApproveCategoryAction(fd);
        toast.success(`Approved ${n} ${category} claim${n === 1 ? "" : "s"}`, {
          duration: 10_000,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bulk approve failed");
      }
    });
  };

  return (
    <div className="flex items-center justify-between gap-2 pt-2 pb-1">
      <h3 className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
        {CATEGORY_HEADER[category]}
      </h3>
      {pendingCount > 0 && (
        <Button size="sm" variant="ghost" onClick={onClick} disabled={pending}>
          {pending ? "Approving..." : `Approve all ${pendingCount}`}
        </Button>
      )}
    </div>
  );
}
