"use client";

// Sticky landing panel. Intentionally minimal (plan: "Keep tiny"). All
// behavior is injected by DockviewStudioShell via callbacks so this stays
// decoupled from the Server Actions / Dockview api:
//   - onOpenGallery / onOpenBoard → shell openPanel()
//   - onCreateProject → createProjectAction (wired in the shell)
import { useState } from "react";

export interface HomePanelProps {
  onOpenGallery: () => void;
  onOpenBoard: () => void;
  onCreateProject: (name: string) => void;
}

export function HomePanel({ onOpenGallery, onOpenBoard, onCreateProject }: HomePanelProps) {
  const [name, setName] = useState("");

  return (
    <div className="h-full overflow-auto p-8">
      <div className="mx-auto max-w-lg space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">faro · Control Station</h1>
          <p className="text-sm text-muted-foreground">
            Your workspace. Open the artifact gallery, watch the run board, or start a project.
            Press <kbd className="rounded border border-border px-1">⌘P</kbd> to jump anywhere.
          </p>
        </header>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onOpenGallery}
            className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/80"
          >
            Open Gallery
          </button>
          <button
            type="button"
            onClick={onOpenBoard}
            className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/80"
          >
            Open Board
          </button>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            onCreateProject(trimmed);
            setName("");
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New project name…"
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
          >
            Create
          </button>
        </form>
      </div>
    </div>
  );
}
