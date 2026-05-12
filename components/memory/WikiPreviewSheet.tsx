"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface WikiContent {
  body: string;
  frontmatter: Record<string, unknown>;
}

interface State {
  status: "idle" | "loading" | "ok" | "missing" | "error";
  content: WikiContent | null;
  error: string | null;
}

export interface WikiPreviewSheetProps {
  slug: string | null;
  onClose: () => void;
}

export function WikiPreviewSheet({ slug, onClose }: WikiPreviewSheetProps) {
  const [state, setState] = useState<State>({ status: "idle", content: null, error: null });

  useEffect(() => {
    if (!slug) {
      setState({ status: "idle", content: null, error: null });
      return;
    }
    setState({ status: "loading", content: null, error: null });
    const ac = new AbortController();
    fetch(`/api/wiki/${encodeURIComponent(slug)}`, { signal: ac.signal })
      .then(async (res) => {
        if (res.status === 404) {
          setState({ status: "missing", content: null, error: null });
          return;
        }
        if (!res.ok) {
          setState({ status: "error", content: null, error: `HTTP ${res.status}` });
          return;
        }
        const json = (await res.json()) as WikiContent;
        setState({ status: "ok", content: json, error: null });
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        setState({ status: "error", content: null, error: String(err) });
      });
    return () => ac.abort();
  }, [slug]);

  return (
    <Sheet open={slug != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-mono text-sm">wiki/{slug}.md</SheetTitle>
          <SheetDescription>Read-only preview from the wiki.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6 space-y-3">
          {state.status === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
          {state.status === "missing" && (
            <p className="text-sm text-muted-foreground">Wiki page not found.</p>
          )}
          {state.status === "error" && (
            <p className="text-sm text-destructive">Error: {state.error}</p>
          )}
          {state.status === "ok" && state.content && (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed bg-muted/40 p-3 rounded-md">
              {state.content.body.trim()}
            </pre>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
