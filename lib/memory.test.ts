import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getMemoryPages } from "@/lib/memory";

let tmpAgentRoot: string;

async function seed(): Promise<void> {
  const memoryDir = path.join(tmpAgentRoot, "memory");
  const wikiDir = path.join(tmpAgentRoot, "wiki");
  await fs.mkdir(memoryDir, { recursive: true });
  await fs.mkdir(wikiDir, { recursive: true });

  const fixtureBase = path.resolve(__dirname, "..", "test", "fixtures");
  await fs.copyFile(
    path.join(fixtureBase, "memory", "example-memory.md"),
    path.join(memoryDir, "example-memory.md"),
  );
  await fs.copyFile(
    path.join(fixtureBase, "memory", "malformed-yaml.md"),
    path.join(memoryDir, "malformed-yaml.md"),
  );
  await fs.copyFile(
    path.join(fixtureBase, "wiki", "example-wiki-a.md"),
    path.join(wikiDir, "example-wiki-a.md"),
  );
  await fs.copyFile(
    path.join(fixtureBase, "wiki", "example-wiki-b.md"),
    path.join(wikiDir, "example-wiki-b.md"),
  );
}

beforeEach(async () => {
  tmpAgentRoot = await fs.mkdtemp(path.join(os.tmpdir(), "faro-memory-"));
  await seed();
});

afterEach(async () => {
  await fs.rm(tmpAgentRoot, { recursive: true, force: true });
});

describe("getMemoryPages", () => {
  it("parses frontmatter keys into the page record", async () => {
    const pages = await getMemoryPages({ agentRoot: tmpAgentRoot });
    const example = pages.find((p) => p.slug === "example-memory");
    expect(example).toBeDefined();
    expect(example?.frontmatter.role).toBe("lwiki agent");
    expect(example?.title).toBe("Example memory");
  });

  it("extracts outbound wikilinks deduped", async () => {
    const pages = await getMemoryPages({ agentRoot: tmpAgentRoot });
    const example = pages.find((p) => p.slug === "example-memory");
    expect(example?.outboundLinks.sort()).toEqual(
      ["example-wiki-a", "example-wiki-b", "missing-target"].sort(),
    );
  });

  it("collects inbound backlinks from wiki/ for the matched slug", async () => {
    const pages = await getMemoryPages({ agentRoot: tmpAgentRoot });
    const example = pages.find((p) => p.slug === "example-memory");
    expect(example?.inboundBacklinks).toHaveLength(2);
    expect(example?.inboundBacklinks.map((b) => b.sourceSlug).sort()).toEqual([
      "example-wiki-a",
      "example-wiki-b",
    ]);
  });

  it("tolerates malformed YAML without throwing", async () => {
    const pages = await getMemoryPages({ agentRoot: tmpAgentRoot });
    const malformed = pages.find((p) => p.slug === "malformed-yaml");
    expect(malformed).toBeDefined();
    expect(typeof malformed?.frontmatter).toBe("object");
  });
});
