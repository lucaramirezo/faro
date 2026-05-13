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
 * The `<!--faro:diff-->` pragma is reserved for a follow-up pass that will
 * route diff regions through `lib/shiki-diff.ts`. For v1 we render plain
 * markdown and leave the pragma untouched in the output.
 */
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
        if (!cancelled) setText(body);
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
