// Profile-scoped Dockview layout persistence over the `ui_state` table.
//
// Dockview ships NO layout versioning and `SerializedDockview` carries no
// cross-major stability guarantee — so every persisted layout is wrapped in a
// {schema, dockviewBuild, layout} envelope and silently discarded on a
// mismatch (caller rebuilds the default). Bump LAYOUT_SCHEMA on any panel-id /
// component-contract change; bump DOCKVIEW_BUILD on a Dockview major. Layout is
// scoped per `profile_id` (locked), one row in `ui_state`, never per-project.
import "server-only";

import { getDb } from "@/lib/db";

const LAYOUT_SCHEMA = 2;
const DOCKVIEW_BUILD = "6.3.0";

interface LayoutEnvelope {
  schema: number;
  dockviewBuild: string;
  layout: unknown;
}

/**
 * Return the persisted Dockview layout for a profile, or `null` if absent,
 * unparseable, or version-mismatched (caller builds the default). Never throws.
 */
export function getStudioLayout(profileId: string): unknown | null {
  try {
    const row = getDb()
      .prepare("SELECT studio_layout FROM ui_state WHERE profile_id = ?")
      .get(profileId) as { studio_layout: string | null } | undefined;
    if (!row?.studio_layout) return null;
    const parsed = JSON.parse(row.studio_layout) as Partial<LayoutEnvelope>;
    if (parsed.schema !== LAYOUT_SCHEMA || parsed.dockviewBuild !== DOCKVIEW_BUILD) {
      return null;
    }
    return parsed.layout ?? null;
  } catch {
    return null;
  }
}

/** Upsert the profile's Dockview layout, wrapped in the version envelope. */
export function setStudioLayout(profileId: string, layout: unknown): void {
  const value = JSON.stringify({
    schema: LAYOUT_SCHEMA,
    dockviewBuild: DOCKVIEW_BUILD,
    layout,
  } satisfies LayoutEnvelope);
  getDb()
    .prepare(
      `INSERT INTO ui_state (profile_id, studio_layout, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(profile_id) DO UPDATE SET
         studio_layout = excluded.studio_layout,
         updated_at = excluded.updated_at`,
    )
    .run(profileId, value, Date.now());
}
