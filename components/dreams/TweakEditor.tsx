"use client";

import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { acceptTweakAction, rerunClaimAction } from "@/app/actions/claims";
import { renderDiffAction } from "@/app/actions/diff";
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
import { detectSlash, findCommand, parseInvocation, type SlashCommand } from "@/lib/slash-commands";
import { encodeEnvelope, type TweakPatch } from "@/lib/tweak-patches";
import { SlashPopover } from "./SlashPopover";

/**
 * Per-session soft cap. Hits this and the Run button disables — user can
 * still close the sheet, navigate elsewhere, or reopen to reset. Phase 4.5
 * keeps the cap UI-only; the backend logs but does not block, matching the
 * `Cost discipline` note in the plan.
 */
const SESSION_COST_CAP_USD = 0.25;

export interface TweakEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runId: string;
  claim: ClaimRow | null;
}

export function TweakEditor({ open, onOpenChange, runId, claim }: TweakEditorProps) {
  const [instruction, setInstruction] = useState("");
  const [caretIndex, setCaretIndex] = useState(0);
  const [proposed, setProposed] = useState<string | null>(null);
  const [diffHtml, setDiffHtml] = useState<string | null>(null);
  const [diffPending, setDiffPending] = useState(false);
  const [pendingRerun, startRerun] = useTransition();
  const [pendingAccept, startAccept] = useTransition();
  const [sessionCostUsd, setSessionCostUsd] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset when (re)opened or claim changes.
  useEffect(() => {
    if (open) {
      setInstruction("");
      setCaretIndex(0);
      setProposed(null);
      setDiffHtml(null);
      setSessionCostUsd(0);
    }
  }, [open]);

  if (!claim) return null;

  const slash = detectSlash(instruction, caretIndex);
  const popoverOpen = slash !== null && proposed === null;
  const capped = sessionCostUsd >= SESSION_COST_CAP_USD;
  const isPending = pendingRerun || pendingAccept || diffPending;

  function onTextareaChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setInstruction(e.target.value);
    setCaretIndex(e.target.selectionStart ?? e.target.value.length);
  }

  function onTextareaSelect(e: ChangeEvent<HTMLTextAreaElement>) {
    setCaretIndex(e.target.selectionStart ?? e.target.value.length);
  }

  function onSlashSelect(cmd: SlashCommand) {
    if (!slash) return;
    const before = instruction.slice(0, slash.tokenStart);
    const after = instruction.slice(caretIndex);
    const newValue = `${before}${cmd.insert}${after}`;
    setInstruction(newValue);
    const newCaret = slash.tokenStart + cmd.insert.length;
    queueMicrotask(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(newCaret, newCaret);
      setCaretIndex(newCaret);
    });
  }

  function closeSlash() {
    // The popover detects on the value; clearing isn't strictly needed but
    // the user pressed Esc — collapse the textarea to plain text by jumping
    // the caret one char left so the regex no longer matches.
    if (!slash) return;
    setCaretIndex(slash.tokenStart);
  }

  async function runRerun() {
    if (!claim) return;
    if (capped) {
      toast.error(
        `Session cost cap reached ($${sessionCostUsd.toFixed(2)} ≥ $${SESSION_COST_CAP_USD.toFixed(2)}).`,
      );
      return;
    }
    const trimmed = instruction.trim();
    if (!trimmed) {
      toast.error("Type a hint or a /command first.");
      return;
    }

    // Routing: slash command (expand or intercept) vs free-form.
    const invocation = parseInvocation(trimmed);
    if (invocation && invocation.command.mode === "intercept") {
      applyInterceptCommand(invocation.command, invocation.args);
      return;
    }

    const finalPrompt = (() => {
      if (invocation?.command.mode === "expand" && invocation.command.expand) {
        return invocation.command.expand(claim.claim_text, invocation.args);
      }
      // Free-form: synthesize a /reroll-style prompt.
      const reroll = findCommand("reroll");
      if (reroll?.expand) return reroll.expand(claim.claim_text, trimmed);
      return trimmed;
    })();

    startRerun(async () => {
      try {
        const fd = new FormData();
        fd.set("runId", runId);
        fd.set("claimId", claim.claim_id);
        fd.set("instruction", finalPrompt);
        const result = await rerunClaimAction(fd);
        setProposed(result.proposed);
        setSessionCostUsd((c) => c + result.costUsd);
        setDiffPending(true);
        try {
          const html = await renderDiffAction(claim.claim_text, result.proposed);
          setDiffHtml(html);
        } catch (err) {
          // Diff failure is non-fatal — show the proposed text without diff
          // formatting rather than blocking the user.
          setDiffHtml(null);
          console.warn("renderDiffAction failed", err);
        } finally {
          setDiffPending(false);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Rerun failed");
      }
    });
  }

  function applyInterceptCommand(cmd: SlashCommand, args: string) {
    if (!claim) return;
    // The intercept variants are scaffolded with deterministic local edits;
    // none of them perform model calls. Once the proper actuation lands
    // (Phase 5 backlog), these will route through dedicated reducers.
    let proposedText: string;
    let note: string;
    switch (cmd.id) {
      case "shorten": {
        const sentences = claim.claim_text.split(/(?<=[.!?])\s+/);
        proposedText = sentences
          .slice(0, Math.max(1, sentences.length - 1))
          .join(" ")
          .trim();
        note = "Trimmed to first sentence(s) — review and rerun /reroll for a model-driven cut.";
        break;
      }
      case "split": {
        // Mark a split point at the first comma or mid-string fallback.
        const cut = claim.claim_text.indexOf(", ");
        proposedText =
          cut > 0
            ? `${claim.claim_text.slice(0, cut)}\n---SPLIT---\n${claim.claim_text.slice(cut + 2)}`
            : `${claim.claim_text}\n---SPLIT---\n`;
        note = "Marker inserted at first comma. Edit manually before Accept.";
        break;
      }
      case "merge": {
        if (!args) {
          toast.error("Specify a claim-id: /merge <claim-id>");
          return;
        }
        // merge-with patch — apply directly via acceptTweakAction without going
        // through the proposed-diff loop.
        commitPatch({ kind: "merge-with", otherClaimId: args });
        return;
      }
      case "retone": {
        const tone = args || "neutral";
        proposedText = `${claim.claim_text} [retone:${tone}]`;
        note = `Tagged with [retone:${tone}] — model rerun via /reroll recommended for an actual rewrite.`;
        break;
      }
      default:
        toast.error(`Intercept command /${cmd.id} not yet handled.`);
        return;
    }
    setProposed(proposedText);
    setDiffPending(true);
    renderDiffAction(claim.claim_text, proposedText)
      .then((html) => setDiffHtml(html))
      .catch(() => setDiffHtml(null))
      .finally(() => setDiffPending(false));
    toast.info(note);
  }

  function commitPatch(patch: TweakPatch) {
    if (!claim) return;
    startAccept(async () => {
      try {
        const fd = new FormData();
        fd.set("runId", runId);
        fd.set("claimId", claim.claim_id);
        fd.set("patchJson", encodeEnvelope(patch));
        await acceptTweakAction(fd);
        toast.success("Tweak applied");
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Accept failed");
      }
    });
  }

  function onAccept() {
    if (proposed == null) return;
    commitPatch({ kind: "set-text", text: proposed });
  }

  function onTweakAgain() {
    setProposed(null);
    setDiffHtml(null);
    queueMicrotask(() => textareaRef.current?.focus());
  }

  function onDiscard() {
    onOpenChange(false);
  }

  function onTextareaKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl + Enter — run rerun even without slash prefix.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (!isPending && !capped) runRerun();
      return;
    }
    // Cmd/Ctrl + . — insert a `/` at caret for slash-mode entry.
    if ((e.metaKey || e.ctrlKey) && e.key === ".") {
      e.preventDefault();
      const before = instruction.slice(0, caretIndex);
      const after = instruction.slice(caretIndex);
      if (before === "") {
        // Cleanly enter slash mode from an empty prefix.
        setInstruction(`/${after}`);
        queueMicrotask(() => {
          const el = textareaRef.current;
          if (!el) return;
          el.focus();
          el.setSelectionRange(1, 1);
          setCaretIndex(1);
        });
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[560px] sm:max-w-[620px] flex flex-col gap-3 px-4 py-5">
        <SheetHeader className="px-0">
          <SheetTitle>Tweak claim</SheetTitle>
          <SheetDescription>
            Type a hint or a /command. ⌘↩ runs; ⌘. enters slash mode; Esc closes.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Original</p>
          <p className="text-xs text-muted-foreground bg-muted/30 rounded-md px-2 py-1.5 leading-snug whitespace-pre-wrap">
            {claim.claim_text}
          </p>
        </div>

        <div className="relative space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Instruction</p>
          <Textarea
            ref={textareaRef}
            autoFocus
            rows={5}
            value={instruction}
            onChange={onTextareaChange}
            onSelect={onTextareaSelect}
            onKeyDown={onTextareaKeyDown}
            placeholder="/reroll be more skeptical — or a free-form hint"
            disabled={isPending}
          />
          {popoverOpen && slash && (
            <div className="absolute bottom-full left-0 right-0 mb-1 z-10">
              <SlashPopover
                query={slash.query}
                open={popoverOpen}
                onSelect={onSlashSelect}
                onClose={closeSlash}
              />
            </div>
          )}
        </div>

        {proposed !== null && (
          <div className="space-y-2 flex-1 overflow-auto">
            <div className="flex items-baseline justify-between">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Proposed (diff)
              </p>
              {diffPending && <span className="text-[10px] text-muted-foreground">rendering…</span>}
            </div>
            {diffHtml ? (
              <div
                className="text-xs rounded-md border border-border overflow-auto"
                // shiki-diff produces trusted server-rendered HTML; no user input
                // flows into the highlighter, so dangerouslySetInnerHTML is safe.
                // biome-ignore lint/security/noDangerouslySetInnerHtml: server-rendered diff HTML from lib/shiki-diff.ts
                dangerouslySetInnerHTML={{ __html: diffHtml }}
              />
            ) : (
              <p className="text-xs text-muted-foreground bg-muted/30 rounded-md px-2 py-1.5 leading-snug whitespace-pre-wrap">
                {proposed}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            Session cost: <span className="tabular-nums">${sessionCostUsd.toFixed(4)}</span>
            {capped && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">
                soft cap ${SESSION_COST_CAP_USD.toFixed(2)} reached
              </span>
            )}
          </span>
        </div>

        <SheetFooter className="px-0 flex-row gap-2">
          {proposed === null ? (
            <>
              <Button variant="ghost" onClick={onDiscard} disabled={isPending}>
                Cancel
              </Button>
              <Button onClick={runRerun} disabled={isPending || capped}>
                {pendingRerun ? "Running…" : "Run"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onDiscard} disabled={isPending}>
                Discard
              </Button>
              <Button variant="outline" onClick={onTweakAgain} disabled={isPending}>
                Tweak again
              </Button>
              <Button onClick={onAccept} disabled={isPending}>
                {pendingAccept ? "Saving…" : "Accept"}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
