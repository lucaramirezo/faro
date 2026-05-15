/**
 * §6.9 artifact-generation prompt assembly.
 *
 * Structure (NOT prose) mirrored from nexu-io/html-anything
 * `src/lib/templates/shared.ts:assemblePrompt` @b699e8a (Apache-2.0) — see
 * LICENSE-third-party.md. The upstream `SHARED_DESIGN_DIRECTIVES` is Chinese
 * and CDN-dependent; this is fully RE-AUTHORED in English to faro's locked
 * visual bar (faro/.claude/skills/artifacts/EMITTER-GUIDE.md §2/§6) and the
 * `/studio/raw` `allow-scripts`-only CSP (locked Q5).
 *
 * Generation v1 is tools-OFF (run-engine passes `allowedTools: []`, no
 * `canUseTool`). HTML is recovered from the streamed assistant *text* via
 * lib/extract-html.ts — NOT rescued from a Write tool. The system prompt
 * therefore forbids file tools and demands a single fenced ```html block.
 */

/** Soft cap on user content folded into the prompt. ~6k tokens; larger inputs
 *  are truncated with a visible note (mirrors chat/route.ts:69-73 discipline,
 *  the agent-sdk.ts MAX_PROMPT_CHARS idea scaled up for artifact source). */
export const MAX_CONTENT_CHARS = 24_000;

/**
 * Anti-AI-slop visual contract, English, faro voice. Mirrors the
 * EMITTER-GUIDE bar: dark default, Geist (NOT Inter), no purple gradients,
 * single self-contained file, inline CSS/JS only, zero external fetches
 * (the raw-route CSP is `default-src 'none'; connect-src 'none';
 * sandbox allow-scripts`).
 */
export const SHARED_DESIGN_DIRECTIVES = `You are a world-class visual designer and senior front-end engineer. Produce ONE self-contained, single-file HTML document.

HARD TECHNICAL CONSTRAINTS (the render sandbox enforces these — violating them yields a blank page):
- The document is rendered in an iframe whose CSP is \`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; sandbox allow-scripts\`.
- Everything inline. NO external stylesheets, NO web-font links, NO external <script src>, NO external image URLs, NO fetch/XHR/WebSocket to any origin. Images must be inline SVG or data:/blob: URIs only.
- Do NOT use any file-system or shell tool (no Write/Edit/MultiEdit/Bash/Create). Do NOT claim you wrote a file. Stream the complete HTML document as your assistant text.
- The document starts with \`<!doctype html>\` and ends with \`</html>\`. Open with \`<html lang="en" data-theme="dark">\` — dark is the default theme.
- Output ONLY the HTML inside a single fenced \`\`\`html code block. No preamble, no explanation, no trailing commentary. The first non-whitespace characters of your reply are the opening fence.

VISUAL BAR (faro EMITTER-GUIDE):
- Typography: \`"Geist", "Geist Sans", ui-sans-serif, system-ui, sans-serif\` for body; \`"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace\` for numerics and code. NEVER use Inter.
- Color: one primary + two neutrals + at most one accent. Generous whitespace. No pure #000/#fff — use \`#0a0a0a\` / \`#fafafa\`. NO purple gradients.
- Layout: 8px baseline grid; \`<main>\` max-width ~1240px with padding \`28px 28px 80px\`; clear type hierarchy; prose measure ≤ 70ch. Avoid the AI-slop look: no everything-centered hero stacks, no uniform pill-rounded corners on every element.
- Cards: a clear card primitive with \`border-radius: calc(0.625rem * 2.6)\`, soft 1px borders, restrained shadows. Surface discrete content as steerable cards, not a styled markdown wall.
- Motion: subtle only (entrance fade / \`transition\` on interactive states); never decorative animation that distracts.
- Accessibility: contrast ≥ 4.5:1; visible focus states on interactive elements.

CONTENT FIDELITY:
- Use ONLY the real user content below. No lorem ipsum, no "Your text here", no invented facts.
- Fully cover the user's content — do not summarize away sections or data. Let the amount of structure follow the content's actual length and shape.
- If the input is structured (CSV/JSON), extract the key insights and present them as tables/charts drawn with inline SVG or CSS.`;

/** System prompt for generation runs — reinforces tools-off + single fenced
 *  block at the system level (the user message carries the directives+brief). */
export const GENERATION_SYSTEM_PROMPT =
  "You generate a single self-contained HTML document and nothing else. " +
  "You have no file-system or shell tools and must not attempt to use any; " +
  "stream the document as assistant text inside one fenced ```html block, " +
  "starting with <!doctype html> and ending with </html>. No commentary.";

export interface AssembleGenerationPromptInput {
  /** The selected SKILL.md markdown body (the design brief). */
  skillBody: string;
  /** The raw user content the artifact is generated from. */
  content: string;
  /** A short hint describing the input shape, e.g. "markdown" | "json" | "text". */
  format: string;
  /** Override the shared directives (defaults to SHARED_DESIGN_DIRECTIVES). */
  sharedDirectives?: string;
}

/**
 * Canonical assembly order (locked, mirrors html-anything `assemblePrompt`):
 *   SHARED_DESIGN_DIRECTIVES → skillBody → "Input format: <format>" →
 *   "User content:\n<content>"
 * Directives always first, user content always last. Returns the user
 * message; pair with GENERATION_SYSTEM_PROMPT as the system prompt.
 */
export function assembleGenerationPrompt(input: AssembleGenerationPromptInput): string {
  const directives = input.sharedDirectives ?? SHARED_DESIGN_DIRECTIVES;
  const content =
    input.content.length > MAX_CONTENT_CHARS
      ? `${input.content.slice(0, MAX_CONTENT_CHARS)}\n\n…[truncated ${
          input.content.length - MAX_CONTENT_CHARS
        } chars]`
      : input.content;
  return `${directives}

${input.skillBody.trim()}

Input format: ${input.format}

User content:
${content}`;
}
