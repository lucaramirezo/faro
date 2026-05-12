import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { env } from "@/lib/env";

const ProfileSchema = z.object({
  profile: z.string(),
  display_name: z.string(),
  agent_root: z.string(),
  memory_dir: z.string(),
  state_db: z.string(),
  jsonl_root: z.string(),
  heartbeat_path: z.string(),
  slack_workspace: z.string().optional(),
  owner_logins: z.array(z.string().email()),
  status: z.enum(["active", "inactive"]).default("active"),
});

export type Profile = z.infer<typeof ProfileSchema>;

const PROFILES_DIR = join(process.cwd(), "profiles");

export function getProfile(slug?: string): Profile {
  const target = slug ?? env.FARO_PROFILE_DEFAULT;
  const raw = readFileSync(join(PROFILES_DIR, `${target}.yml`), "utf8");
  const parsed = ProfileSchema.parse(parseYaml(raw));
  if (env.FARO_AGENT_ROOT) {
    parsed.agent_root = env.FARO_AGENT_ROOT;
  }
  if (env.FARO_JSONL_ROOT) {
    parsed.jsonl_root = env.FARO_JSONL_ROOT;
  }
  return parsed;
}

export function resolveStateDbPath(p: Profile): string {
  return env.FARO_STATE_DB ?? join(p.agent_root, p.state_db);
}

export function resolveJsonlRoot(p: Profile): string {
  return env.FARO_JSONL_ROOT ?? p.jsonl_root;
}
