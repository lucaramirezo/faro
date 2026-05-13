"use client";

import "@react-sigma/core/lib/react-sigma.min.css";
import { SigmaContainer, useLoadGraph, useRegisterEvents, useSigma } from "@react-sigma/core";
import Graph from "graphology";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import { useEffect, useMemo } from "react";
import type { GraphData, GraphNode } from "@/lib/graph";

interface GraphViewProps {
  data: GraphData;
  vaultName?: string;
  agentRoot: string;
}

interface NodeAttrs {
  label: string;
  x: number;
  y: number;
  size: number;
  color: string;
  kind: "memory" | "wiki";
  path: string;
}

interface EdgeAttrs {
  weight: number;
  size: number;
  color: string;
}

const EDGE_COLOR = "rgba(160, 160, 160, 0.35)";

function buildGraph(data: GraphData): Graph<NodeAttrs, EdgeAttrs> {
  const g = new Graph<NodeAttrs, EdgeAttrs>({ multi: false, type: "undirected" });
  for (const n of data.nodes) addNode(g, n);
  for (const e of data.edges) {
    if (!g.hasNode(e.source) || !g.hasNode(e.target)) continue;
    if (g.hasEdge(e.source, e.target)) continue;
    g.addEdge(e.source, e.target, {
      weight: e.weight,
      size: Math.max(0.5, Math.min(3, e.weight)),
      color: EDGE_COLOR,
    });
  }
  return g;
}

function addNode(g: Graph<NodeAttrs, EdgeAttrs>, n: GraphNode): void {
  if (g.hasNode(n.id)) return;
  g.addNode(n.id, {
    label: n.label,
    x: n.x,
    y: n.y,
    size: n.size,
    color: n.color,
    kind: n.kind,
    path: n.path,
  });
}

function GraphLoader({ graph }: { graph: Graph<NodeAttrs, EdgeAttrs> }) {
  const loadGraph = useLoadGraph<NodeAttrs, EdgeAttrs>();
  useEffect(() => {
    loadGraph(graph, true);
  }, [graph, loadGraph]);
  return null;
}

function FA2WorkerRunner({ graph }: { graph: Graph<NodeAttrs, EdgeAttrs> }) {
  useEffect(() => {
    const layout = new FA2Layout(graph, {
      settings: {
        gravity: 1,
        scalingRatio: 8,
        slowDown: 5,
        barnesHutOptimize: graph.order > 80,
      },
    });
    layout.start();
    // Auto-stop after ~5s — by then 100-node graph is converged.
    const stopTimer = setTimeout(() => layout.stop(), 5000);
    return () => {
      clearTimeout(stopTimer);
      layout.kill();
    };
  }, [graph]);
  return null;
}

function EventBridge({ vaultName, agentRoot }: { vaultName: string; agentRoot: string }) {
  const sigma = useSigma<NodeAttrs, EdgeAttrs>();
  const registerEvents = useRegisterEvents();
  useEffect(() => {
    registerEvents({
      clickNode: ({ node }) => {
        const attrs = sigma.getGraph().getNodeAttributes(node);
        if (!attrs?.path) return;
        // The path is absolute; obsidian needs it relative to vault root.
        const rel = attrs.path.startsWith(agentRoot)
          ? attrs.path.slice(agentRoot.length).replace(/^\/+/, "")
          : attrs.path;
        const url = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(rel)}`;
        window.open(url, "_blank");
      },
    });
  }, [registerEvents, sigma, vaultName, agentRoot]);
  return null;
}

export function GraphView({ data, vaultName = "lwiki", agentRoot }: GraphViewProps) {
  const graph = useMemo(() => buildGraph(data), [data]);
  return (
    <SigmaContainer
      style={{ height: "calc(100vh - 240px)", width: "100%" }}
      settings={{
        labelDensity: 0.4,
        labelGridCellSize: 60,
        labelRenderedSizeThreshold: 6,
        defaultEdgeColor: EDGE_COLOR,
        renderEdgeLabels: false,
      }}
    >
      <GraphLoader graph={graph} />
      <FA2WorkerRunner graph={graph} />
      <EventBridge vaultName={vaultName} agentRoot={agentRoot} />
    </SigmaContainer>
  );
}
