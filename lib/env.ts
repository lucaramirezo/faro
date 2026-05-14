import { z } from "zod";

/**
 * Env vars are validated LAZILY (on first read), not at module-import time.
 *
 * Why: `next build` imports every module in the route graph during compilation.
 * If validation runs at import time and any required var is missing, the build
 * dies — including on fresh laptop checkouts where `.env.local` hasn't been
 * filled yet. Making vars optional in the schema + throwing at runtime call
 * sites lets the build succeed; only the routes that actually need a var fail
 * if it's unset.
 *
 * All FARO_* vars are optional in the schema. Use the `require*()` helpers at
 * runtime call sites (route handlers, middleware) to enforce presence with a
 * clear error.
 */
const EnvSchema = z.object({
  FARO_PROFILE_DEFAULT: z.string().default("lwiki"),
  FARO_BASE_URL: z.string().url().optional(),
  FARO_OWNER_LOGIN: z.string().optional(),
  FARO_AGENT_ROOT: z.string().optional(),
  FARO_STATE_DB: z.string().optional(),
  FARO_JSONL_ROOT: z.string().optional(),
  FARO_CCUSAGE_PATH: z.string().default("ccusage"),
  FARO_OPENROUTER_API_KEY: z.string().optional(),
  FARO_OPENROUTER_API_KEY_FILE: z.string().optional(),
  FARO_GEMINI_API_KEY: z.string().optional(),
  FARO_GEMINI_API_KEY_FILE: z.string().optional(),
  FARO_OPENAI_API_KEY: z.string().optional(),
  FARO_OPENAI_API_KEY_FILE: z.string().optional(),
  FARO_PRICING_REFRESH_HOURS: z.coerce.number().default(168),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof EnvSchema>;

let _env: Env | null = null;

function loadEnv(): Env {
  if (_env) return _env;
  _env = EnvSchema.parse(process.env);
  return _env;
}

/**
 * Lazy env accessor. The Proxy parses process.env on first property read.
 * Existing code can keep using `env.FARO_FOO` — validation just runs later.
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return (loadEnv() as Record<string, unknown>)[prop];
  },
});

/**
 * Parse + validate eagerly. Useful for boot-time CLI tools (migrate.ts) that
 * want to fail fast.
 */
export function getEnv(): Env {
  return loadEnv();
}

/**
 * Returns the parsed list of owner logins, or throws if FARO_OWNER_LOGIN is unset.
 * Call sites in route handlers / middleware use this instead of reading the env
 * directly so the failure mode is a clean Error at request time, not a Zod
 * shape error at module-import time.
 */
export function requireOwnerLogins(): string[] {
  const raw = loadEnv().FARO_OWNER_LOGIN;
  if (!raw) {
    throw new Error(
      "FARO_OWNER_LOGIN env var is required but unset. " +
        "Set it in .env.local (laptop) or systemd EnvironmentFile (pei).",
    );
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Returns the OpenRouter API key or throws. Mirror of ``requireOwnerLogins``.
 * Used by the /cost OpenRouter card — call sites should catch the throw and
 * render a "key not configured" placeholder instead of failing the whole page.
 *
 * Resolution order:
 *  1. ``FARO_OPENROUTER_API_KEY`` env var (laptop ``.env.local``)
 *  2. ``FARO_OPENROUTER_API_KEY_FILE`` path (pei systemd ``LoadCredential=``)
 *  3. ``$CREDENTIALS_DIRECTORY/openrouter`` (pei systemd fallback)
 */
export function requireOpenRouterKey(): string {
  const e = loadEnv();
  const direct = e.FARO_OPENROUTER_API_KEY?.trim() ?? "";
  if (direct) return direct;
  const fromFile = readKeyFile(e.FARO_OPENROUTER_API_KEY_FILE);
  if (fromFile) return fromFile;
  const credDir = process.env.CREDENTIALS_DIRECTORY?.trim();
  if (credDir) {
    const fromCred = readKeyFile(`${credDir.replace(/\/$/, "")}/openrouter`);
    if (fromCred) return fromCred;
  }
  throw new Error(
    "FARO_OPENROUTER_API_KEY (or _FILE) env var is required but unset. " +
      "Set it in .env.local (laptop) or systemd LoadCredential (pei).",
  );
}

/**
 * Returns the Gemini (Google AI) API key or throws. Used by lib/providers.ts
 * when the active profile's `models.<feature>` block routes to Google
 * (e.g. Imagen 4 for wiki_image).
 *
 * Resolution order matches `requireOpenRouterKey`:
 *   1. `FARO_GEMINI_API_KEY` env var (laptop `.env.local`)
 *   2. `FARO_GEMINI_API_KEY_FILE` path (pei systemd `LoadCredential=`)
 *   3. `$CREDENTIALS_DIRECTORY/gemini` (pei systemd fallback)
 */
export function requireGeminiKey(): string {
  const e = loadEnv();
  const direct = e.FARO_GEMINI_API_KEY?.trim() ?? "";
  if (direct) return direct;
  const fromFile = readKeyFile(e.FARO_GEMINI_API_KEY_FILE);
  if (fromFile) return fromFile;
  const credDir = process.env.CREDENTIALS_DIRECTORY?.trim();
  if (credDir) {
    const fromCred = readKeyFile(`${credDir.replace(/\/$/, "")}/gemini`);
    if (fromCred) return fromCred;
  }
  throw new Error(
    "FARO_GEMINI_API_KEY (or _FILE) env var is required but unset. " +
      "Set it in .env.local (laptop) or systemd LoadCredential (pei).",
  );
}

/**
 * Returns the OpenAI API key or throws. Used by lib/providers.ts when the
 * active profile's `models.<feature>` block routes to OpenAI (e.g.
 * gpt-image-1 as the Imagen 4 swap-ready alternative).
 *
 * Resolution order matches `requireGeminiKey`.
 */
export function requireOpenAIKey(): string {
  const e = loadEnv();
  const direct = e.FARO_OPENAI_API_KEY?.trim() ?? "";
  if (direct) return direct;
  const fromFile = readKeyFile(e.FARO_OPENAI_API_KEY_FILE);
  if (fromFile) return fromFile;
  const credDir = process.env.CREDENTIALS_DIRECTORY?.trim();
  if (credDir) {
    const fromCred = readKeyFile(`${credDir.replace(/\/$/, "")}/openai`);
    if (fromCred) return fromCred;
  }
  throw new Error(
    "FARO_OPENAI_API_KEY (or _FILE) env var is required but unset. " +
      "Set it in .env.local (laptop) or systemd LoadCredential (pei).",
  );
}

function readKeyFile(path: string | undefined): string {
  if (!path) return "";
  try {
    // Lazy require to keep `lib/env.ts` import-cheap on the client. This file
    // is only imported from server modules in practice, but the guard is free.
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}
