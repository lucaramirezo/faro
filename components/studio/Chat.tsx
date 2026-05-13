"use client";

import { type ChangeEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToolCard, type ToolCardProps } from "./ToolCard";

/**
 * Studio Chat tab (Phase 4.5 C3) — Sonnet conversation scoped to one artifact.
 *
 * Streams SSE envelopes from `POST /api/chat`. EventSource doesn't support
 * POST, so we use `fetch` + a manual ReadableStream reader. Each SSE frame
 * `data: <json>\n\n` decodes into a `ChatSSEEvent` envelope.
 *
 * Per Phase 4.5 decision #5, messages persist to localStorage keyed by
 * artifact id; the parent ProvenanceTabs clears the key when the artifact
 * is promoted.
 */
type Role = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  /** Inline tool-use cards keyed by toolUseId. */
  tools?: Record<string, ToolCardProps>;
}

interface ChatProps {
  artifactId: string;
}

const STORAGE_KEY_PREFIX = "faro.chat.";

function storageKey(artifactId: string): string {
  return STORAGE_KEY_PREFIX + artifactId;
}

export function Chat({ artifactId }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Hydrate from localStorage on artifact change.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(artifactId));
      setMessages(raw ? (JSON.parse(raw) as ChatMessage[]) : []);
    } catch {
      setMessages([]);
    }
  }, [artifactId]);

  // Persist on change.
  useEffect(() => {
    try {
      if (messages.length === 0) {
        window.localStorage.removeItem(storageKey(artifactId));
      } else {
        window.localStorage.setItem(storageKey(artifactId), JSON.stringify(messages));
      }
    } catch {
      // localStorage quota or disabled — chat keeps working in-memory.
    }
  }, [messages, artifactId]);

  // Auto-scroll on new content.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || pending) return;
    setInput("");
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    const assistantMsgId = `a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantMsgId, role: "assistant", content: "", tools: {} },
    ]);
    setPending(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artifactId,
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`chat: ${res.status} ${await res.text().catch(() => "")}`);
      }
      await readSSE(res.body, (event) => applyEvent(event, assistantMsgId));
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        appendErrorTo(assistantMsgId, err.message);
      }
    } finally {
      setPending(false);
      abortRef.current = null;
    }
  }

  function applyEvent(event: unknown, assistantMsgId: string) {
    if (!event || typeof event !== "object") return;
    const ev = event as { type?: string };
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== assistantMsgId) return m;
        if (ev.type === "token") {
          const e = event as { text: string };
          return { ...m, content: m.content + e.text };
        }
        if (ev.type === "tool_use") {
          const e = event as { tool: string; args: unknown; toolUseId: string };
          return {
            ...m,
            tools: {
              ...(m.tools ?? {}),
              [e.toolUseId]: {
                toolUseId: e.toolUseId,
                name: e.tool,
                args: e.args,
              },
            },
          };
        }
        if (ev.type === "tool_result") {
          const e = event as { toolUseId: string; result: string; isError: boolean };
          const prevCard = m.tools?.[e.toolUseId];
          if (!prevCard) return m;
          return {
            ...m,
            tools: {
              ...m.tools,
              [e.toolUseId]: { ...prevCard, result: e.result, isError: e.isError },
            },
          };
        }
        if (ev.type === "error") {
          const e = event as { message: string };
          return { ...m, content: `${m.content}\n\n[error: ${e.message}]` };
        }
        return m;
      }),
    );
  }

  function appendErrorTo(assistantMsgId: string, message: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMsgId ? { ...m, content: `${m.content}\n\n[error: ${message}]` } : m,
      ),
    );
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      send();
    }
  }

  function onChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
  }

  function onClear() {
    if (pending) abortRef.current?.abort();
    setMessages([]);
  }

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            Ask anything about this artifact. ⌘↩ to send.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.role}</p>
            {m.tools && Object.values(m.tools).map((t) => <ToolCard key={t.toolUseId} {...t} />)}
            {m.content && (
              <div className="text-xs whitespace-pre-wrap leading-snug">{m.content}</div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-border p-3 space-y-2">
        <Textarea
          rows={3}
          value={input}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder="Ask about this artifact… (⌘↩ to send)"
          disabled={pending}
          className="resize-none"
        />
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={pending && !abortRef.current}
          >
            {pending ? "Stop" : "Clear"}
          </Button>
          <Button size="sm" onClick={send} disabled={pending || input.trim().length === 0}>
            {pending ? "Streaming…" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Read an SSE `text/event-stream` body, parsing `data: <json>\n\n` frames
 * and forwarding each decoded envelope to `onEvent`. Tolerant of split
 * chunks across reader boundaries.
 */
async function readSSE(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: unknown) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf("\n\n");
    while (idx !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (data) {
        try {
          onEvent(JSON.parse(data));
        } catch {
          // Skip malformed frames silently — the SSE producer is trusted.
        }
      }
      idx = buffer.indexOf("\n\n");
    }
  }
}
