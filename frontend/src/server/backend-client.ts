import "server-only";

function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1" || ["production", "preview"].includes(process.env.VERCEL_ENV ?? "");
}

export function getBackendUrl(): string {
  const configuredUrl = process.env.BACKEND_URL?.trim().replace(/\/$/, "");
  if (!configuredUrl) {
    if (isVercelRuntime()) throw new Error("BACKEND_URL is not configured.");
    return "http://localhost:8000";
  }

  const parsed = new URL(configuredUrl);
  if (isVercelRuntime() && parsed.protocol !== "https:") {
    throw new Error("BACKEND_URL must use HTTPS on Vercel.");
  }
  return configuredUrl;
}

export function getBackendHeaders(headers: HeadersInit = {}): HeadersInit {
  const secret = process.env.BACKEND_INTERNAL_SECRET?.trim() ?? "";
  if (isVercelRuntime() && secret.length < 32) {
    throw new Error("BACKEND_INTERNAL_SECRET is not configured correctly.");
  }

  return {
    "Content-Type": "application/json",
    ...(secret ? { "x-backend-internal-secret": secret } : {}),
    ...headers
  };
}

export async function backendFetchJson(path: string, options: RequestInit = {}) {
  const response = await fetch(`${getBackendUrl()}${path}`, {
    ...options,
    headers: getBackendHeaders(options.headers)
  });

  if (!response.ok) {
    throw new Error(`Backend request failed with HTTP ${response.status}.`);
  }

  return response.json();
}
