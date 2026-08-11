const vercelOnly = process.argv.includes("--vercel-only");

if (vercelOnly && process.env.VERCEL !== "1") {
  console.log("ENV_PREFLIGHT_SKIPPED=not_running_on_vercel");
  process.exit(0);
}

const failures = [];

function cleanEnvValue(raw) {
  return (raw ?? "").trim().replace(/^['"\s]+|['"\s]+$/g, "");
}

function value(key) {
  return cleanEnvValue(process.env[key]);
}

function requireValue(key, minLength = 1) {
  const configured = value(key);
  const ok = configured.length >= minLength;
  console.log(`ENV_CHECK key=${key} configured=${ok}`);
  if (!ok) failures.push(`${key} is missing or too short`);
  return configured;
}

function requireHttpsUrl(key) {
  const configured = requireValue(key);
  if (!configured) return;
  try {
    const parsed = new URL(configured);
    const forbiddenHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    const ok =
      parsed.protocol === "https:" &&
      Boolean(parsed.hostname) &&
      !forbiddenHosts.has(parsed.hostname.toLowerCase());
    console.log(
      `ENV_URL_CHECK key=${key} https=${parsed.protocol === "https:"} host_configured=${Boolean(parsed.hostname)} public_host=${!forbiddenHosts.has(parsed.hostname.toLowerCase())}`
    );
    if (!ok) failures.push(`${key} must be an HTTPS URL`);
  } catch {
    failures.push(`${key} must be a valid URL`);
  }
}

requireHttpsUrl("NEXT_PUBLIC_APP_URL");
requireHttpsUrl("BACKEND_URL");
requireValue("BACKEND_INTERNAL_SECRET", 32);
requireValue("JWT_SECRET", 32);
requireValue("CRON_SECRET", 16);
requireValue("PAYMENT_QR_ACCOUNT_NO");
requireValue("PAYMENT_QR_ACCOUNT_NAME");

if (value("NEXT_PUBLIC_APP_URL").replace(/\/$/, "") === value("BACKEND_URL").replace(/\/$/, "")) {
  failures.push("NEXT_PUBLIC_APP_URL and BACKEND_URL must point to different Vercel projects/domains");
}

for (const key of ["ALLOW_DEMO_DATA", "ALLOW_RUNTIME_MIGRATIONS"]) {
  const configured = value(key).toLowerCase();
  const ok = configured === "false";
  console.log(`ENV_FLAG_CHECK key=${key} disabled=${ok}`);
  if (!ok) failures.push(`${key} must be false`);
}

const bootstrapEmail = value("ADMIN_BOOTSTRAP_EMAIL");
const bootstrapToken = value("ADMIN_BOOTSTRAP_TOKEN");
if (Boolean(bootstrapEmail) !== Boolean(bootstrapToken)) {
  failures.push("ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_TOKEN must be set or removed together");
}
if (bootstrapToken && bootstrapToken.length < 32) {
  failures.push("ADMIN_BOOTSTRAP_TOKEN must contain at least 32 characters");
}
console.log(`ENV_OPTIONAL_CHECK key=ADMIN_BOOTSTRAP configured=${Boolean(bootstrapEmail && bootstrapToken)}`);

if (failures.length > 0) {
  for (const failure of failures) console.error(`ENV_PREFLIGHT_ERROR=${failure}`);
  process.exit(1);
}

console.log("ENV_PREFLIGHT_OK=true");
