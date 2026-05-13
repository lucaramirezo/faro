"use client";

import { cn } from "@/lib/utils";

/**
 * AG-UI four-state tool-call card.
 *
 * Phase 4.5 C3: registry-shaped renderer so the chat stream can map any
 * `tool_use` envelope to a specialized renderer per tool name. v1 ships
 * the default renderer + presets for Read/Write/Bash (the Claude Code
 * built-ins faro is most likely to surface once tools are turned on).
 *
 * Chat.tsx pairs a `tool_use` envelope with a later `tool_result` envelope
 * by `toolUseId`. Status maps:
 *
 *   inProgress / executing  → blue (the tool is still running)
 *   complete                → green (result attached, no error)
 *   error                   → red   (result attached AND `is_error`)
 */
export type ToolStatus = "inProgress" | "executing" | "complete" | "error";

export interface ToolCardProps {
  toolUseId: string;
  name: string;
  args: unknown;
  result?: string;
  isError?: boolean;
}

type ToolRenderer = (props: ToolCardProps) => React.ReactNode;

function statusFromProps(p: ToolCardProps): ToolStatus {
  if (p.isError) return "error";
  if (p.result !== undefined) return "complete";
  return "inProgress";
}

function StatusDot({ status }: { status: ToolStatus }) {
  const color =
    status === "error"
      ? "bg-red-500"
      : status === "complete"
        ? "bg-green-500"
        : "bg-blue-500 animate-pulse";
  return <span aria-hidden className={cn("inline-block h-2 w-2 rounded-full", color)} />;
}

function StatusLabel({ status }: { status: ToolStatus }) {
  const label =
    status === "error"
      ? "error"
      : status === "complete"
        ? "complete"
        : status === "executing"
          ? "running"
          : "queued";
  return <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>;
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs my-1 space-y-1.5">
      {children}
    </div>
  );
}

const DefaultRenderer: ToolRenderer = (p) => {
  const status = statusFromProps(p);
  return (
    <CardShell>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <span className="font-mono text-[11px]">{p.name}</span>
        </div>
        <StatusLabel status={status} />
      </div>
      <pre className="font-mono text-[10px] text-muted-foreground whitespace-pre-wrap break-all">
        {typeof p.args === "string" ? p.args : JSON.stringify(p.args, null, 2)}
      </pre>
      {p.result !== undefined && (
        <pre
          className={cn(
            "font-mono text-[10px] whitespace-pre-wrap break-all rounded-sm bg-background/60 p-1.5",
            p.isError ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
          )}
        >
          {p.result.slice(0, 2000)}
          {p.result.length > 2000 && "\n…[truncated]"}
        </pre>
      )}
    </CardShell>
  );
};

const ReadRenderer: ToolRenderer = (p) => {
  const args = p.args as { path?: string } | undefined;
  return (
    <CardShell>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusDot status={statusFromProps(p)} />
          <span className="font-mono text-[11px]">Read</span>
          <span className="font-mono text-[10px] text-muted-foreground">{args?.path ?? "—"}</span>
        </div>
        <StatusLabel status={statusFromProps(p)} />
      </div>
      {p.result !== undefined && (
        <pre className="font-mono text-[10px] text-muted-foreground whitespace-pre-wrap break-all rounded-sm bg-background/60 p-1.5">
          {p.result.slice(0, 1200)}
          {p.result.length > 1200 && "\n…[truncated]"}
        </pre>
      )}
    </CardShell>
  );
};

const BashRenderer: ToolRenderer = (p) => {
  const args = p.args as { command?: string } | undefined;
  return (
    <CardShell>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusDot status={statusFromProps(p)} />
          <span className="font-mono text-[11px]">Bash</span>
        </div>
        <StatusLabel status={statusFromProps(p)} />
      </div>
      <pre className="font-mono text-[10px] text-foreground whitespace-pre-wrap break-all rounded-sm bg-background/60 p-1.5">
        $ {args?.command ?? ""}
      </pre>
      {p.result !== undefined && (
        <pre
          className={cn(
            "font-mono text-[10px] whitespace-pre-wrap break-all rounded-sm bg-background/60 p-1.5",
            p.isError ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
          )}
        >
          {p.result.slice(0, 1200)}
          {p.result.length > 1200 && "\n…[truncated]"}
        </pre>
      )}
    </CardShell>
  );
};

const RENDERERS: Record<string, ToolRenderer> = {
  Read: ReadRenderer,
  Write: DefaultRenderer,
  Bash: BashRenderer,
};

export function ToolCard(props: ToolCardProps) {
  const Renderer = RENDERERS[props.name] ?? DefaultRenderer;
  return <Renderer {...props} />;
}
