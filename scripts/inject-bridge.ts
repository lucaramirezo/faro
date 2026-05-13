#!/usr/bin/env bun
/**
 * Injects the faro highlight-bridge `<script>` into an emitter-produced
 * bundle.html, immediately before `</body>`. Idempotent — re-running on the
 * same file is a no-op.
 *
 * Usage:
 *   bun faro/scripts/inject-bridge.ts <bundle.html>
 *
 * The script lives in the artifact and posts `{type:'faro:highlight',text,selector}`
 * to `window.parent` whenever the user releases a non-empty text selection.
 * The parent (faro studio) re-validates origin + type before forwarding (see
 * components/studio/HighlightBridge.tsx and DESIGN.md §3.3).
 */

import { readFile, writeFile } from "node:fs/promises";

const MARKER = "/* faro-highlight-bridge v1 */";

const SCRIPT = `
<script>${MARKER}
(function(){
  function onUp(){
    var s = window.getSelection();
    if (!s || s.isCollapsed) return;
    var text = s.toString().trim();
    if (!text) return;
    var sel = "";
    try {
      var node = s.anchorNode && s.anchorNode.nodeType === 1
        ? s.anchorNode
        : s.anchorNode && s.anchorNode.parentElement;
      if (node) sel = node.tagName + (node.id ? "#" + node.id : "") + (node.className ? "." + String(node.className).split(/\\s+/).join(".") : "");
    } catch (e) {}
    window.parent.postMessage({ type: "faro:highlight", text: text, selector: sel }, "*");
  }
  document.addEventListener("mouseup", onUp);
  document.addEventListener("touchend", onUp);
})();
</script>
`.trim();

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: bun inject-bridge.ts <bundle.html>");
    process.exit(2);
  }
  const html = await readFile(target, "utf8");
  if (html.includes(MARKER)) {
    console.log(`[inject-bridge] already injected: ${target}`);
    return;
  }
  const idx = html.lastIndexOf("</body>");
  const out =
    idx === -1 ? `${html}\n${SCRIPT}\n` : `${html.slice(0, idx)}${SCRIPT}\n${html.slice(idx)}`;
  await writeFile(target, out, "utf8");
  console.log(`[inject-bridge] injected: ${target}`);
}

main().catch((err) => {
  console.error("[inject-bridge] failed:", err);
  process.exit(1);
});
