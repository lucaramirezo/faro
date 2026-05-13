"use client";

import type { Artifact } from "@/lib/artifacts-types";
import { HighlightBridge, type HighlightPayload } from "./HighlightBridge";

interface HtmlRendererProps {
  artifact: Artifact;
  onHighlight?: (h: HighlightPayload) => void;
}

/**
 * Sandboxed iframe renderer. Sandbox is `allow-scripts` ALONE — combining
 * it with `allow-same-origin` would let the artifact remove its own sandbox
 * (MDN). The artifact's effective origin is opaque ("null"); HighlightBridge
 * accepts postMessages from that opaque origin.
 *
 * See faro/.claude/skills/artifacts/DESIGN.md §3.1, §3.3.
 */
export function HtmlRenderer({ artifact, onHighlight }: HtmlRendererProps) {
  const label = artifact.label ?? artifact.artifact_id;
  return (
    <div className="relative w-full h-full">
      <iframe
        src={`/studio/raw/${artifact.artifact_id}`}
        sandbox="allow-scripts"
        className="w-full h-full border-0"
        title={label}
      />
      <HighlightBridge artifactId={artifact.artifact_id} onHighlight={onHighlight} />
    </div>
  );
}
