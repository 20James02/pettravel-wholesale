import { z } from "zod";

const booleanStringSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z.enum(["true", "false"])
);

const serverEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  BACKEND_URL: z.string().url().optional(),
  BACKEND_INTERNAL_SECRET: z.string().min(32).optional(),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),
  ADMIN_BOOTSTRAP_TOKEN: z.string().min(32).optional(),
  JWT_SECRET: z.string().min(32).optional(),
  ALLOW_DEMO_DATA: booleanStringSchema.optional(),
  ALLOW_RUNTIME_MIGRATIONS: booleanStringSchema.optional(),
  CRON_SECRET: z.string().min(16).optional()
});

const rawEnv = Object.fromEntries(
  Object.entries(process.env).map(([key, val]) => [
    key,
    typeof val === "string" ? val.trim().replace(/^['"\s]+|['"\s]+$/g, "") : val
  ])
);

export const serverEnv = serverEnvSchema.parse(rawEnv);

export function getRequiredEnv(key: keyof typeof serverEnv): string {
  const value = serverEnv[key];
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

export function requireEnv(keys: Array<keyof typeof serverEnv>): void {
  const missing = keys.filter((key) => !serverEnv[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
