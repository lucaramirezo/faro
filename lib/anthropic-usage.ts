import "server-only";

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { unstable_cache } from "next/cache";
import { z } from "zod";

/**
 * Reads the Claude Max OAuth subscription's real usage + account state
 * directly from Anthropic's internal /api/oauth endpoints — the same ones
 * Claude Code itself uses to render `/usage`. NOT a publicly documented API;
 * the shape can change without notice. Failures degrade gracefully to null.
 *
 * Auth: bearer token from `~/.claude/.credentials.json` (`claudeAiOauth.accessToken`).
 * We never read or surface the refresh token; if the access token is expired,
 * we return a `tokenExpired` flag rather than attempting our own refresh
 * (Claude Code owns refresh rotation — racing it would corrupt the file).
 */

const execFileAsync = promisify(execFile);

const UsageWindowSchema = z.object({
  utilization: z.number(),
  resets_at: z.string(),
});

const UsageResponseSchema = z.object({
  five_hour: UsageWindowSchema.nullable().optional(),
  seven_day: UsageWindowSchema.nullable().optional(),
  seven_day_sonnet: UsageWindowSchema.nullable().optional(),
  seven_day_opus: UsageWindowSchema.nullable().optional(),
  seven_day_oauth_apps: UsageWindowSchema.nullable().optional(),
  extra_usage: z
    .object({
      is_enabled: z.boolean(),
      utilization: z.number().nullable(),
      monthly_limit: z.number().nullable(),
      used_credits: z.number().nullable(),
      currency: z.string().nullable(),
    })
    .nullable()
    .optional(),
});

export type UsageWindow = z.infer<typeof UsageWindowSchema>;

export interface SubscriptionUsage {
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
  sevenDaySonnet: UsageWindow | null;
  sevenDayOpus: UsageWindow | null;
  extraUsageEnabled: boolean;
  fetchedAt: string;
}

export interface SubscriptionUsageResult {
  status: "ok" | "no_credentials" | "token_expired" | "rate_limited" | "error";
  usage: SubscriptionUsage | null;
  error?: string;
}

const ProfileResponseSchema = z.object({
  account: z.object({
    uuid: z.string(),
    full_name: z.string().nullable().optional(),
    display_name: z.string().nullable().optional(),
    email: z.string(),
    has_claude_max: z.boolean().optional(),
    has_claude_pro: z.boolean().optional(),
    created_at: z.string().optional(),
  }),
  organization: z.object({
    uuid: z.string(),
    name: z.string(),
    organization_type: z.string().optional(),
    rate_limit_tier: z.string().optional(),
    subscription_status: z.string().optional(),
    billing_type: z.string().optional(),
    has_extra_usage_enabled: z.boolean().optional(),
  }),
  application: z
    .object({
      name: z.string().optional(),
      slug: z.string().optional(),
    })
    .optional(),
});

export interface OAuthProfile {
  email: string;
  fullName: string | null;
  displayName: string | null;
  accountUuid: string;
  hasClaudeMax: boolean;
  hasClaudePro: boolean;
  orgName: string;
  orgType: string | null;
  rateLimitTier: string | null;
  subscriptionStatus: string | null;
}

export interface OAuthProfileResult {
  status: "ok" | "no_credentials" | "token_expired" | "error";
  profile: OAuthProfile | null;
  error?: string;
}

const CredentialsSchema = z.object({
  claudeAiOauth: z.object({
    accessToken: z.string().min(1),
    refreshToken: z.string().optional(),
    expiresAt: z.number(),
    scopes: z.array(z.string()).optional(),
    subscriptionType: z.string().optional(),
    rateLimitTier: z.string().optional(),
  }),
});

async function readCredentials(): Promise<
  | { ok: true; accessToken: string; expiresAt: number; subscriptionType?: string }
  | { ok: false; reason: "missing" | "malformed" }
> {
  const credPath = path.join(os.homedir(), ".claude", ".credentials.json");
  let raw: string;
  try {
    raw = await fs.readFile(credPath, "utf8");
  } catch {
    return { ok: false, reason: "missing" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const result = CredentialsSchema.safeParse(parsed);
  if (!result.success) return { ok: false, reason: "malformed" };
  return {
    ok: true,
    accessToken: result.data.claudeAiOauth.accessToken,
    expiresAt: result.data.claudeAiOauth.expiresAt,
    subscriptionType: result.data.claudeAiOauth.subscriptionType,
  };
}

async function callOAuth(
  endpoint: string,
  accessToken: string,
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; status: "token_expired" | "rate_limited" | "error"; detail: string }
> {
  const url = `https://api.anthropic.com${endpoint}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      status: "error",
      detail: err instanceof Error ? err.message : "fetch failed",
    };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, status: "token_expired", detail: `HTTP ${res.status}` };
  }
  if (res.status === 429) {
    return { ok: false, status: "rate_limited", detail: "rate limited" };
  }
  if (!res.ok) {
    return { ok: false, status: "error", detail: `HTTP ${res.status}` };
  }
  try {
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      status: "error",
      detail: err instanceof Error ? err.message : "json parse failed",
    };
  }
}

async function _getSubscriptionUsage(): Promise<SubscriptionUsageResult> {
  const cred = await readCredentials();
  if (!cred.ok) {
    return {
      status: "no_credentials",
      usage: null,
      error: `credentials ${cred.reason}`,
    };
  }
  // Heuristic: if the access token has been expired for more than a minute,
  // bail out — Claude Code will refresh on its next interactive run.
  if (cred.expiresAt < Date.now() - 60_000) {
    return { status: "token_expired", usage: null };
  }
  const call = await callOAuth("/api/oauth/usage", cred.accessToken);
  if (!call.ok) {
    return { status: call.status, usage: null, error: call.detail };
  }
  const parsed = UsageResponseSchema.safeParse(call.data);
  if (!parsed.success) {
    return {
      status: "error",
      usage: null,
      error: `schema mismatch: ${parsed.error.message}`,
    };
  }
  return {
    status: "ok",
    usage: {
      fiveHour: parsed.data.five_hour ?? null,
      sevenDay: parsed.data.seven_day ?? null,
      sevenDaySonnet: parsed.data.seven_day_sonnet ?? null,
      sevenDayOpus: parsed.data.seven_day_opus ?? null,
      extraUsageEnabled: parsed.data.extra_usage?.is_enabled ?? false,
      fetchedAt: new Date().toISOString(),
    },
  };
}

async function _getOAuthProfile(): Promise<OAuthProfileResult> {
  const cred = await readCredentials();
  if (!cred.ok) {
    return {
      status: "no_credentials",
      profile: null,
      error: `credentials ${cred.reason}`,
    };
  }
  if (cred.expiresAt < Date.now() - 60_000) {
    return { status: "token_expired", profile: null };
  }
  const call = await callOAuth("/api/oauth/profile", cred.accessToken);
  if (!call.ok) {
    if (call.status === "rate_limited") {
      // profile is essentially static — treat 429 as an error since it has
      // no separate "usage" semantics
      return { status: "error", profile: null, error: "rate limited" };
    }
    return { status: call.status, profile: null, error: call.detail };
  }
  const parsed = ProfileResponseSchema.safeParse(call.data);
  if (!parsed.success) {
    return {
      status: "error",
      profile: null,
      error: `schema mismatch: ${parsed.error.message}`,
    };
  }
  return {
    status: "ok",
    profile: {
      email: parsed.data.account.email,
      fullName: parsed.data.account.full_name ?? null,
      displayName: parsed.data.account.display_name ?? null,
      accountUuid: parsed.data.account.uuid,
      hasClaudeMax: parsed.data.account.has_claude_max ?? false,
      hasClaudePro: parsed.data.account.has_claude_pro ?? false,
      orgName: parsed.data.organization.name,
      orgType: parsed.data.organization.organization_type ?? null,
      rateLimitTier: parsed.data.organization.rate_limit_tier ?? null,
      subscriptionStatus: parsed.data.organization.subscription_status ?? null,
    },
  };
}

// 60s cache: usage utilization moves slowly enough that re-hitting more often
// is wasteful, and the endpoint is rate-limited. Profile data is static so we
// cache it for 1 hour.
export const getSubscriptionUsage = unstable_cache(
  _getSubscriptionUsage,
  ["faro:anthropic:usage"],
  { revalidate: 60, tags: ["faro:anthropic"] },
);

export const getOAuthProfile = unstable_cache(_getOAuthProfile, ["faro:anthropic:profile"], {
  revalidate: 3600,
  tags: ["faro:anthropic"],
});

/**
 * Shell out to `claude auth status --json` as a fallback for the email/plan
 * when /api/oauth/profile is unreachable. Lighter touch than the OAuth call —
 * uses Claude Code's own keychain access path. Cached for 1 hour.
 */
async function _getAuthStatusFromCli(): Promise<{
  email: string;
  subscriptionType: string;
  orgName: string;
} | null> {
  try {
    const { stdout } = await execFileAsync("claude", ["auth", "status", "--json"], {
      timeout: 5_000,
    });
    const parsed = JSON.parse(stdout);
    if (
      typeof parsed?.email === "string" &&
      typeof parsed?.subscriptionType === "string" &&
      typeof parsed?.orgName === "string"
    ) {
      return {
        email: parsed.email,
        subscriptionType: parsed.subscriptionType,
        orgName: parsed.orgName,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export const getAuthStatusFromCli = unstable_cache(
  _getAuthStatusFromCli,
  ["faro:anthropic:cli-auth"],
  { revalidate: 3600, tags: ["faro:anthropic"] },
);
