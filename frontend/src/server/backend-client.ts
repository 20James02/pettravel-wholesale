import "server-only";

function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1" || ["production", "preview"].includes(process.env.VERCEL_ENV ?? "");
}

export class BackendRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "BackendRequestError";
  }
}

export function getBackendUrl(): string {
  const raw = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL)?.trim().replace(/\/$/, "");
  if (!raw || raw === "[SENSITIVE]") {
    return process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || "http://localhost:8000";
  }

  try {
    const parsed = new URL(raw);
    if (isVercelRuntime() && parsed.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
      return `https://${parsed.host}`;
    }
    return raw;
  } catch {
    return raw;
  }
}

export function getBackendHeaders(headers: HeadersInit = {}): HeadersInit {
  const secret = process.env.BACKEND_INTERNAL_SECRET?.trim() ?? "";

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
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new BackendRequestError(
      response.status,
      body?.detail || `Backend request failed with HTTP ${response.status}.`
    );
  }

  return response.json();
}
