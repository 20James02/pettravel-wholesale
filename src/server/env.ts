import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().url().optional(),
  PAYMENT_QR_BANK_NAME: z.string().optional(),
  PAYMENT_QR_ACCOUNT_NO: z.string().optional(),
  PAYMENT_QR_ACCOUNT_NAME: z.string().optional(),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),
  ADMIN_BOOTSTRAP_TOKEN: z.string().min(32).optional(),
  ADMIN_EMAILS: z.string().optional(),
  JWT_SECRET: z.string().min(32).optional(),
  PASSWORD_PEPPER: z.string().min(32).optional(),
  ALLOW_DEMO_DATA: z.enum(["true", "false"]).optional(),
  ALLOW_RUNTIME_MIGRATIONS: z.enum(["true", "false"]).optional(),
  CRON_SECRET: z.string().optional()
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
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function requireEnv(keys: Array<keyof typeof serverEnv>): void {
  const missing = keys.filter((key) => !serverEnv[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
