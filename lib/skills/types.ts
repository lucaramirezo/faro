// Adapted from developer-hasm/claude-code-dashboard (MIT). See LICENSE-third-party.md.

export type SkillScope = "global" | "project";

export interface Skill {
  name: string;
  scope: SkillScope;
  path: string;
  description: string;
  frontmatter: Record<string, unknown>;
}

export interface SkillUsage {
  name: string;
  runs7d: number;
  lastUsed: string | null; // ISO-8601 timestamp from upstream `turns.timestamp`
}

/**
 * Upstream-shaped record. Faro only ingests `skillName` for the /skills surface
 * but the row is widened to match upstream's schema verbatim so cost/token
 * analytics can be added later without a migration.
 */
export interface TurnRecord {
  sessionId: string;
  timestamp: string;
  messageId: string | null;
  syntheticKey: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  toolNames: string[];
  agentName: string | null;
  skillName: string | null;
  cwd: string | null;
  sourceFile: string;
}
