"use client";

import { useEffect } from "react";
import { recordHighlightAction } from "@/app/actions/artifacts";

export interface HighlightPayload {
  text: string;
  selector: string;
}

interface HighlightBridgeProps {
  artifactId: string;
  onHighlight?: (h: HighlightPayload) => void;
}

/**
 * Listens for `postMessage` events from a sandboxed-no-same-origin iframe.
 * Validation gates (drop silently on either fail):
 *  - origin === window.location.origin OR origin === "null" (opaque)
 *  - data.type === 'faro:highlight' && typeof data.text === 'string'
 *
 * On valid messages: invokes onHighlight (UI sync) and fires the
 * recordHighlightAction Server Action (fire-and-forget audit append).
 *
 * See DESIGN.md §3.3.
 */
export function HighlightBridge({ artifactId, onHighlight }: HighlightBridgeProps) {
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin && event.origin !== "null") return;
      const data = event.data as unknown;
      if (!data || typeof data !== "object") return;
      const d = data as { type?: unknown; text?: unknown; selector?: unknown };
      if (d.type !== "faro:highlight") return;
      if (typeof d.text !== "string") return;
      const text = d.text.trim();
      if (!text) return;
      const selector = typeof d.selector === "string" ? d.selector : "";
      onHighlight?.({ text, selector });
      // Fire-and-forget audit; do not await.
      void recordHighlightAction({ artifactId, text, selector }).catch(() => {
        // Audit failures are not user-actionable; swallow silently.
      });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [artifactId, onHighlight]);

  return null;
}
