"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const COMMANDS: Array<{
  id: string;
  label: string;
  hint: string;
  href: string;
}> = [
  { id: "home", label: "Go to Home", hint: "/home", href: "/home" },
  { id: "cost", label: "Go to Cost", hint: "/cost", href: "/cost" },
  { id: "dreams", label: "Go to Dreams", hint: "/dreams", href: "/dreams" },
  { id: "studio", label: "Open Studio", hint: "/studio", href: "/studio" },
  { id: "recommender", label: "Go to Recommender", hint: "/recommender", href: "/recommender" },
  { id: "skills", label: "Go to Skills", hint: "/skills", href: "/skills" },
  { id: "graph", label: "Go to Graph", hint: "/graph", href: "/graph" },
  { id: "memory", label: "Go to Memory", hint: "/memory", href: "/memory" },
  {
    id: "integrations",
    label: "Go to Integrations",
    hint: "/integrations",
    href: "/integrations",
  },
  { id: "scheduled", label: "Go to Scheduled", hint: "/scheduled", href: "/scheduled" },
  { id: "activity", label: "Go to Activity", hint: "/activity", href: "/activity" },
  { id: "settings", label: "Open Settings", hint: "/settings", href: "/settings" },
  { id: "profile", label: "Open profile", hint: "lwiki", href: "/home" },
];

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (!isCmdK) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    const onCustom = () => setOpen((v) => !v);
    document.addEventListener("keydown", onKey);
    window.addEventListener("faro:open-command-palette", onCustom);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("faro:open-command-palette", onCustom);
    };
  }, []);

  const onSelect = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const onCopyPrompt = (label: string) => {
    const text = `Open ${label} in faro`;
    void navigator.clipboard?.writeText(text);
    setOpen(false);
  };

  const onSendToClaudeCode = () => {
    const text = `In faro at ${pathname}, `;
    void navigator.clipboard?.writeText(text);
    toast.success("Prompt copied — paste into your Claude Code session");
    setOpen(false);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="faro command palette"
      description="Navigate or copy prompts"
    >
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No matching commands.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {COMMANDS.map((c) => (
            <CommandItem key={c.id} value={c.label} onSelect={() => onSelect(c.href)}>
              <span>{c.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">{c.hint}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Copy as prompt">
          {COMMANDS.map((c) => (
            <CommandItem
              key={`copy-${c.id}`}
              value={`Copy: ${c.label}`}
              onSelect={() => onCopyPrompt(c.label)}
            >
              <span>Copy "{c.label}" prompt</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Send to Claude Code">
          <CommandItem value="Send to Claude Code current context" onSelect={onSendToClaudeCode}>
            <span>Send to Claude Code (current context)</span>
            <span className="ml-auto text-xs text-muted-foreground">copy</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
