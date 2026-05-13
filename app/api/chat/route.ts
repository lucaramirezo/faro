import "server-only";

import { readFile } from "node:fs/promises";
import { type ChatSSEEvent, streamChat } from "@/lib/agent-sdk";
import { assertArtifactPath, getArtifact } from "@/lib/artifacts";

/**
 * POST /api/chat — SSE-streamed Sonnet chat scoped to a single artifact.
 *
 * The client (`components/studio/Chat.tsx`) posts:
 *
 *     { artifactId: string, messages: [{ role: 'user'|'assistant', content: string }, ...] }
 *
 * The handler:
 *   1. Looks up the artifact by id (throws on missing — caller posts a known id),
 *   2. Reads the file content with `assertUnder` enforced,
 *   3. Builds a system prompt with artifact metadata + content (50KB cap),
 *   4. Streams `streamChat()` envelopes as SSE.
 *
 * EventSource doesn't support POST, so the client uses fetch + ReadableStream
 * reader. SSE format is `data: <json>\n\n` per envelope.
 *
 * Auth: relies on Tailscale-User-Login at the proxy layer (laptop dev has no
 * auth; pei Tailscale Serve injects the header). The chat route does NOT
 * call `readDecidedBy()` — the request is read-only and rate-bound by the
 * Max-sub which is already authenticated against Luca's account.
 */

const ARTIFACT_CONTENT_CAP_BYTES = 50 * 1024;

const TEXT_MIMES = new Set([
  "text/markdown",
  "text/plain",
  "text/html",
  "text/x-code",
  "application/json",
  "image/svg+xml",
]);

interface ChatRequestBody {
  artifactId: unknown;
  messages?: Array<{ role: unknown; content: unknown }>;
}

function isUserMessage(m: { role: unknown; content: unknown }): m is {
  role: "user" | "assistant";
  content: string;
} {
  return (
    (m.role === "user" || m.role === "assistant") &&
    typeof m.content === "string" &&
    m.content.length > 0
  );
}

async function loadArtifactBody(artifactId: string): Promise<{ body: string; truncated: boolean }> {
  const a = getArtifact(artifactId);
  if (!a) {
    return { body: `[artifact ${artifactId} not found]`, truncated: false };
  }
  if (!TEXT_MIMES.has(a.mime)) {
    return {
      body: `[artifact is binary: mime=${a.mime}, bytes=${a.bytes}; ask the user for a text alternative]`,
      truncated: false,
    };
  }
  const abs = assertArtifactPath(artifactId);
  const raw = await readFile(abs, "utf8");
  if (raw.length <= ARTIFACT_CONTENT_CAP_BYTES) return { body: raw, truncated: false };
  return {
    body: `${raw.slice(0, ARTIFACT_CONTENT_CAP_BYTES)}\n\n...[truncated at ${ARTIFACT_CONTENT_CAP_BYTES} bytes]`,
    truncated: true,
  };
}

function buildSystemPrompt(
  artifactMeta: ReturnType<typeof getArtifact>,
  body: string,
  truncated: boolean,
): string {
  const id = artifactMeta?.artifact_id ?? "unknown";
  const path = artifactMeta?.path ?? "unknown";
  const mime = artifactMeta?.mime ?? "unknown";
  const emitter = artifactMeta?.emitter ?? "unknown";
  const createdAt = artifactMeta?.created_at ?? "unknown";
  return [
    `You are a focused assistant answering questions about a specific artifact in the faro cockpit.`,
    `Artifact metadata:`,
    `  id:       ${id}`,
    `  path:     ${path}`,
    `  mime:     ${mime}`,
    `  emitter:  ${emitter}`,
    `  created:  ${createdAt}`,
    `  truncated: ${truncated ? "yes" : "no"}`,
    ``,
    `Artifact content follows between fences:`,
    `<<<ARTIFACT`,
    body,
    `ARTIFACT>>>`,
    ``,
    `Constraints:`,
    `- Answer in markdown.`,
    `- When citing, reference line numbers if you can; otherwise quote inline.`,
    `- Do not invent facts that are not present in the artifact content above.`,
    `- If the artifact is truncated, say so and offer to focus on a specific section.`,
  ].join("\n");
}

function formatSSE(event: ChatSSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: Request): Promise<Response> {
  let parsed: ChatRequestBody;
  try {
    parsed = (await req.json()) as ChatRequestBody;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  const artifactId = parsed.artifactId;
  if (typeof artifactId !== "string" || artifactId.length === 0) {
    return new Response("artifactId required", { status: 400 });
  }
  const messages = Array.isArray(parsed.messages) ? parsed.messages.filter(isUserMessage) : [];
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return new Response("at least one user message required", { status: 400 });
  }

  let artifactMeta: ReturnType<typeof getArtifact>;
  let body: string;
  let truncated: boolean;
  try {
    artifactMeta = getArtifact(artifactId);
    if (!artifactMeta) {
      return new Response(`artifact not found: ${artifactId}`, { status: 404 });
    }
    const loaded = await loadArtifactBody(artifactId);
    body = loaded.body;
    truncated = loaded.truncated;
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "failed to load artifact", {
      status: 500,
    });
  }

  const systemPrompt = buildSystemPrompt(artifactMeta, body, truncated);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of streamChat({
          systemPrompt,
          userMessage: lastUser.content,
          signal: req.signal,
        })) {
          controller.enqueue(encoder.encode(formatSSE(ev)));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(formatSSE({ type: "error", message })));
      } finally {
        controller.close();
      }
    },
    cancel() {
      // Caller aborted; the AbortSignal forwarded into streamChat propagates
      // into the SDK's underlying HTTP request via signalToController.
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
