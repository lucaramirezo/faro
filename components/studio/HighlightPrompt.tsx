"use client";

import { ArrowUpRightIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Artifact } from "@/lib/artifacts-types";

interface HighlightPromptProps {
  artifact: Artifact;
  /** The highlighted text from the iframe selection (from HighlightBridge). */
  text: string;
  /** Best-effort CSS-path selector for the selection node. */
  selector: string;
  /** Controlled value of the "what I want" textarea. */
  value: string;
  onChange: (next: string) => void;
  /** Optional submit hook; defaults to the built-in clipboard write. */
  onSubmit?: (prompt: string) => void;
}

/**
 * Highlight-to-prompt composer. Receives a text snippet (from HighlightBridge
 * / iframe selection) plus a freeform note; assembles a Claude-ready prompt
 * and writes it to the clipboard on submit.
 */
export function HighlightPrompt({
  artifact,
  text,
  selector,
  value,
  onChange,
  onSubmit,
}: HighlightPromptProps) {
  const label = artifact.label ?? artifact.artifact_id;

  const handle = async () => {
    const quoted = text.split("\n").join("\n> ");
    const prompt =
      `Re: ${label}, regarding the highlighted text below:\n\n` +
      `> ${quoted}\n\n` +
      `What I want: ${value}`;
    if (onSubmit) {
      onSubmit(prompt);
      return;
    }
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success("Prompt copied");
    } catch {
      toast.error("Clipboard write failed");
    }
  };

  return (
    <div className="border-t border-border p-3 space-y-2">
      <div className="text-xs text-muted-foreground">
        Highlighted selection {selector ? <span className="font-mono">({selector})</span> : null}
      </div>
      <pre className="text-xs bg-muted/30 p-2 rounded-md max-h-32 overflow-auto whitespace-pre-wrap">
        {text || "(no text selected yet — drag-select inside the iframe)"}
      </pre>
      <Textarea
        placeholder="What I want…"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={handle} disabled={!text || !value.trim()}>
          <HugeiconsIcon icon={ArrowUpRightIcon} size={14} strokeWidth={2} />
          Copy prompt
        </Button>
      </div>
    </div>
  );
}
