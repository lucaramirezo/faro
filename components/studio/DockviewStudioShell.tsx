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

type PanelKind = "home" | "gallery" | "board" | "artifact" | "run";

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
        // run + artifact stay mounted across tab switches (SSE / Chat /
        // highlight-bridge iframe survival). The #1 regression guard.
        renderer: kind === "run" || kind === "artifact" ? "always" : "onlyWhenVisible",
        position: api.activeGroup ? { referenceGroup: api.activeGroup } : { direction: "within" },
      });
    },
    [],
  );

  const openRun = useCallback(
    (runId: string) => openPanel("run", runId, { runId }, `Run ${runId.slice(0, 8)}`),
    [openPanel],
  );
  const openGallery = useCallback(() => openPanel("gallery", "main", {}, "Gallery"), [openPanel]);
  const openBoard = useCallback(() => openPanel("board", "main", {}, "Board"), [openPanel]);
  const onCreateProject = useCallback((name: string) => {
    void createProjectAction(name);
  }, []);

  const components = useMemo(
    () => ({
      home: () => (
        <HomePanel
          onOpenGallery={openGallery}
          onOpenBoard={openBoard}
          onCreateProject={onCreateProject}
        />
      ),
      gallery: () => <GalleryPanel node={live.current.galleryNode} />,
      board: () => <Board runs={live.current.boardRuns} onOpenRun={openRun} />,
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
    [openGallery, openBoard, onCreateProject, openRun],
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
      api.addPanel({
        id: "gallery:main",
        component: "gallery",
        title: "Gallery",
        position: { direction: "right" },
      });
      api.addPanel({ id: "board:main", component: "board", title: "Board" });
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

      // Bind the single active Artifact panel from the route (P2 scope:
      // one Artifact panel bound to the route artifactId; switching = nav).
      const a = live.current.activeArtifact;
      if (a) {
        openPanel(
          "artifact",
          a.artifact.artifact_id,
          { artifactId: a.artifact.artifact_id },
          a.artifact.label ?? "Artifact",
        );
      }

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
    [initialLayout, buildDefaultLayout, ensureStickyHome, openPanel],
  );

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
