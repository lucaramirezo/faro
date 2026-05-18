// Vendored & adapted from nexu-io/open-design@34f66113a0f2391714d081d848e7dc48a5222de0
// (Apache-2.0) — apps/web/src/components/QuickSwitcher.tsx. Modified: TypeScript
// types kept, `scoreMatch` signature adapted to take a `name: string` (upstream
// took a `ProjectFile`); `baseName` exported; the localStorage recents store,
// baseDir/SKIP_DIRS/templates/tabs were NOT ported (faro recency = the SQLite
// updated_at/created_at columns). See LICENSE-third-party.md.
//
// Pure module — NO `server-only`, NO node imports. The client ⌘P palette
// imports `scoreMatch`/`nextCursor`/`SwitchTarget` from here directly; the
// server union lives in lib/quick-switch.server.ts.

/** A unified ⌘P switch target (project | artifact | run). */
export interface SwitchTarget {
  type: "project" | "artifact" | "run";
  id: string;
  label: string;
  sublabel: string;
  score: number;
}

/**
 * Wrap a list cursor in `direction` (±1), clamping to `total`. `total <= 0`
 * yields 0. Verbatim port.
 */
export function nextCursor(current: number, total: number, direction: 1 | -1): number {
  if (total <= 0) return 0;
  if (direction === 1) return (current + 1) % total;
  return (current - 1 + total) % total;
}

/**
 * Cheap fuzzy: prefix-on-basename (500) beats substring-on-basename (250)
 * beats substring-on-full-name (100); exact basename = 1000; miss = 0.
 * `q` MUST be pre-lowercased by the caller (verbatim upstream contract).
 * Verbatim port — only the signature changed (`name: string`, was a
 * `ProjectFile` whose `.name` was read).
 */
export function scoreMatch(name: string, q: string): number {
  const lower = name.toLowerCase();
  const base = baseName(lower);
  if (base === q) return 1000;
  if (base.startsWith(q)) return 500;
  if (base.includes(q)) return 250;
  if (lower.includes(q)) return 100;
  return 0;
}

/** Basename of a `/`-delimited name. Verbatim port (exported). */
export function baseName(name: string): string {
  const i = name.lastIndexOf("/");
  return i >= 0 ? name.slice(i + 1) : name;
}
