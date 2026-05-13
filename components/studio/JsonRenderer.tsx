"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { allExpanded, darkStyles, defaultStyles, JsonView } from "react-json-view-lite";
import type { Artifact } from "@/lib/artifacts-types";

interface JsonRendererProps {
  artifact: Artifact;
}

/**
 * Fetches /studio/raw/<id>, parses as JSON, renders via react-json-view-lite.
 * Theme follows the next-themes resolvedTheme (dark by default in faro).
 */
export function JsonRenderer({ artifact }: JsonRendererProps) {
  const { resolvedTheme } = useTheme();
  const [parsed, setParsed] = useState<unknown | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setParsed(null);
    setError(null);
    fetch(`/studio/raw/${artifact.artifact_id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`fetch failed: ${r.status}`);
        return r.text();
      })
      .then((body) => {
        if (cancelled) return;
        try {
          setParsed(JSON.parse(body));
        } catch (e) {
          setError(e instanceof Error ? e.message : "invalid JSON");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "fetch error");
      });
    return () => {
      cancelled = true;
    };
  }, [artifact.artifact_id]);

  if (error) {
    return <p className="text-sm text-destructive p-4">Failed to load JSON: {error}</p>;
  }
  if (parsed === null) {
    return <p className="text-sm text-muted-foreground p-4">Loading…</p>;
  }

  const style = resolvedTheme === "dark" ? darkStyles : defaultStyles;

  return (
    <div className="font-mono text-xs p-4 overflow-auto h-full">
      <JsonView
        data={parsed as Record<string, unknown> | unknown[]}
        style={style}
        shouldExpandNode={allExpanded}
      />
    </div>
  );
}
