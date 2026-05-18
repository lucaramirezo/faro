"use client";

// Sticky landing panel. Minimal by design. Behavior is injected by
// DockviewStudioShell via callbacks (decoupled from Server Actions / the
// Dockview api):
//   - onOpenGallery / onOpenBoard → shell openPanel()
//   - onOpenProject → opens a Project panel
//   - onCreateProject → createProjectAction (shell also opens the new project)
// The project LIST here is the minimal P2 project surface (bug #3) — read
// from /api/projects; richer project UX is P3.
import { useCallback, useEffect, useState } from "react";

export interface HomePanelProps {
  onOpenGallery: () => void;
  onOpenBoard: () => void;
  onOpenProject: (id: string, label?: string) => void;
  onCreateProject: (name: string) => void;
}

interface ProjectListRow {
  id: string;
  name: string;
}

export function HomePanel({
  onOpenGallery,
  onOpenBoard,
  onOpenProject,
  onCreateProject,
}: HomePanelProps) {
  const [name, setName] = useState("");
  const [projects, setProjects] = useState<ProjectListRow[]>([]);

  const refresh = useCallback(() => {
    fetch("/api/projects")
      .then((r) => (r.ok ? (r.json() as Promise<ProjectListRow[]>) : []))
      .then((rows) => setProjects(Array.isArray(rows) ? rows : []))
      .catch(() => {
        /* tailnet/transient — leave last list */
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="h-full overflow-auto p-8">
      <div className="mx-auto max-w-lg space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">faro · Control Station</h1>
          <p className="text-sm text-muted-foreground">
            Your workspace. Open the artifact gallery, watch the run board, or pick a project. Press{" "}
            <kbd className="rounded border border-border px-1">⌘P</kbd> to jump anywhere.
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

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Projects
          </h2>
          {projects.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              No projects yet — create one below.
            </p>
          ) : (
            <ul className="space-y-1">
              {projects.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onOpenProject(p.id, p.name)}
                    className="block w-full truncate rounded-md border border-border bg-card px-3 py-2 text-left text-sm hover:border-ring hover:bg-accent/40"
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            onCreateProject(trimmed);
            setName("");
            // give the action a beat to commit, then refresh the list.
            setTimeout(refresh, 400);
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
