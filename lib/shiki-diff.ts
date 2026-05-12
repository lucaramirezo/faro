import "server-only";
import {
  type BundledLanguage,
  type BundledTheme,
  createHighlighter,
  type Highlighter,
} from "shiki";

/**
 * Server-only Shiki diff renderer. Streams HTML to clients via a route
 * handler — never imported from a client component (the ``server-only``
 * import would crash the build if so).
 *
 * The highlighter is cached at module scope; cold load is ~600 KB of
 * grammar + theme JSON. We use the ``markdown`` grammar with the
 * ``github-dark-default`` theme to match the Luma palette.
 */

const THEME: BundledTheme = "github-dark-default";
const LANG: BundledLanguage = "markdown";

let _hl: Highlighter | null = null;
let _hlPromise: Promise<Highlighter> | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (_hl) return _hl;
  if (_hlPromise) return _hlPromise;
  _hlPromise = createHighlighter({
    themes: [THEME],
    langs: [LANG],
  }).then((h) => {
    _hl = h;
    _hlPromise = null;
    return h;
  });
  return _hlPromise;
}

type DiffLine = {
  kind: "context" | "add" | "del";
  text: string;
};

/**
 * Compute a minimal line-by-line diff. Not the LCS-optimal algorithm — for our
 * purposes (small ``memory.md`` diffs, < 500 lines) the cheap rolling-pointer
 * approach is fine. If the two files share a common prefix, mark the rest as
 * sequential delete-then-add blocks until they re-converge.
 */
function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ kind: "context", text: a[i] });
      i++;
      j++;
      continue;
    }
    // Find next sync point: smallest (k, l) with a[i+k] === b[j+l].
    let foundI = -1;
    let foundJ = -1;
    const lookahead = 50;
    outer: for (let d = 1; d < lookahead; d++) {
      for (let k = 0; k <= d; k++) {
        const l = d - k;
        if (i + k < a.length && j + l < b.length && a[i + k] === b[j + l]) {
          foundI = k;
          foundJ = l;
          break outer;
        }
      }
    }
    if (foundI === -1) {
      while (i < a.length) {
        out.push({ kind: "del", text: a[i] });
        i++;
      }
      while (j < b.length) {
        out.push({ kind: "add", text: b[j] });
        j++;
      }
      break;
    }
    for (let k = 0; k < foundI; k++) {
      out.push({ kind: "del", text: a[i + k] });
    }
    for (let l = 0; l < foundJ; l++) {
      out.push({ kind: "add", text: b[j + l] });
    }
    i += foundI;
    j += foundJ;
  }
  return out;
}

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export async function renderDiffHTML(before: string, after: string): Promise<string> {
  const hl = await getHighlighter();
  const lines = lineDiff(before, after);
  const rows: string[] = [];
  for (const ln of lines) {
    const cls =
      ln.kind === "add" ? "faro-diff-add" : ln.kind === "del" ? "faro-diff-del" : "faro-diff-ctx";
    const marker = ln.kind === "add" ? "+" : ln.kind === "del" ? "-" : " ";
    const highlighted = hl.codeToHtml(ln.text || " ", {
      lang: LANG,
      theme: THEME,
    });
    const inner = highlighted.match(/<pre[^>]*>([\s\S]*?)<\/pre>/)?.[1] ?? escapeHtml(ln.text);
    rows.push(`<div class="${cls}"><span class="faro-diff-marker">${marker}</span>${inner}</div>`);
  }
  return `<div class="faro-diff" data-theme="${THEME}">${rows.join("")}</div>`;
}
