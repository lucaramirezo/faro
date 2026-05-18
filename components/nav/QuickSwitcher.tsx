"use client";

// ⌘P quick-switcher over projects + artifacts + runs. Mirrors CommandPalette
// (same cmdk primitives + dialog), but:
//  - opens on ⌘P / Ctrl+P (preventDefault → suppress the browser print dialog,
//    Task 13 GOTCHA) and on the CustomEvent "faro:open-quick-switch" — a
//    DIFFERENT event name than CommandPalette's "faro:open-command-palette"
//    (no collision; CommandPalette is left untouched).
//  - results come server-ranked from /api/switch (vendored scoreMatch); we set
//    `shouldFilter={false}` so cmdk preserves the server order and does NOT
//    re-fuzzy client-side. cmdk's built-in ↑/↓ (wrap) + Enter fulfil the
//    cursor-nav requirement — a manual nextCursor over a cmdk list would
//    fight the library; nextCursor stays the unit-tested pure primitive.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { SwitchTarget } from "@/lib/quick-switch";

const DEBOUNCE_MS = 150;

export function QuickSwitcher() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SwitchTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmdP = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p";
      if (!isCmdP) return;
      e.preventDefault(); // browsers bind ⌘P to print — must suppress
      setOpen((v) => !v);
    };
    const onCustom = () => setOpen((v) => !v);
    document.addEventListener("keydown", onKey);
    window.addEventListener("faro:open-quick-switch", onCustom);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("faro:open-quick-switch", onCustom);
    };
  }, []);

  // Debounced server search. Empty query → server returns recency order.
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      fetch(`/api/switch?q=${encodeURIComponent(query)}`, { signal: ac.signal })
        .then((r) => (r.ok ? (r.json() as Promise<SwitchTarget[]>) : []))
        .then((data) => setResults(Array.isArray(data) ? data : []))
        .catch(() => {
          /* aborted or transient — keep last results */
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [open, query]);

  // Reset transient state when closed.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      abortRef.current?.abort();
    }
  }, [open]);

  function onPick(t: SwitchTarget) {
    setOpen(false);
    if (t.type === "artifact") router.push(`/studio/${t.id}`);
    else if (t.type === "run") router.push(`/runs/${t.id}`);
    else router.push("/studio"); // project → the workspace (no project route in P2)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Quick switch"
      description="Jump to a project, artifact, or run"
    >
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Jump to a project, artifact, or run…"
        />
        <CommandList>
          <CommandEmpty>{loading ? "Searching…" : "No matches."}</CommandEmpty>
          <CommandGroup heading="Results">
            {results.map((t) => (
              <CommandItem
                key={`${t.type}:${t.id}`}
                value={`${t.type}:${t.id}`}
                onSelect={() => onPick(t)}
              >
                <span className="truncate">{t.label}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {t.type} · {t.sublabel}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
