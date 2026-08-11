import "server-only";

import type {
  AccountingOverview,
  JournalEntryDetail,
  UserAccount
} from "@/lib/domain";
import { backendFetchJson as backendFetch } from "@/server/backend-client";

export async function getAccountingOverview(user: UserAccount): Promise<AccountingOverview> {
  return backendFetch(`/api/v1/accounting/overview?org_id=${user.organizationId || ""}`);
}

export async function getJournalEntryDetails(user: UserAccount, limit = 20): Promise<JournalEntryDetail[]> {
  return backendFetch(`/api/v1/accounting/journal-entries`);
}
