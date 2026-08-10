import "server-only";

import type { AdminReportsOverview, UserAccount } from "@/lib/domain";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function backendFetch(path: string, options: RequestInit = {}) {
  const url = `${BACKEND_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend error: ${response.status} - ${text}`);
  }
  return response.json();
}

export async function getAdminReportsOverview(user: UserAccount): Promise<AdminReportsOverview> {
  return backendFetch(`/api/v1/reports/overview?org_id=${user.organizationId || ""}`);
}
