import { Download04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import type { Artifact } from "@/lib/artifacts-types";
import { CodeRenderer } from "./CodeRenderer";
import type { HighlightPayload } from "./HighlightBridge";
import { HtmlRenderer } from "./HtmlRenderer";
import { JsonRenderer } from "./JsonRenderer";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { SvgRenderer } from "./SvgRenderer";

/**
 * Studio renderer dispatcher. Switches on `artifact.mime` and delegates to a
 * mime-typed sub-renderer (DESIGN.md §6.4). Unknown mimes fall back to a
 * download-only button that links to the raw endpoint.
 *
 * NOTE: `text/html` is the only mime with a highlight bridge — only the
 * sandboxed iframe can produce postMessage selection events. Other renderers
 * ignore `onHighlight`.
 */
interface RendererProps {
  artifact: Artifact;
  onHighlight?: (h: HighlightPayload) => void;
}

export function Renderer({ artifact, onHighlight }: RendererProps) {
  switch (artifact.mime) {
    case "text/html":
      return <HtmlRenderer artifact={artifact} onHighlight={onHighlight} />;
    case "text/markdown":
      return <MarkdownRenderer artifact={artifact} />;
    case "application/json":
      return <JsonRenderer artifact={artifact} />;
    case "image/svg+xml":
      return <SvgRenderer artifact={artifact} />;
    case "text/x-code":
      return <CodeRenderer artifact={artifact} />;
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
