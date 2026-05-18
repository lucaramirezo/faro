import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

const { TMP } = vi.hoisted(() => {
  const { mkdtempSync: mk } = require("node:fs");
  const { tmpdir: td } = require("node:os");
  const { join: j } = require("node:path");
  return { TMP: mk(j(td(), "faro-pj-")) };
});

vi.mock("@/lib/profiles", () => ({
  getProfile: () => ({
    profile: "test",
    display_name: "test",
    agent_root: TMP,
    memory_dir: "memory",
    state_db: "state.db",
    jsonl_root: "jsonl",
    heartbeat_path: "hb",
    owner_logins: [],
    status: "active",
  }),
  resolveStateDbPath: () => join(TMP, "state.db"),
  resolveJsonlRoot: () => join(TMP, "jsonl"),
}));

import { getDb } from "@/lib/db";
import { getProfile } from "@/lib/profiles";
import {
  archiveProject,
  createProject,
  getProject,
  listProjects,
  projectDir,
  touchProject,
} from "@/lib/projects";

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe("projects model", () => {
  it("create → list (active, recency DESC) → touch reorders → archive drops", () => {
    const a = createProject("test", { name: "Alpha" });
    const b = createProject("test", { name: "Beta" });

    // Deterministic recency: make A strictly newer than B.
    getDb()
      .prepare("UPDATE projects SET updated_at = ? WHERE id = ?")
      .run(b.updated_at + 1000, a.id);
    let list = listProjects("test");
    expect(list.map((p) => p.id)).toEqual([a.id, b.id]);

    // touch B → it bumps to the front.
    getDb()
      .prepare("UPDATE projects SET updated_at = ? WHERE id = ?")
      .run(b.updated_at + 5000, a.id);
    touchProject(b.id);
    getDb()
      .prepare("UPDATE projects SET updated_at = ? WHERE id = ?")
      .run(b.updated_at + 9000, b.id);
    list = listProjects("test");
    expect(list[0].id).toBe(b.id);

    archiveProject(a.id);
    list = listProjects("test");
    expect(list.find((p) => p.id === a.id)).toBeUndefined();
    expect(list.some((p) => p.id === b.id)).toBe(true);
  });

  it("createProject lazily mkdirs the derived project dir", () => {
    const p = createProject("test", { name: "WithDir" });
    expect(existsSync(projectDir(getProfile("test"), p.id))).toBe(true);
  });

  it("projectDir derives the path (never stored on the row) and rejects unsafe ids", () => {
    const p = createProject("test", { name: "Derive" });
    expect(projectDir(getProfile("test"), p.id)).toBe(join(TMP, "drafts", "projects", p.id));
    const row = getProject("test", p.id);
    expect(row).toBeDefined();
    expect(Object.keys(row ?? {})).not.toContain("path");
    expect(() => projectDir(getProfile("test"), "../escape")).toThrow();
    expect(() => projectDir(getProfile("test"), "..")).toThrow();
  });
});
