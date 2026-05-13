"use client";

import DOMPurify from "dompurify";
import { useEffect, useState } from "react";
import type { Artifact } from "@/lib/artifacts-types";

interface SvgRendererProps {
  artifact: Artifact;
}

/**
 * Fetches raw SVG bytes, sanitizes with DOMPurify (svg + svgFilters profiles),
 * injects via dangerouslySetInnerHTML. The sandboxed Content-Security-Policy
 * on the raw endpoint plus the local sanitization gives defense in depth.
 */
export function SvgRenderer({ artifact }: SvgRendererProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(null);
    fetch(`/studio/raw/${artifact.artifact_id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`fetch failed: ${r.status}`);
        return r.text();
      })
      .then((body) => {
        if (cancelled) return;
        const clean = DOMPurify.sanitize(body, {
          USE_PROFILES: { svg: true, svgFilters: true },
        });
        setHtml(clean);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "fetch error");
      });
    return () => {
      cancelled = true;
    };
  }, [artifact.artifact_id]);

  if (error) {
    return <p className="text-sm text-destructive p-4">Failed to load SVG: {error}</p>;
  }
  if (html === null) {
    return <p className="text-sm text-muted-foreground p-4">Loading…</p>;
  }

  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: DOMPurify-sanitized via svg/svgFilters profile (DESIGN.md §6.4). */}
      <div className="max-w-full max-h-full" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
