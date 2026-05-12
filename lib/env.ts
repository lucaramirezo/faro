import { z } from "zod";

const EnvSchema = z.object({
  FARO_PROFILE_DEFAULT: z.string().default("lwiki"),
  FARO_BASE_URL: z.string().url().optional(),
  FARO_OWNER_LOGIN: z.string().email(),
  FARO_AGENT_ROOT: z.string().optional(),
  FARO_STATE_DB: z.string().optional(),
  FARO_JSONL_ROOT: z.string().optional(),
  FARO_CCUSAGE_PATH: z.string().default("ccusage"),
  FARO_OPENROUTER_API_KEY: z.string().optional(),
  FARO_PRICING_REFRESH_HOURS: z.coerce.number().default(168),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export const env = EnvSchema.parse(process.env);
export type Env = z.infer<typeof EnvSchema>;
