"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  { id: "profile", label: "Open profile", hint: "lwiki", href: "/home" },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (!isCmdK) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
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
      </CommandList>
    </CommandDialog>
  );
}
