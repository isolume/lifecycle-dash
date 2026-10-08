import { z } from "zod";
import { loadEnvConfig } from "@next/env";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z
    .enum(["true", "false"]) 
    .optional()
    .transform((v) => v === "true"),
  DATABASE_POOL_MAX: z
    .string()
    .optional()
    .transform((v) => (v ? Number.parseInt(v, 10) : 10)),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).optional().default("gpt-4.1-mini"),
  CHAT_RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .optional()
    .transform((v) => (v ? Number.parseInt(v, 10) : 30)),
  CHAT_RATE_LIMIT_WINDOW_MS: z
    .string()
    .optional()
    .transform((v) => (v ? Number.parseInt(v, 10) : 60_000)),
  CHAT_MAX_TOOL_ROWS: z
    .string()
    .optional()
    .transform((v) => (v ? Number.parseInt(v, 10) : 200)),
});

let cachedEnv: z.infer<typeof envSchema> | null = null;
let envLoaded = false;

export function getEnv(): z.infer<typeof envSchema> {
  if (!envLoaded) {
    loadEnvConfig(process.cwd());
    envLoaded = true;
  }

  if (!cachedEnv) {
    cachedEnv = envSchema.parse({
      DATABASE_URL: process.env.DATABASE_URL,
      DATABASE_SSL: process.env.DATABASE_SSL,
      DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_MODEL: process.env.OPENAI_MODEL,
      CHAT_RATE_LIMIT_MAX_REQUESTS: process.env.CHAT_RATE_LIMIT_MAX_REQUESTS,
      CHAT_RATE_LIMIT_WINDOW_MS: process.env.CHAT_RATE_LIMIT_WINDOW_MS,
      CHAT_MAX_TOOL_ROWS: process.env.CHAT_MAX_TOOL_ROWS,
    });
  }

  return cachedEnv;
}
