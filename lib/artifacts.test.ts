import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyEmitter,
  deriveArtifactId,
  extractRunIdFromPath,
  mimeFromPath,
} from "@/lib/artifacts";
import { ARTIFACT_ID_REGEX } from "@/lib/artifacts-types";

// next/cache and server-only are server-runtime modules; stub them for vitest.
vi.mock("next/cache", () => ({
  unstable_cache: <T>(fn: T) => fn,
  revalidatePath: vi.fn(),
}));
vi.mock("server-only", () => ({}));

describe("mimeFromPath", () => {
  it("maps known extensions", () => {
    expect(mimeFromPath("a/b/foo.html")).toBe("text/html");
    expect(mimeFromPath("foo.htm")).toBe("text/html");
    expect(mimeFromPath("foo.md")).toBe("text/markdown");
    expect(mimeFromPath("foo.markdown")).toBe("text/markdown");
    expect(mimeFromPath("foo.svg")).toBe("image/svg+xml");
    expect(mimeFromPath("foo.json")).toBe("application/json");
    expect(mimeFromPath("foo.ts")).toBe("text/x-code");
    expect(mimeFromPath("foo.tsx")).toBe("text/x-code");
    expect(mimeFromPath("foo.py")).toBe("text/x-code");
  });

  it("returns null for unsupported extensions", () => {
    expect(mimeFromPath("foo.png")).toBeNull();
    expect(mimeFromPath("foo.pdf")).toBeNull();
    expect(mimeFromPath("foo")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(mimeFromPath("foo.HTML")).toBe("text/html");
    expect(mimeFromPath("foo.MD")).toBe("text/markdown");
  });
});

describe("classifyEmitter", () => {
  it("classifies dream artifacts", () => {
    expect(classifyEmitter("drafts/artifacts/2026-05-13/abc/dream-report.html")).toBe("dreams");
    expect(classifyEmitter("drafts/dreams/2026-05-13/claims.json")).toBe("dreams");
  });

  it("classifies brief artifacts", () => {
    expect(classifyEmitter("drafts/artifacts/2026-05-13/heartbeat-1230/brief.html")).toBe("brief");
  });

  it("classifies plan-feature artifacts", () => {
    expect(classifyEmitter("drafts/artifacts/2026-05-13/abc/plan-approaches.html")).toBe(
      "plan-feature",
    );
  });

  it("classifies wiki-lint artifacts", () => {
    expect(classifyEmitter("drafts/artifacts/2026-05-13/abc/triage.html")).toBe("wiki-lint");
  });

  it("classifies ingest artifacts", () => {
    expect(classifyEmitter("drafts/artifacts/2026-05-13/abc/ingest-review.html")).toBe("ingest");
  });

  it("falls back to manual", () => {
    expect(classifyEmitter("drafts/artifacts/2026-05-13/abc/random.html")).toBe("manual");
    expect(classifyEmitter("wiki/artifacts/notes/scratch.md")).toBe("manual");
  });
});

describe("deriveArtifactId", () => {
  it("returns a 16-char hex string", () => {
    const id = deriveArtifactId("a".repeat(64), "run-123");
    expect(id).toMatch(ARTIFACT_ID_REGEX);
    expect(id).toHaveLength(16);
  });

  it("is deterministic for the same inputs", () => {
    const a = deriveArtifactId("a".repeat(64), "run-123");
    const b = deriveArtifactId("a".repeat(64), "run-123");
    expect(a).toBe(b);
  });

  it("differs when content_hash changes (in-place edit)", () => {
    const a = deriveArtifactId("a".repeat(64), "run-123");
    const b = deriveArtifactId("b".repeat(64), "run-123");
    expect(a).not.toBe(b);
  });

  it("differs when run_id changes (re-emit)", () => {
    const a = deriveArtifactId("a".repeat(64), "run-123");
    const b = deriveArtifactId("a".repeat(64), "run-456");
    expect(a).not.toBe(b);
  });

  it("accepts null run_id (manual artifacts)", () => {
    const id = deriveArtifactId("a".repeat(64), null);
    expect(id).toMatch(ARTIFACT_ID_REGEX);
  });
});

describe("extractRunIdFromPath", () => {
  it("extracts run_id from drafts path", () => {
    expect(extractRunIdFromPath("drafts/artifacts/2026-05-13/abc-12345/file.html")).toBe(
      "abc-12345",
    );
  });

  it("returns null for wiki path (group key synthesized in the gallery)", () => {
    expect(extractRunIdFromPath("wiki/artifacts/weekly-status/report.html")).toBeNull();
  });

  it("returns null for malformed paths", () => {
    expect(extractRunIdFromPath("drafts/artifacts/2026-05-13/file.html")).toBeNull();
    expect(extractRunIdFromPath("random/path/file.html")).toBeNull();
  });
});

/**
 * Integration: tmp dir + in-memory sqlite + injected DB.
 * Exercises the real upsert + idempotency + content-hash stability path.
 */
describe("scanArtifacts (integration)", () => {
  let tmpRoot: string;
  let db: Database.Database;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "faro-artifacts-"));
    await fs.mkdir(path.join(tmpRoot, "drafts", "artifacts", "2026-05-13", "run-001"), {
      recursive: true,
    });
    await fs.mkdir(path.join(tmpRoot, "wiki", "artifacts", "test-slug"), { recursive: true });

    // In-memory SQLite with the production schema (mirrors migrate.ts).
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE pipeline_runs (run_id TEXT PRIMARY KEY, profile_id TEXT);
      CREATE TABLE artifacts (
        artifact_id   TEXT PRIMARY KEY,
        run_id        TEXT,
        profile_id    TEXT NOT NULL DEFAULT 'lwiki',
        source        TEXT NOT NULL,
        mime          TEXT NOT NULL,
        path          TEXT NOT NULL,
        label         TEXT,
        emitter       TEXT,
        bytes         INTEGER NOT NULL,
        content_hash  TEXT NOT NULL,
        created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        promoted_at   TIMESTAMP,
        FOREIGN KEY (run_id) REFERENCES pipeline_runs(run_id)
      );
    `);
    // Seed pipeline_runs rows for the run_ids the fixtures use, so the
    // FK to pipeline_runs(run_id) holds. Wiki artifacts store run_id=NULL.
    db.prepare("INSERT INTO pipeline_runs (run_id, profile_id) VALUES (?, ?)").run(
      "run-001",
      "test",
    );
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  const stubProfile = () => ({
    profile: "test",
    display_name: "test",
    agent_root: tmpRoot,
    memory_dir: "memory",
    state_db: ":memory:",
    jsonl_root: "/tmp",
    heartbeat_path: "memory/heartbeat.md",
    owner_logins: ["test@example.com"],
    status: "active" as const,
  });

  it("idempotent — second scan inserts zero new rows", async () => {
    await fs.writeFile(
      path.join(tmpRoot, "drafts", "artifacts", "2026-05-13", "run-001", "dream-report.html"),
      "<html><body>hi</body></html>",
    );
    await fs.writeFile(
      path.join(tmpRoot, "drafts", "artifacts", "2026-05-13", "run-001", "claims.json"),
      '{"claims":[]}',
    );

    const { scanArtifacts } = await import("@/lib/artifacts");
    const first = await scanArtifacts({ profile: stubProfile(), db });
    expect(first.scanned).toBe(2);
    expect(first.inserted).toBe(2);
    expect(first.unchanged).toBe(0);

    const second = await scanArtifacts({ profile: stubProfile(), db });
    expect(second.scanned).toBe(2);
    expect(second.inserted).toBe(0);
    expect(second.unchanged).toBe(2);
  });

  it("modifying a file produces a new row (content-addressed)", async () => {
    const filePath = path.join(
      tmpRoot,
      "drafts",
      "artifacts",
      "2026-05-13",
      "run-001",
      "dream-report.html",
    );
    await fs.writeFile(filePath, "<html><body>v1</body></html>");

    const { scanArtifacts } = await import("@/lib/artifacts");
    await scanArtifacts({ profile: stubProfile(), db });

    await fs.writeFile(filePath, "<html><body>v2</body></html>");
    const result = await scanArtifacts({ profile: stubProfile(), db });
    expect(result.inserted).toBe(1); // new artifact_id from the new content_hash

    const rows = db.prepare("SELECT artifact_id, content_hash FROM artifacts").all() as {
      artifact_id: string;
      content_hash: string;
    }[];
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.artifact_id)).size).toBe(2);
  });

  it("classifies emitter + source correctly", async () => {
    await fs.writeFile(
      path.join(tmpRoot, "drafts", "artifacts", "2026-05-13", "run-001", "ingest-review.html"),
      "<html/>",
    );
    await fs.writeFile(
      path.join(tmpRoot, "wiki", "artifacts", "test-slug", "report.html"),
      "<html/>",
    );

    const { scanArtifacts } = await import("@/lib/artifacts");
    await scanArtifacts({ profile: stubProfile(), db });

    const rows = db
      .prepare("SELECT emitter, source, run_id FROM artifacts ORDER BY source")
      .all() as { emitter: string; source: string; run_id: string | null }[];
    expect(rows).toHaveLength(2);
    const drafts = rows.find((r) => r.source === "drafts");
    const wiki = rows.find((r) => r.source === "wiki");
    expect(drafts?.emitter).toBe("ingest");
    expect(drafts?.run_id).toBe("run-001");
    expect(wiki?.emitter).toBe("manual");
    expect(wiki?.run_id).toBeNull();
  });

  it("skips unsupported extensions", async () => {
    await fs.writeFile(
      path.join(tmpRoot, "drafts", "artifacts", "2026-05-13", "run-001", "image.png"),
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
    await fs.writeFile(
      path.join(tmpRoot, "drafts", "artifacts", "2026-05-13", "run-001", "ok.html"),
      "<html/>",
    );

    const { scanArtifacts } = await import("@/lib/artifacts");
    const result = await scanArtifacts({ profile: stubProfile(), db });
    expect(result.scanned).toBe(2);
    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("JSON files do not trigger a parse — bytes are stored as-is", async () => {
    await fs.writeFile(
      path.join(tmpRoot, "drafts", "artifacts", "2026-05-13", "run-001", "claims.json"),
      "{not valid json",
    );
    const { scanArtifacts } = await import("@/lib/artifacts");
    await expect(scanArtifacts({ profile: stubProfile(), db })).resolves.toBeDefined();
  });
});
