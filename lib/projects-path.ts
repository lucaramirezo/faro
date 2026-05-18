// Vendored & adapted from nexu-io/open-design@34f66113a0f2391714d081d848e7dc48a5222de0
// (Apache-2.0) — apps/daemon/src/projects.ts. Modified: TypeScript types added,
// mapped onto faro lib/security.ts:assertUnder, async realpath via node:fs/promises.
// Upstream is `@ts-nocheck` JS; the logic below is a verbatim port — only static
// types and the faro `assertUnder` mapping were added. See LICENSE-third-party.md.
import "server-only";

import { realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import { assertUnder } from "@/lib/security";

/** Always-forbidden path segments: empty, `.`, `..`. (verbatim) */
const FORBIDDEN_SEGMENT = /^$|^\.\.?$/;
/** Project-relative segments that are reserved and may not be addressed. (verbatim) */
const RESERVED_PROJECT_FILE_SEGMENTS = new Set([".live-artifacts"]);

/**
 * Validate a project-relative path. Rejects absolute paths, Windows drive
 * letters, NUL bytes, empty/`.`/`..` segments, and reserved segments; returns
 * the normalized forward-slash path. Verbatim port (typed).
 */
export function validateProjectPath(raw: string): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("invalid file name");
  }
  const normalized = raw.replace(/\\/g, "/");
  if (raw.includes("\0") || /^[A-Za-z]:/.test(normalized) || normalized.startsWith("/")) {
    throw new Error("invalid file name");
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((p) => FORBIDDEN_SEGMENT.test(p))) {
    throw new Error("invalid file name");
  }
  if (parts.some((part) => RESERVED_PROJECT_FILE_SEGMENTS.has(part))) {
    throw new Error("reserved project path");
  }
  return parts.join("/");
}

/**
 * True iff `id` is a safe project id: a non-empty, ≤128-char string of
 * `[A-Za-z0-9._-]` that is not all-dots. The pure-dot guard (`/^\.+$/`) is
 * security-critical — it rejects `.`, `..`, `...`, etc. Verbatim port (typed,
 * input widened to `unknown` for call-site safety).
 */
export function isSafeId(id: unknown): boolean {
  if (typeof id !== "string") return false;
  if (id.length === 0 || id.length > 128) return false;
  if (/^\.+$/.test(id)) return false; // reject `.`, `..`, `...`, etc.
  return /^[A-Za-z0-9._-]+$/.test(id);
}

/**
 * Realpath the longest existing prefix of `p` and re-append the missing tail.
 * Used for write targets that don't exist on disk yet. Verbatim port (typed).
 */
export async function resolveExistingPrefix(p: string): Promise<string> {
  const parts = p.split(sep);
  for (let i = parts.length; i > 0; i--) {
    const prefix = parts.slice(0, i).join(sep) || sep;
    try {
      const real = await realpath(prefix);
      const rest = parts.slice(i).join(sep);
      return rest ? join(real, rest) : real;
    } catch (err) {
      const e = err as NodeJS.ErrnoException | null;
      if (!e || e.code !== "ENOENT") throw err;
    }
  }
  return p;
}

/**
 * Symlink-hardened confinement. `assertUnder()` does the lexical gate
 * (unchanged byte-for-byte port, lib/security.ts); this adds the realpath
 * check open-design's `resolveSafeReal` performs, defending the
 * descendant-symlink escape: a symlink *inside* the project tree pointing
 * outside passes a string-prefix check, but the OS follows it at open() time.
 * Returns the resolved real path. Throws `EPATHESCAPE` on a symlink escape.
 */
export async function assertUnderReal(target: string, parent: string): Promise<string> {
  const lexical = assertUnder(target, parent); // throws on lexical traversal
  const rootReal = await realpath(parent).catch(() => parent);
  let real: string;
  try {
    real = await realpath(lexical);
  } catch (err) {
    const e = err as NodeJS.ErrnoException | null;
    if (!e || e.code !== "ENOENT") throw err;
    real = await resolveExistingPrefix(lexical); // not-yet-created write target
  }
  if (!real.startsWith(rootReal + sep) && real !== rootReal) {
    const e = new Error("path escapes project dir via symlink") as Error & { code?: string };
    e.code = "EPATHESCAPE";
    throw e;
  }
  return real;
}
