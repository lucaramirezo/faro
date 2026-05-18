import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// Throwaway state.db — the real shared slack_agent state.db is never touched.
const { TMP } = vi.hoisted(() => {
  const { mkdtempSync: mk } = require("node:fs");
  const { tmpdir: td } = require("node:os");
  const { join: j } = require("node:path");
  return { TMP: mk(j(td(), "faro-sl-")) };
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
import { getStudioLayout, setStudioLayout } from "@/lib/studio-layout";

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

function rawUpsert(profileId: string, studioLayout: string) {
  getDb()
    .prepare(
      `INSERT INTO ui_state (profile_id, studio_layout, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(profile_id) DO UPDATE SET studio_layout = excluded.studio_layout`,
    )
    .run(profileId, studioLayout, Date.now());
}

describe("studio-layout", () => {
  it("round-trips a layout through the version envelope", () => {
    const layout = { grid: { root: "x" }, panels: { "home:main": {} } };
    setStudioLayout("test", layout);
    expect(getStudioLayout("test")).toEqual(layout);
  });

  it("returns null for an absent profile row", () => {
    expect(getStudioLayout("no-such-profile")).toBeNull();
  });

  it("discards a schema-version mismatch", () => {
    rawUpsert("p_schema", JSON.stringify({ schema: 1, dockviewBuild: "6.3.0", layout: { a: 1 } }));
    expect(getStudioLayout("p_schema")).toBeNull();
  });

  it("discards a dockviewBuild mismatch", () => {
    rawUpsert("p_build", JSON.stringify({ schema: 2, dockviewBuild: "0.0.0", layout: { a: 1 } }));
    expect(getStudioLayout("p_build")).toBeNull();
  });

  it("returns null (never throws) on corrupt JSON", () => {
    rawUpsert("p_corrupt", "{ this is not json");
    expect(() => getStudioLayout("p_corrupt")).not.toThrow();
    expect(getStudioLayout("p_corrupt")).toBeNull();
  });
});
