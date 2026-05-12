"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { tweakClaimAction } from "@/app/actions/claims";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { ClaimRow } from "@/lib/claims-types";

export interface TweakEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runId: string;
  claim: ClaimRow | null;
}

export function TweakEditor({ open, onOpenChange, runId, claim }: TweakEditorProps) {
  const [value, setValue] = useState(claim?.tweak_text ?? claim?.claim_text ?? "");
  const [pending, startTransition] = useTransition();

  if (!claim) return null;

  const onSave = () => {
    if (!value.trim()) {
      toast.error("Tweak text cannot be empty.");
      return;
    }
    const fd = new FormData();
    fd.set("runId", runId);
    fd.set("claimId", claim.claim_id);
    fd.set("tweakText", value);
    startTransition(async () => {
      try {
        await tweakClaimAction(fd);
        toast.success("Saved tweak");
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Tweak failed");
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] sm:max-w-[480px] flex flex-col gap-3 px-4 py-5">
        <SheetHeader className="px-0">
          <SheetTitle>Tweak claim</SheetTitle>
          <SheetDescription>
            Edit the claim text in place. No model rerun — your text replaces the bullet.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-2 flex-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Original</p>
          <p className="text-xs text-muted-foreground bg-muted/30 rounded-md px-2 py-1.5 leading-snug">
            {claim.claim_text}
          </p>
          <p className="text-xs uppercase tracking-wide text-muted-foreground pt-2">Tweak</p>
          <Textarea
            autoFocus
            rows={8}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Replacement text..."
          />
        </div>
        <SheetFooter className="px-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={pending}>
            {pending ? "Saving..." : "Save tweak"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
