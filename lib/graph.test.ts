import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildKnowledgeGraph } from "@/lib/graph";

let tmpAgentRoot: string;

async function writeFile(rel: string, content: string): Promise<void> {
  const full = path.join(tmpAgentRoot, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf8");
}

beforeEach(async () => {
  tmpAgentRoot = await fs.mkdtemp(path.join(os.tmpdir(), "faro-graph-"));
});

afterEach(async () => {
  await fs.rm(tmpAgentRoot, { recursive: true, force: true });
});

describe("buildKnowledgeGraph", () => {
  it("builds nodes from memory and wiki and edges from outbound wikilinks", async () => {
    // Memory layer: a → wiki page b
    await writeFile("memory/a.md", "# A\n\nReferences [[b]].\n");
    // Wiki layer: b → wiki page c
    await writeFile("wiki/b.md", "# B\n\nLinks to [[c]].\n");
    await writeFile("wiki/c.md", "# C\n\nLeaf node.\n");

    const data = await buildKnowledgeGraph({ agentRoot: tmpAgentRoot });
    expect(data.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
    expect(data.edges).toHaveLength(2);
    const edgePairs = data.edges.map((e) => `${e.source}->${e.target}`).sort();
    expect(edgePairs).toEqual(["a->b", "b->c"]);
    expect(data.brokenLinks).toBe(0);
  });

  it("skips broken wikilinks and counts them", async () => {
    await writeFile("memory/a.md", "# A\n\nReferences [[b]] and [[missing-target]].\n");
    await writeFile("wiki/b.md", "# B\n\nLeaf.\n");

    const data = await buildKnowledgeGraph({ agentRoot: tmpAgentRoot });
    expect(data.brokenLinks).toBe(1);
    expect(data.edges).toHaveLength(1);
    expect(data.edges[0]).toMatchObject({ source: "a", target: "b" });
  });

  it("tags memory and wiki nodes with their kind + brand colors", async () => {
    await writeFile("memory/a.md", "# A\n\nLinks to [[b]].\n");
    await writeFile("wiki/b.md", "# B\n");

    const data = await buildKnowledgeGraph({ agentRoot: tmpAgentRoot });
    const a = data.nodes.find((n) => n.id === "a");
    const b = data.nodes.find((n) => n.id === "b");
    expect(a?.kind).toBe("memory");
    expect(a?.color).toBe("#D97757");
    expect(b?.kind).toBe("wiki");
    expect(b?.color).toBe("#10A37F");
  });

  it("dedupes edges and aggregates weight on repeated wikilinks", async () => {
    await writeFile("memory/a.md", "# A\n\nFirst [[b]]. Then [[b]] again. And once more [[b]].\n");
    await writeFile("wiki/b.md", "# B\n");

    const data = await buildKnowledgeGraph({ agentRoot: tmpAgentRoot });
    expect(data.edges).toHaveLength(1);
    // outboundLinks dedupes via Set so weight==1, not 3 — confirm the contract.
    expect(data.edges[0].weight).toBe(1);
  });
});
