import "server-only";

export function getBackendUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || "http://localhost:8000";
}

export function getBackendHeaders(headers: HeadersInit = {}): HeadersInit {
  const secret =
    process.env.BACKEND_INTERNAL_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    process.env.JWT_SECRET ||
    "";

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
    const text = await response.text();
    throw new Error(`Backend error: ${response.status} - ${text}`);
  }

  return response.json();
}
