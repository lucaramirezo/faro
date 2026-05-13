"use client";

import { useState } from "react";
import type { Artifact } from "@/lib/artifacts-types";
import type { HighlightPayload } from "./HighlightBridge";
import { HighlightPrompt } from "./HighlightPrompt";
import { Renderer } from "./Renderer";
import { Toolbar } from "./Toolbar";

/**
 * Studio workspace — the client wrapper that owns the highlight-mode +
 * highlight-text + prompt-value state. Composed from the A5 primitives:
 * Toolbar (top), Renderer (mime dispatcher), optional HighlightPrompt (bottom).
 *
 * The RSC parent (studio page) renders this for the selected artifact and,
 * for `text/x-code` mime ONLY, also pre-renders CodeRenderer and passes it
 * through `codeNode` — that's how we keep server-only Shiki out of the
 * client bundle (see Renderer.tsx leading comment).
 */
interface StudioWorkspaceProps {
  artifact: Artifact;
  codeNode?: React.ReactNode;
}

export function StudioWorkspace({ artifact, codeNode }: StudioWorkspaceProps) {
  const [highlightActive, setHighlightActive] = useState(false);
  const [highlight, setHighlight] = useState<HighlightPayload>({ text: "", selector: "" });
  const [promptValue, setPromptValue] = useState("");

  return (
    <div className="flex h-full flex-col min-w-0">
      <Toolbar
        artifact={artifact}
        highlightActive={highlightActive}
        onToggleHighlight={() => setHighlightActive((v) => !v)}
      />
      <div className="flex-1 overflow-hidden">
        <Renderer artifact={artifact} onHighlight={setHighlight} codeNode={codeNode} />
      </div>
      {highlightActive && (
        <div className="border-t border-border p-3 bg-card">
          <HighlightPrompt
            artifact={artifact}
            text={highlight.text}
            selector={highlight.selector}
            value={promptValue}
            onChange={setPromptValue}
          />
        </div>
      )}
    </div>
  );
}
