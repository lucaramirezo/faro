"use client";

import type { Artifact } from "@/lib/artifacts-types";

/**
 * Raster image renderer (Phase 4.5 D4). Backs `image/png | image/jpeg |
 * image/webp` artifacts in the studio. Source URL hits the existing studio
 * raw endpoint which already sets `Content-Type` from `artifact.mime`.
 *
 * Wrapped in a centering flex container with a neutral checker-ish background
 * so transparent PNGs read clearly. `object-contain` keeps the full image
 * visible without cropping on either axis.
 */
interface ImageRendererProps {
  artifact: Artifact;
}

export function ImageRenderer({ artifact }: ImageRendererProps) {
  return (
    <div className="w-full h-full flex items-center justify-center p-4 bg-muted/20">
      <img
        src={`/studio/raw/${artifact.artifact_id}`}
        alt={artifact.label ?? `artifact ${artifact.artifact_id}`}
        className="max-w-full max-h-full object-contain rounded-md border border-border shadow-sm"
      />
    </div>
  );
}
