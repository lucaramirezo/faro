"use client";

import {
  ArrowUpRightIcon,
  ClipboardIcon,
  CodeIcon,
  CopyIcon,
  HighlighterIcon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTransition } from "react";
import { toast } from "sonner";
import { openInClaudeCodeAction, promoteArtifactAction } from "@/app/actions/artifacts";
import { Button } from "@/components/ui/button";
import type { Artifact } from "@/lib/artifacts-types";

/**
 * Six-button studio toolbar (DESIGN.md §6.5):
 *  [Open in Claude Code] [Copy as prompt] [Copy raw]
 *  [Pop out] [Highlight to comment] [Promote to wiki]
 *
 * "Open in Claude Code" platform-dispatches via openInClaudeCodeAction:
 *   - Laptop  → navigates to `vscode://file/<absolute-path>`
 *   - Pei     → copies `claude --resume <run_id>` to clipboard
 * Detection happens server-side from the profile agent_root.
 *
 * "Copy raw" caps at 1 MB via Content-Length probe; over → toast asks user
 * to use "Pop out".
 */

const COPY_RAW_CAP_BYTES = 1_000_000;

interface ToolbarProps {
  artifact: Artifact;
  highlightActive: boolean;
  onToggleHighlight: () => void;
}

export function Toolbar({ artifact, highlightActive, onToggleHighlight }: ToolbarProps) {
  const [pending, beginTransition] = useTransition();
  const id = artifact.artifact_id;

  const copy = async (text: string, success: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(success);
    } catch {
      toast.error("Clipboard write failed");
    }
  };

  const onOpenClaude = async () => {
    try {
      const res = await openInClaudeCodeAction({ artifactId: id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.kind === "vscode") {
        // Navigate to vscode:// URL — VS Code opens (or browser prompts). On
        // pei this branch never fires; agent_root tells us we're on laptop.
        window.location.href = res.url;
      } else {
        await copy(res.text, "Resume invocation copied (no VS Code on pei)");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Open failed");
    }
  };

  const onCopyAsPrompt = () => {
    const emitter = artifact.emitter ?? "manual";
    const text =
      `In faro at ${artifact.path}, <describe what you want>. ` +
      `Context: emitted by ${emitter} at ${artifact.created_at} for run ${artifact.run_id ?? "(none)"}.`;
    void copy(text, "Prompt copied");
  };

  const onCopyRaw = async () => {
    try {
      const r = await fetch(`/studio/raw/${id}`);
      if (!r.ok) {
        toast.error(`Fetch failed: ${r.status}`);
        return;
      }
      const len = Number(r.headers.get("Content-Length") ?? "0");
      if (len > COPY_RAW_CAP_BYTES) {
        toast.error("Too large — use Pop out");
        return;
      }
      const body = await r.text();
      if (body.length > COPY_RAW_CAP_BYTES) {
        toast.error("Too large — use Pop out");
        return;
      }
      await copy(body, "Raw copied");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Copy failed");
    }
  };

  const onPopOut = () => {
    window.open(`/studio/raw/${id}`, "_blank", "noopener");
  };

  const onPromote = () => {
    if (!window.confirm("Promote to wiki?")) return;
    beginTransition(async () => {
      try {
        const res = await promoteArtifactAction({ artifactId: id });
        if (res.ok && res.alreadyPromoted) {
          toast.message("Already promoted");
        } else if (res.ok) {
          toast.success(`Promoted to ${res.newPath ?? "wiki"}`);
        } else {
          toast.error(res.error ?? "Promote failed");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Promote failed");
      }
    });
  };

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-border">
      <Button variant="ghost" size="sm" onClick={onOpenClaude} title="Copy claude --resume">
        <HugeiconsIcon icon={CodeIcon} size={14} strokeWidth={2} />
        Open in Claude Code
      </Button>
      <Button variant="ghost" size="sm" onClick={onCopyAsPrompt} title="Copy as prompt">
        <HugeiconsIcon icon={CopyIcon} size={14} strokeWidth={2} />
        Copy as prompt
      </Button>
      <Button variant="ghost" size="sm" onClick={onCopyRaw} title="Copy raw bytes">
        <HugeiconsIcon icon={ClipboardIcon} size={14} strokeWidth={2} />
        Copy raw
      </Button>
      <Button variant="ghost" size="sm" onClick={onPopOut} title="Open raw in new tab">
        <HugeiconsIcon icon={LinkSquare02Icon} size={14} strokeWidth={2} />
        Pop out
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleHighlight}
        aria-pressed={highlightActive}
        title="Toggle highlight-to-comment box"
      >
        <HugeiconsIcon icon={HighlighterIcon} size={14} strokeWidth={2} />
        Highlight to comment
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onPromote}
        disabled={pending}
        title="Promote artifact to wiki/artifacts/"
      >
        <HugeiconsIcon icon={ArrowUpRightIcon} size={14} strokeWidth={2} />
        Promote to wiki
      </Button>
    </div>
  );
}
