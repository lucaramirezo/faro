import { z } from "zod";

/**
 * Discriminated union of sniper edit patches. Routing is determined by `kind`:
 * the 4 DIRECT_WRITE_KINDS bypass the gate (reversible, scoped, no destination
 * change). The 5 GATED_KINDS route through UnifiedGate `source: "sniper-edit"`.
 *
 * See `wiki/decisions/2026-05-20-faro-p4-locked.md` Q2 for the routing lock.
 */
export const SourcePatchSchema = z.discriminatedUnion("kind", [
  // Direct-write kinds (D-P4-02 — bypass gate)
  z.object({
    kind: z.literal("set-text"),
    id: z.string(),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("set-link"),
    id: z.string(),
    href: z.string().url(),
    text: z.string().optional(),
  }),
  z.object({
    kind: z.literal("set-style"),
    id: z.string(),
    styles: z.record(z.string(), z.string()),
  }),
  z.object({
    kind: z.literal("set-attributes"),
    id: z.string(),
    attributes: z.record(z.string(), z.string().nullable()),
  }),
  // Gated kinds (D-P4-02 — route through UnifiedGate)
  z.object({
    kind: z.literal("set-image"),
    id: z.string(),
    src: z.string(),
    alt: z.string().optional(),
  }),
  z.object({
    kind: z.literal("set-token"),
    id: z.string(),
    token: z.string(),
    value: z.string(),
  }),
  z.object({
    kind: z.literal("remove-element"),
    id: z.string(),
  }),
  z.object({
    kind: z.literal("set-outer-html"),
    id: z.string(),
    outerHtml: z.string(),
  }),
  z.object({
    kind: z.literal("set-full-source"),
    source: z.string(),
  }),
]);

export type SourcePatch = z.infer<typeof SourcePatchSchema>;
export type SourcePatchKind = SourcePatch["kind"];

export const DIRECT_WRITE_KINDS: ReadonlySet<SourcePatchKind> = new Set([
  "set-text",
  "set-link",
  "set-style",
  "set-attributes",
]);

export const GATED_KINDS: ReadonlySet<SourcePatchKind> = new Set([
  "set-image",
  "set-token",
  "remove-element",
  "set-outer-html",
  "set-full-source",
]);

/**
 * Attributes the sniper MUST NOT overwrite via `set-attributes`. These are the
 * round-trip identity contract — clobbering them breaks the sniper's locator.
 */
export const PROTECTED_ATTRIBUTES: ReadonlySet<string> = new Set([
  "data-faro-id",
  "data-faro-edit",
  "data-faro-label",
]);
