"use client";

import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import type { Artifact } from "@/lib/artifacts-types";

interface MarkdownRendererProps {
  artifact: Artifact;
}

/**
 * Fetches the raw markdown bytes from /studio/raw/<id> (the server route
 * applies the artifact CSP) and renders via react-markdown + remark-gfm
 * + rehype-highlight.
 *
 * The `<!--faro:diff-->` ... `<!--/faro:diff-->` pragma converts inner
 * content into a fenced ```diff block, which rehype-highlight then renders
 * with diff syntax colors. Lighter than wiring shiki-diff.ts across the
 * server/client boundary (shiki-diff is server-only and this renderer is
 * a client component); deferred to follow-up if richer diff rendering is
 * needed.
 */
function processFaroDiffPragma(text: string): string {
  return text.replace(
    /<!--\s*faro:diff\s*-->\s*([\s\S]*?)\s*<!--\s*\/faro:diff\s*-->/g,
    (_match, body) => `\n\`\`\`diff\n${body.trim()}\n\`\`\`\n`,
  );
}

export function MarkdownRenderer({ artifact }: MarkdownRendererProps) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    fetch(`/studio/raw/${artifact.artifact_id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`fetch failed: ${r.status}`);
        return r.text();
      })
      .then((body) => {
        if (!cancelled) setText(processFaroDiffPragma(body));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "fetch error");
      });
    return () => {
      cancelled = true;
    };
  }, [artifact.artifact_id]);

  if (error) {
    return <p className="text-sm text-destructive p-4">Failed to load markdown: {error}</p>;
  }
  if (text === null) {
    return <p className="text-sm text-muted-foreground p-4">Loading…</p>;
  }

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none p-4 overflow-auto h-full">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {text}
      </Markdown>
    </div>
  );
}
