"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { generateImageForPageAction } from "@/app/actions/image-gen";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/**
 * Studio "Illustrate" modal (Phase 4.5 D5). Posts to
 * `generateImageForPageAction` which calls `generateWikiImage` and
 * `revalidatePath("/studio")`. The generated PNG lands in
 * `drafts/artifacts/<date>/imagegen-<HHMMSS>-<slug>/<sha:8>.png` per
 * decision #6 (drafts-first; manual promote later).
 *
 * Aspect ratio uses native `<select>` since shadcn `select.tsx` is not
 * vendored. The Provider toggle in v1 is informational only — actual
 * routing is profile-driven via `models.wiki_image`. Switching providers
 * end-to-end requires a profile YAML edit (per decision #2).
 */
type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
type Quality = "standard" | "medium" | "high";

interface IllustrateButtonProps {
  /** Pre-fill from the active artifact's wiki slug, if any. */
  defaultSlug?: string;
}

export function IllustrateButton({ defaultSlug }: IllustrateButtonProps) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(defaultSlug ?? "");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<AspectRatio>("16:9");
  const [quality, setQuality] = useState<Quality>("medium");
  const [pending, startPending] = useTransition();

  function submit() {
    if (pending) return;
    if (!slug.trim()) {
      toast.error("Provide a slug (kebab-case).");
      return;
    }
    if (prompt.trim().length < 4) {
      toast.error("Prompt is too short.");
      return;
    }
    startPending(async () => {
      try {
        const fd = new FormData();
        fd.set("slug", slug.trim());
        fd.set("prompt", prompt);
        fd.set("aspectRatio", aspect);
        fd.set("quality", quality);
        const result = await generateImageForPageAction(fd);
        toast.success(
          `Generated ${result.provider}/${result.model} (${result.bytes} B, $${result.costUsd.toFixed(3)}).`,
        );
        setOpen(false);
        setPrompt("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Image generation failed");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Illustrate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Illustrate this page</DialogTitle>
          <DialogDescription>
            Generate a cover image via the profile's <code>models.wiki_image</code> binding. The
            image lands under <code>drafts/artifacts/</code>; promote it to wiki manually.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <label
              className="text-[10px] uppercase tracking-wide text-muted-foreground"
              htmlFor="il-slug"
            >
              Slug
            </label>
            <input
              id="il-slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="kebab-case wiki slug"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono"
              disabled={pending}
            />
          </div>
          <div className="space-y-1">
            <label
              className="text-[10px] uppercase tracking-wide text-muted-foreground"
              htmlFor="il-prompt"
            >
              Prompt
            </label>
            <Textarea
              id="il-prompt"
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A lighthouse on a cliff at dawn, watercolor"
              disabled={pending}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                className="text-[10px] uppercase tracking-wide text-muted-foreground"
                htmlFor="il-aspect"
              >
                Aspect
              </label>
              <select
                id="il-aspect"
                value={aspect}
                onChange={(e) => setAspect(e.target.value as AspectRatio)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                disabled={pending}
              >
                <option value="1:1">1:1</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="4:3">4:3</option>
                <option value="3:4">3:4</option>
              </select>
            </div>
            <div className="space-y-1">
              <label
                className="text-[10px] uppercase tracking-wide text-muted-foreground"
                htmlFor="il-quality"
              >
                Quality
              </label>
              <select
                id="il-quality"
                value={quality}
                onChange={(e) => setQuality(e.target.value as Quality)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                disabled={pending}
              >
                <option value="medium">medium ($0.04)</option>
                <option value="high">high ($0.167)</option>
                <option value="standard">standard (Imagen)</option>
              </select>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Provider/model is read from <code>profiles/lwiki.yml</code>{" "}
            <code>models.wiki_image</code>. Switch providers there.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
