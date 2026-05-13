"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { finalizeDreamAction } from "@/app/actions/claims";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface FinalizeDialogProps {
  runId: string;
  decisionToken: string | null;
  appliedCount: number;
  deferredCount: number;
}

export function FinalizeDialog({
  runId,
  decisionToken,
  appliedCount,
  deferredCount,
}: FinalizeDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const disabled = appliedCount === 0 || !decisionToken;

  const onConfirm = () => {
    if (!decisionToken) {
      toast.error("Decision token already consumed.");
      return;
    }
    const fd = new FormData();
    fd.set("runId", runId);
    fd.set("decisionToken", decisionToken);
    startTransition(async () => {
      try {
        await finalizeDreamAction(fd);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Finalize failed");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled} variant="default">
          Finalize
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Finalize dream</DialogTitle>
          <DialogDescription className="tabular-nums">
            Apply {appliedCount} decision{appliedCount === 1 ? "" : "s"} to memory.md;{" "}
            {deferredCount} pending claim
            {deferredCount === 1 ? "" : "s"} will be deferred. Proceed?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? "Applying..." : "Apply & close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
