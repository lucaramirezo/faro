import "server-only";

import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { type BundledLanguage, type BundledTheme, createHighlighter } from "shiki";
import { assertArtifactPath } from "@/lib/artifacts";
import type { Artifact } from "@/lib/artifacts-types";

/**
 * Server component. Reads the artifact bytes via assertArtifactPath() (the
 * path-guard helper from lib/artifacts.ts; every disk read MUST go through
 * it) and renders syntax-highlighted HTML server-side using Shiki.
 *
 * Monaco is FORBIDDEN per DESIGN.md decision (f): saves ~3 MB + a worker-src
 * CSP carve-out. Read-only text selection is sufficient for the studio.
 */

const THEME: BundledTheme = "github-dark-dimmed";

const LANG_BY_EXT: Record<string, BundledLanguage> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".py": "python",
  ".sh": "bash",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".css": "css",
  ".sql": "sql",
};

function langFromPath(p: string): BundledLanguage {
  return LANG_BY_EXT[extname(p).toLowerCase()] ?? "typescript";
}

// Module-scope cache; cold load is ~600 KB grammars+theme JSON. Matches
// lib/shiki-diff.ts pattern.
let _hl: Awaited<ReturnType<typeof createHighlighter>> | null = null;
let _hlPromise: Promise<Awaited<ReturnType<typeof createHighlighter>>> | null = null;

async function getHighlighter(lang: BundledLanguage) {
  if (_hl) {
    // Ensure the language is loaded on demand.
    const loaded = _hl.getLoadedLanguages();
    if (!loaded.includes(lang)) {
      await _hl.loadLanguage(lang);
    }
    return _hl;
  }
  if (_hlPromise) return _hlPromise;
  _hlPromise = createHighlighter({ themes: [THEME], langs: [lang] }).then((h) => {
    _hl = h;
    _hlPromise = null;
    return h;
  });
  return _hlPromise;
}

export async function CodeRenderer({ artifact }: { artifact: Artifact }) {
  const path = assertArtifactPath(artifact.artifact_id);
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (err) {
    return (
      <p className="text-sm text-destructive p-4">
        Failed to read file: {err instanceof Error ? err.message : String(err)}
      </p>
    );
  }
  const lang = langFromPath(artifact.path);
  const hl = await getHighlighter(lang);
  const html = hl.codeToHtml(source, {
    lang,
    theme: THEME,
  });

  return (
    <div className="overflow-auto h-full p-3">
      <div
        className="text-xs [&_pre]:!bg-muted/30 [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-auto"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki HTML is rendered server-side from a fixed grammar/theme; trusted
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
