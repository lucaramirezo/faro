"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Chat } from "./Chat";

/**
 * Wraps the studio right-rail in a `Provenance | Chat` tab pair. The
 * Provenance pane is rendered upstream as an async RSC and passed in via
 * the `provenance` slot — this client component renders only the tab UI
 * around it.
 *
 * Phase 4.5 decision #5: tab choice persists per artifact in localStorage;
 * Chat messages persist there too (managed inside Chat.tsx).
 */
const STORAGE_KEY_PREFIX = "faro.studio.tab.";

interface ProvenanceTabsProps {
  artifactId: string;
  provenance: React.ReactNode;
}

type TabValue = "provenance" | "chat";

export function ProvenanceTabs({ artifactId, provenance }: ProvenanceTabsProps) {
  const [tab, setTab] = useState<TabValue>("provenance");

  // Hydrate from localStorage on artifact change.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + artifactId);
      if (raw === "chat" || raw === "provenance") setTab(raw);
      else setTab("provenance");
    } catch {
      setTab("provenance");
    }
  }, [artifactId]);

  function onChange(v: string) {
    if (v !== "chat" && v !== "provenance") return;
    setTab(v);
    try {
      window.localStorage.setItem(STORAGE_KEY_PREFIX + artifactId, v);
    } catch {
      // ignore storage quota issues
    }
  }

  return (
    <Tabs value={tab} onValueChange={onChange} className="h-full flex flex-col">
      <TabsList className="mx-3 mt-3 mb-1 self-start">
        <TabsTrigger value="provenance">Provenance</TabsTrigger>
        <TabsTrigger value="chat">Chat</TabsTrigger>
      </TabsList>
      <TabsContent value="provenance" className="flex-1 overflow-auto mt-0">
        {provenance}
      </TabsContent>
      <TabsContent value="chat" className="flex-1 overflow-auto mt-0 px-0">
        <Chat artifactId={artifactId} />
      </TabsContent>
    </Tabs>
  );
}
