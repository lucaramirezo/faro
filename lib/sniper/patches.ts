import "server-only";
import { parseHTML } from "linkedom";
import { PROTECTED_ATTRIBUTES, type SourcePatch, SourcePatchSchema } from "./patches-types";

export type ApplyPatchResult = { ok: true; source: string } | { ok: false; error: string };

/**
 * Apply a single sniper patch to an HTML source string. Pure: returns the new
 * source (or an error). Does NOT touch the filesystem.
 *
 * Uses linkedom for DOM parsing. Serializes back via `document.toString()` so
 * the `<!DOCTYPE html>` and comments survive (round-tripping via
 * `documentElement.outerHTML` would lose the doctype).
 *
 * Locator strategy (per Q3 of the P4 lock):
 *   1. `__body__` sentinel → `document.body`
 *   2. `[data-faro-id="<id>"]`        — stable authored ID (preferred)
 *   3. `[data-faro-runtime-id="<id>"]` — bridge-stamped positional fallback
 *   4. `[data-faro-source-path="<id>"]`
 *   5. Positional path `path-i-j-k`    — brittle (breaks on sibling reorder)
 */
export function applyPatch(source: string, patch: SourcePatch): ApplyPatchResult {
  // Validate the patch shape defensively. Server Actions already Zod-validate
  // but `applyPatch` is also called from the gate resolver where the patch is
  // re-read from SQLite — re-validating here is cheap and protects the seam.
  const parsed = SourcePatchSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: `invalid patch: ${parsed.error.message}` };
  const valid = parsed.data;

  // Special case: replacing the entire source bypasses DOM parsing entirely.
  if (valid.kind === "set-full-source") {
    return { ok: true, source: valid.source };
  }

  const { document } = parseHTML(source);
  const el = findEditableElement(document, valid.id);
  if (!el) return { ok: false, error: `element not found: id=${valid.id}` };

  try {
    switch (valid.kind) {
      case "set-text": {
        el.textContent = valid.text;
        break;
      }
      case "set-link": {
        if (el.tagName.toUpperCase() !== "A") {
          return { ok: false, error: `set-link expects <a>, got <${el.tagName.toLowerCase()}>` };
        }
        el.setAttribute("href", valid.href);
        if (valid.text !== undefined) el.textContent = valid.text;
        break;
      }
      case "set-style": {
        const styles = parseStyleAttr(el.getAttribute("style") ?? "");
        for (const [k, v] of Object.entries(valid.styles)) {
          styles.set(k.trim(), v);
        }
        el.setAttribute("style", serializeStyleAttr(styles));
        break;
      }
      case "set-attributes": {
        for (const k of Object.keys(valid.attributes)) {
          if (PROTECTED_ATTRIBUTES.has(k)) {
            return { ok: false, error: `refused to overwrite protected attribute: ${k}` };
          }
        }
        for (const [k, v] of Object.entries(valid.attributes)) {
          if (v === null) el.removeAttribute(k);
          else el.setAttribute(k, v);
        }
        break;
      }
      case "set-image": {
        if (el.tagName.toUpperCase() !== "IMG") {
          return { ok: false, error: `set-image expects <img>, got <${el.tagName.toLowerCase()}>` };
        }
        el.setAttribute("src", valid.src);
        if (valid.alt !== undefined) el.setAttribute("alt", valid.alt);
        break;
      }
      case "set-token": {
        // CSS custom property on the element's inline style (e.g. --primary-color).
        // The token name is stored verbatim — caller decides whether to prefix `--`.
        const styles = parseStyleAttr(el.getAttribute("style") ?? "");
        const name = valid.token.startsWith("--") ? valid.token : `--${valid.token}`;
        styles.set(name, valid.value);
        el.setAttribute("style", serializeStyleAttr(styles));
        break;
      }
      case "remove-element": {
        const parent = el.parentNode;
        if (!parent) return { ok: false, error: "cannot remove root element" };
        parent.removeChild(el);
        break;
      }
      case "set-outer-html": {
        // linkedom supports outerHTML assignment for non-root elements.
        const parent = el.parentNode;
        if (!parent) return { ok: false, error: "cannot replace outerHTML of root" };
        try {
          // biome-ignore lint/suspicious/noExplicitAny: linkedom typing gap
          (el as any).outerHTML = valid.outerHtml;
        } catch (err) {
          return { ok: false, error: `outerHTML parse failed: ${(err as Error).message}` };
        }
        break;
      }
    }
  } catch (err) {
    return { ok: false, error: `patch apply failed: ${(err as Error).message}` };
  }

  return { ok: true, source: document.toString() };
}

/**
 * 4-strategy locator. Mirrors `nexu-io/open-design`'s
 * `apps/web/src/edit-mode/source-patches.ts:findEditableElement`.
 */
function findEditableElement(
  // biome-ignore lint/suspicious/noExplicitAny: linkedom Document is structurally compatible but not nominally a DOM Document
  document: any,
  id: string,
  // biome-ignore lint/suspicious/noExplicitAny: see above
): any | null {
  if (id === "__body__") return document.body;
  const escaped = cssEscape(id);
  return (
    document.querySelector(`[data-faro-id="${escaped}"]`) ||
    document.querySelector(`[data-faro-runtime-id="${escaped}"]`) ||
    document.querySelector(`[data-faro-source-path="${escaped}"]`) ||
    findElementByPath(document, id)
  );
}

/**
 * Positional fallback. The id format `path-i-j-k` (`i`, `j`, `k` are sibling
 * indices) walks `body.children` and drills in. Brittle by design — emitters
 * MUST stamp `data-faro-id` per EMITTER-GUIDE.md §11.
 */
function findElementByPath(
  // biome-ignore lint/suspicious/noExplicitAny: linkedom typing gap
  document: any,
  id: string,
  // biome-ignore lint/suspicious/noExplicitAny: see above
): any | null {
  if (!id.startsWith("path-")) return null;
  const rest = id.slice("path-".length);
  if (!rest) return null;
  const indices = rest.split("-").map((s) => Number.parseInt(s, 10));
  if (indices.some((n) => Number.isNaN(n) || n < 0)) return null;
  // biome-ignore lint/suspicious/noExplicitAny: linkedom typing gap
  let cursor: any = document.body;
  for (const i of indices) {
    if (!cursor) return null;
    const children = cursor.children;
    if (!children || i >= children.length) return null;
    cursor = children.item ? children.item(i) : children[i];
  }
  return cursor ?? null;
}

function parseStyleAttr(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    if (!key) continue;
    out.set(key, value);
  }
  return out;
}

function serializeStyleAttr(styles: Map<string, string>): string {
  const parts: string[] = [];
  for (const [k, v] of styles) {
    if (v === "" || v === undefined) continue;
    parts.push(`${k}: ${v}`);
  }
  return parts.join("; ");
}

/**
 * Minimal CSS.escape polyfill — happy-dom and linkedom don't ship one and the
 * Node lib doesn't expose the global. We only need it for attribute-selector
 * values so the subset of escapes is small.
 */
function cssEscape(value: string): string {
  if (typeof globalThis !== "undefined") {
    const css = (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS;
    if (css && typeof css.escape === "function") return css.escape(value);
  }
  return value.replace(/(["\\\n\r\f\t])/g, "\\$1");
}
