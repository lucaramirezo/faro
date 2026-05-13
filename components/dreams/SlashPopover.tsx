"use client";

import { useEffect, useRef, useState } from "react";
import { filterCommands, type SlashCommand } from "@/lib/slash-commands";
import { cn } from "@/lib/utils";

/**
 * Bespoke slash-command palette. No `cmdk`.
 *
 * The parent decides WHEN to render (typically by calling `detectSlash` on
 * the textarea value at the caret) and positions the popover above the
 * textarea via a `relative` wrapper — anchoring at the caret would require
 * a mirror-div for coord measurement and isn't worth the complexity per the
 * open-design reference (apps/web/src/components/ChatComposer.tsx:170-383).
 *
 * The popover manages its own active index and a window-level keydown
 * listener (ArrowUp/Down to navigate, Enter/Tab to select, Esc to close).
 * Selection routes through `onSelect`; the parent applies the textual
 * insert + closes the popover.
 */
interface SlashPopoverProps {
  query: string;
  open: boolean;
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
}

export function SlashPopover({ query, open, onSelect, onClose }: SlashPopoverProps) {
  const commands = filterCommands(query);
  const [activeIdx, setActiveIdx] = useState(0);
  const prevQuery = useRef(query);
  if (prevQuery.current !== query) {
    prevQuery.current = query;
    if (activeIdx !== 0) setActiveIdx(0);
  }

  const idx = Math.min(activeIdx, Math.max(commands.length - 1, 0));

  useEffect(() => {
    if (!open) return;
    function handle(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, commands.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (commands.length > 0) {
          e.preventDefault();
          onSelect(commands[idx]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handle, true);
    return () => window.removeEventListener("keydown", handle, true);
  }, [open, commands, idx, onSelect, onClose]);

  if (!open) return null;

  if (commands.length === 0) {
    return (
      <div className="rounded-md border border-border bg-popover/95 backdrop-blur-sm px-3 py-2 text-xs text-muted-foreground shadow-md">
        No matching command. Press Esc.
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Slash commands"
      className="rounded-md border border-border bg-popover/95 backdrop-blur-sm shadow-md max-h-64 overflow-auto py-1"
    >
      {commands.map((c, i) => (
        <button
          key={c.id}
          type="button"
          role="option"
          aria-selected={i === idx}
          tabIndex={-1}
          className={cn(
            "w-full px-3 py-1.5 cursor-pointer flex items-baseline justify-between gap-3 text-xs text-left",
            i === idx ? "bg-accent text-accent-foreground" : "hover:bg-muted/50",
          )}
          onMouseEnter={() => setActiveIdx(i)}
          onFocus={() => setActiveIdx(i)}
          onMouseDown={(e) => {
            // Prevent blur on the textarea so caret position survives the
            // insertion; click would land after blur and lose the caret.
            e.preventDefault();
            onSelect(c);
          }}
        >
          <span className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">/{c.id}</span>
            {c.argHint && (
              <span className="font-mono text-[10px] text-muted-foreground/60">{c.argHint}</span>
            )}
          </span>
          <span className="text-muted-foreground truncate">{c.description}</span>
        </button>
      ))}
    </div>
  );
}
