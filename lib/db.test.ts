import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// Fresh throwaway DB — exercises the lazy getDb()/ensureSchema path (the one
// RSC hits), proving the P2 schema mirror + the closed promote_to/tweak_patch
// drift WITHOUT touching the shared slack_agent state.db.
const { TMP } = vi.hoisted(() => {
  const { mkdtempSync: mk } = require("node:fs");
  const { tmpdir: td } = require("node:os");
  const { join: j } = require("node:path");
  return { TMP: mk(j(td(), "faro-db-")) };
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

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

function cols(table: string): string[] {
  return (getDb().prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
    (c) => c.name,
  );
}

describe("db ensureSchema (lazy RSC path) — P2 mirror + drift fix", () => {
  it("creates projects + ui_state on a fresh DB", () => {
    const tables = (
      getDb()
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('projects','ui_state','runs','run_events','claim_decisions')",
        )
        .all() as { name: string }[]
    ).map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining(["projects", "ui_state", "runs", "run_events"]));
  });

  it("adds runs.project_id via ensureColumn", () => {
    expect(cols("runs")).toContain("project_id");
  });

  it("closes the pre-existing claim_decisions.promote_to / tweak_patch drift", () => {
    const cd = cols("claim_decisions");
    expect(cd).toContain("promote_to");
    expect(cd).toContain("tweak_patch");
  });

  it("is idempotent — repeated getDb() returns the same connection, no throw", () => {
    const first = getDb();
    expect(() => getDb()).not.toThrow();
    expect(getDb()).toBe(first);
  });
});
