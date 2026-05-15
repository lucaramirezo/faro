// Vendored from nexu-io/html-anything src/lib/extract-html.ts @b699e8a
// (Apache-2.0). See LICENSE-third-party.md. Rungs 1–4 + previewHtml are
// lifted verbatim; the last-resort scaffold (rung 5) is REPLACED with a
// self-contained inline-CSS document — faro's /studio/raw CSP is
// `default-src 'none'; connect-src 'none'` so the upstream
// `cdn.tailwindcss.com` scaffold would render blank (locked Q5).

/**
 * Pulls the actual HTML document out of an agent's possibly chatty response.
 * Agents sometimes wrap output in ```html ... ``` fences or prepend
 * explanation. 5-rung ladder, first match wins.
 */
export function extractHtml(streamed: string): string {
  if (!streamed) return "";

  // 1. Strip leading ```html fence (and trailing ```)
  const fence = streamed.match(/```(?:html|HTML)?\s*([\s\S]*?)```/);
  if (fence) {
    const inner = fence[1].trim();
    if (inner.startsWith("<")) return inner;
  }

  // 2. Find <!DOCTYPE html ... </html>
  const doctypeStart = streamed.search(/<!DOCTYPE\s+html/i);
  if (doctypeStart !== -1) {
    const closeIdx = streamed.lastIndexOf("</html>");
    if (closeIdx !== -1) {
      return streamed.slice(doctypeStart, closeIdx + "</html>".length);
    }
    // streaming, partial — return from doctype to end
    return streamed.slice(doctypeStart);
  }

  // 3. Find <html> ... </html>
  const htmlStart = streamed.search(/<html[\s>]/i);
  if (htmlStart !== -1) {
    const closeIdx = streamed.lastIndexOf("</html>");
    if (closeIdx !== -1) {
      return streamed.slice(htmlStart, closeIdx + "</html>".length);
    }
    return streamed.slice(htmlStart);
  }

  // 4. If it begins with < (root element), trust it
  if (streamed.trimStart().startsWith("<")) {
    return streamed;
  }

  // 5. Self-contained last-resort scaffold so SOMETHING renders. NO external
  // CDN/fetch (faro raw-route CSP blocks them) — inline <style> only, dark
  // default per the EMITTER-GUIDE anti-AI-slop bar.
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Generated output (raw)</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; background: #0a0a0a; color: #e5e5e5; }
  body { padding: 2rem; font: 14px/1.6 ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  pre { white-space: pre-wrap; word-break: break-word; margin: 0; }
</style>
</head>
<body><pre>${escapeHtml(streamed)}</pre></body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * For previews while the stream is still arriving — make sure we always
 * produce a closing </body></html> so the iframe can render incrementally.
 */
export function previewHtml(streamed: string): string {
  const html = extractHtml(streamed);
  if (!html) return "";
  if (/<\/html>/i.test(html)) return html;
  return `${html}\n</body>\n</html>`;
}
