"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

export function LivePreview({ runId }: { runId: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/dreams/${encodeURIComponent(runId)}/diff`);
        if (!res.ok) {
          throw new Error(`diff fetch failed: ${res.status}`);
        }
        const text = await res.text();
        if (!cancelled) setHtml(text);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "unknown");
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  return (
    <Card className="p-3 max-h-[420px] overflow-auto">
      <h3 className="text-xs uppercase tracking-wider font-medium text-muted-foreground mb-2">
        Live preview · memory.md diff
      </h3>
      {error && <p className="text-xs text-rose-400">Failed to load diff: {error}</p>}
      {!error && html === null && (
        <div className="space-y-1">
          <div className="h-4 w-3/4 rounded bg-muted/40 animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-muted/30 animate-pulse" />
          <div className="h-4 w-2/3 rounded bg-muted/30 animate-pulse" />
        </div>
      )}
      {html !== null && (
        <div
          className="text-xs font-mono leading-snug"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki HTML is rendered server-side and trusted
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </Card>
  );
}
