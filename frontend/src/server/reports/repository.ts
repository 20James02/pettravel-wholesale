import "server-only";

import type { AdminReportsOverview, UserAccount } from "@/lib/domain";
import { backendFetchJson as backendFetch } from "@/server/backend-client";

export async function getAdminReportsOverview(user: UserAccount): Promise<AdminReportsOverview> {
  return backendFetch(`/api/v1/reports/overview?org_id=${user.organizationId || ""}`);
}
