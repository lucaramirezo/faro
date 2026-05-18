"use client";

// The Dockview host. Mounted by studio/page.tsx via next/dynamic({ssr:false}).
//
// LOAD-BEARING INVARIANTS (do not regress):
//  - `renderer:'always'` on run + artifact panels. Dockview's default
//    'onlyWhenVisible' UNMOUNTS inactive panels — that would tear down
//    RunView's SSE, the 4.5 Chat stream, and reload the highlight-bridge
//    iframe on every tab switch. This is the #1 regression risk.
//  - Sticky Home = composition: a `hideClose` tab + its group `.locked` +
//    code that NEVER removePanel('home:main') + buildDefaultLayout always
//    re-adds it. There is no single "pinned" boolean.
//  - RSC nodes (galleryNode / activeArtifact.{provenance,code}) arrive as
//    PROPS and are captured by the component closures via a live ref. They
//    are NEVER placed in Dockview `params` (params are JSON-serialized by
//    toJSON — they hold only string ids: { runId } / { artifactId }).
//  - CSP is already fine (proxy.ts ships style-src 'self' 'unsafe-inline',
//    covering Dockview's runtime element.style writes). No popout/floating.
import "dockview/dist/styles/dockview.css";

import {
  type DockviewApi,
  DockviewDefaultTab,
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
  type SerializedDockview,
  themeDark,
} from "dockview";
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { createProjectAction, persistStudioLayoutAction } from "@/app/actions/projects";
import { Board, type BoardRun } from "@/components/studio/Board";
import { ArtifactPanel } from "@/components/studio/panels/ArtifactPanel";
import { GalleryPanel } from "@/components/studio/panels/GalleryPanel";
import { HomePanel } from "@/components/studio/panels/HomePanel";
import { ProjectPanel } from "@/components/studio/panels/ProjectPanel";
import { RunPanel } from "@/components/studio/panels/RunPanel";
import type { Artifact } from "@/lib/artifacts-types";

export interface ActiveArtifact {
  artifact: Artifact;
  provenanceNode: ReactNode;
  codeNode: ReactNode;
}

export interface ShellProps {
  initialLayout: unknown | null;
  galleryNode: ReactNode;
  boardRuns: BoardRun[];
  activeArtifact?: ActiveArtifact | null;
}

type PanelKind = "home" | "gallery" | "board" | "artifact" | "run" | "project";

const PERSIST_DEBOUNCE_MS = 400;

export default function DockviewStudioShell({
  initialLayout,
  galleryNode,
  boardRuns,
  activeArtifact,
}: ShellProps) {
  // Dockview caches the `components` map by identity — it MUST be stable
  // across renders, yet panels must see fresh RSC nodes / board rows. The
  // static components read live data through this ref.
  const live = useRef({ galleryNode, boardRuns, activeArtifact });
  live.current = { galleryNode, boardRuns, activeArtifact };

  const apiRef = useRef<DockviewApi | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);

  // Layout model (locked 2026-05-18): LEFT group = sticky Home + Gallery
  // (locked, non-rearrangeable). RIGHT/work group = Board + Run + the single
  // Artifact panel. Gallery clicks therefore open the artifact in the BIG
  // right pane, not the narrow Gallery pane (bug #2).
  const ARTIFACT_PID = "artifact:single";

  // Where a panel of a given kind belongs.
  const targetFor = useCallback((api: DockviewApi, kind: PanelKind) => {
    const home = api.getPanel("home:main");
    if (kind === "gallery") {
      // Gallery belongs beside Home in the left group.
      return home ? { referenceGroup: home.api.group } : undefined;
    }
    // board / run / artifact / project → the work (right/big) group, anchored
    // on Board; if Board is gone, open a fresh group right of Home.
    const board = api.getPanel("board:main");
    if (board) return { referenceGroup: board.api.group };
    return home ? { referenceGroup: home.api.group, direction: "right" as const } : undefined;
  }, []);

  const openPanel = useCallback(
    (kind: PanelKind, id: string, params: Record<string, string>, title: string) => {
      const api = apiRef.current;
      if (!api) return;
      const pid = `${kind}:${id}`;
      const existing = api.getPanel(pid);
      if (existing) {
        existing.api.setActive(); // dedupe → focus, never duplicate
        return;
      }
      api.addPanel({
        id: pid,
        component: kind,
        title,
        params,
        // run stays mounted across tab switches (SSE survival, #1 guard).
        renderer: kind === "run" ? "always" : "onlyWhenVisible",
        position: targetFor(api, kind),
      });
    },
    [targetFor],
  );

  // Single canonical Artifact panel bound to the ROUTE artifact (locked P2
  // scope refinement — NOT N artifact:<id> panels sharing one prop, which
  // produced the "no artifact selected" ghost tabs, bug #4). On navigation we
  // updateParameters() so Dockview re-renders it against the fresh
  // live.current.activeArtifact; when the route has no artifact we close it.
  const syncArtifactPanel = useCallback(
    (api: DockviewApi, routeArtifactId: string | null) => {
      const a = live.current.activeArtifact;
      const existing = api.getPanel(ARTIFACT_PID);
      if (routeArtifactId && a) {
        if (existing) {
          existing.api.updateParameters({ artifactId: routeArtifactId });
          existing.api.setActive();
        } else {
          api.addPanel({
            id: ARTIFACT_PID,
            component: "artifact",
            title: a.artifact.label ?? "Artifact",
            params: { artifactId: routeArtifactId },
            renderer: "always", // keep Chat/highlight-bridge mounted (#1 guard)
            position: targetFor(api, "artifact"),
          });
        }
      } else if (existing) {
        existing.api.close(); // no ghost "no artifact selected" tab
      }
    },
    [targetFor],
  );

  const openRun = useCallback(
    (runId: string) => openPanel("run", runId, { runId }, `Run ${runId.slice(0, 8)}`),
    [openPanel],
  );
  const openGallery = useCallback(() => openPanel("gallery", "main", {}, "Gallery"), [openPanel]);
  const openBoard = useCallback(() => openPanel("board", "main", {}, "Board"), [openPanel]);
  const openProject = useCallback(
    (id: string, label?: string) => openPanel("project", id, { projectId: id }, label ?? "Project"),
    [openPanel],
  );
  // Create → immediately OPEN the project panel (the operator created it to
  // use it — bug #3: a created project must be visible, not invisible).
  const onCreateProject = useCallback(
    async (name: string) => {
      const res = await createProjectAction(name);
      if (res.ok) openProject(res.project.id, res.project.name);
    },
    [openProject],
  );

  const components = useMemo(
    () => ({
      home: () => (
        <HomePanel
          onOpenGallery={openGallery}
          onOpenBoard={openBoard}
          onOpenProject={openProject}
          onCreateProject={onCreateProject}
        />
      ),
      gallery: () => <GalleryPanel node={live.current.galleryNode} />,
      board: () => <Board runs={live.current.boardRuns} onOpenRun={openRun} />,
      project: (props: IDockviewPanelProps<{ projectId: string }>) => (
        <ProjectPanel projectId={props.params.projectId} onOpenRun={openRun} />
      ),
      artifact: () => {
        const a = live.current.activeArtifact;
        if (!a) {
          return <div className="p-6 text-sm text-muted-foreground">No artifact selected.</div>;
        }
        return (
          <ArtifactPanel
            artifact={a.artifact}
            provenance={a.provenanceNode}
            codeNode={a.codeNode}
          />
        );
      },
      run: (props: IDockviewPanelProps<{ runId: string }>) => (
        <RunPanel runId={props.params.runId} />
      ),
    }),
    [openGallery, openBoard, onCreateProject, openRun, openProject],
  );

  const tabComponents = useMemo(
    () => ({
      homeTab: (props: IDockviewPanelHeaderProps) => <DockviewDefaultTab hideClose {...props} />,
    }),
    [],
  );

  const ensureStickyHome = useCallback((api: DockviewApi) => {
    let home = api.getPanel("home:main");
    if (!home) {
      api.addPanel({
        id: "home:main",
        component: "home",
        tabComponent: "homeTab",
        title: "Home",
      });
      home = api.getPanel("home:main");
    }
    if (home) home.api.group.locked = true;
  }, []);

  const buildDefaultLayout = useCallback(
    (api: DockviewApi) => {
      api.addPanel({
        id: "home:main",
        component: "home",
        tabComponent: "homeTab",
        title: "Home",
      });
      // Gallery tabs INTO Home's group (no position → the just-activated
      // Home group) → sticky Home + Gallery share the left pane.
      api.addPanel({ id: "gallery:main", component: "gallery", title: "Gallery" });
      // Board opens the big work group to the RIGHT; Run + the single
      // Artifact panel land here too (targetFor → Board's group).
      api.addPanel({
        id: "board:main",
        component: "board",
        title: "Board",
        position: { direction: "right" },
      });
      ensureStickyHome(api);
    },
    [ensureStickyHome],
  );

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const api = event.api;
      apiRef.current = api;

      let restored = false;
      if (initialLayout && typeof initialLayout === "object") {
        try {
          api.fromJSON(initialLayout as SerializedDockview);
          restored = api.panels.length > 0;
        } catch {
          restored = false;
        }
      }
      if (!restored) {
        api.clear();
        buildDefaultLayout(api);
      } else {
        // Restored layouts must still honor the sticky-Home invariant.
        ensureStickyHome(api);
      }

      // Bind the single Artifact panel from the route (locked P2 scope).
      syncArtifactPanel(api, live.current.activeArtifact?.artifact.artifact_id ?? null);

      const disposable = api.onDidLayoutChange(() => {
        if (persistTimer.current) clearTimeout(persistTimer.current);
        persistTimer.current = setTimeout(() => {
          try {
            void persistStudioLayoutAction(JSON.stringify(api.toJSON()));
          } catch {
            // never let a persistence failure surface to the operator
          }
        }, PERSIST_DEBOUNCE_MS);
      });
      disposeRef.current = () => disposable.dispose();
    },
    [initialLayout, buildDefaultLayout, ensureStickyHome, syncArtifactPanel],
  );

  // Re-bind the single Artifact panel whenever the route artifact changes
  // (navigation re-renders the shell with a new activeArtifact). The id is
  // the trigger AND the value used; the rich RSC nodes ride live.current.
  const routeArtifactId = activeArtifact?.artifact.artifact_id ?? null;
  useEffect(() => {
    const api = apiRef.current;
    if (api) syncArtifactPanel(api, routeArtifactId);
  }, [routeArtifactId, syncArtifactPanel]);

  // ⌘P (QuickSwitcher) dispatches faro:open-project for a project hit — the
  // shell owns the Dockview api, so it opens the Project panel here (bug #3:
  // project-click was a silent router.push no-op).
  useEffect(() => {
    const onOpenProjectEvt = (e: Event) => {
      const d = (e as CustomEvent<{ id?: string; label?: string }>).detail;
      if (d?.id) openProject(d.id, d.label);
    };
    window.addEventListener("faro:open-project", onOpenProjectEvt);
    return () => window.removeEventListener("faro:open-project", onOpenProjectEvt);
  }, [openProject]);

  useEffect(() => {
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
      disposeRef.current?.();
    };
  }, []);

  return (
    <div className="h-[calc(100vh-48px)] min-h-0">
      <DockviewReact
        components={components}
        tabComponents={tabComponents}
        theme={themeDark}
        onReady={onReady}
      />
    </div>
  );
}
