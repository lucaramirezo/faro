"use client";

import { Download04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import type { Artifact } from "@/lib/artifacts-types";
import type { HighlightPayload } from "./HighlightBridge";
import { HtmlRenderer } from "./HtmlRenderer";
import { ImageRenderer } from "./ImageRenderer";
import { JsonRenderer } from "./JsonRenderer";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { SvgRenderer } from "./SvgRenderer";

/**
 * Studio renderer dispatcher. Switches on `artifact.mime` and delegates to a
 * mime-typed sub-renderer (DESIGN.md §6.4). Unknown mimes fall back to a
 * download-only button that links to the raw endpoint.
 *
 * NOTE: `text/x-code` requires server-only Shiki (CodeRenderer.tsx is RSC with
 * `import "server-only"`). This dispatcher cannot import CodeRenderer because
 * any "use client" parent dragging Renderer into the client bundle would pull
 * server-only with it. So for code mime, the RSC parent pre-renders
 * CodeRenderer and passes it via `codeNode`.
 *
 * `text/html` is the only mime with a highlight bridge — only the sandboxed
 * iframe can produce postMessage selection events.
 */
interface RendererProps {
  artifact: Artifact;
  onHighlight?: (h: HighlightPayload) => void;
  /** Pre-rendered CodeRenderer output (RSC) for `text/x-code` artifacts. */
  codeNode?: React.ReactNode;
}

export function Renderer({ artifact, onHighlight, codeNode }: RendererProps) {
  switch (artifact.mime) {
    case "text/html":
      return <HtmlRenderer artifact={artifact} onHighlight={onHighlight} />;
    case "text/markdown":
      return <MarkdownRenderer artifact={artifact} />;
    case "application/json":
      return <JsonRenderer artifact={artifact} />;
    case "image/svg+xml":
      return <SvgRenderer artifact={artifact} />;
    case "image/png":
    case "image/jpeg":
    case "image/webp":
      return <ImageRenderer artifact={artifact} />;
    case "text/x-code":
      return codeNode ?? <DownloadFallback artifact={artifact} />;
    default:
      return <DownloadFallback artifact={artifact} />;
  }
}

function DownloadFallback({ artifact }: { artifact: Artifact }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm text-muted-foreground">
        Unknown mime <code className="font-mono text-xs">{artifact.mime}</code> — download only.
      </p>
      <Button asChild variant="outline" size="sm">
        <a href={`/studio/raw/${artifact.artifact_id}`} download={artifact.label ?? undefined}>
          <HugeiconsIcon icon={Download04Icon} size={14} strokeWidth={2} />
          Download
        </a>
      </Button>
    </div>
  );
}
