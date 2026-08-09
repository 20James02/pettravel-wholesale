import "server-only";

import type { AccountingOverview, JournalEntryStatus, JournalEntrySummary, UserAccount } from "@/lib/domain";
import { createSupabaseServiceClient } from "@/server/supabase";

interface JournalEntryRow {
  id: string;
  entry_no: string;
  description: string;
  status: JournalEntryStatus;
  source_type: string;
  source_id: string;
  created_at: string;
  posted_at?: string | null;
}

function toJournalEntrySummary(row: JournalEntryRow): JournalEntrySummary {
  return {
    id: row.id,
    entryNo: row.entry_no,
    description: row.description,
    status: row.status,
    sourceType: row.source_type,
    sourceId: row.source_id,
    createdAt: row.created_at,
    postedAt: row.posted_at ?? undefined
  };
}

async function countAccountingPeriods(user: UserAccount, status?: "open" | "closed"): Promise<number> {
  const supabase = createSupabaseServiceClient();
  let query = supabase.from("accounting_periods").select("id", { count: "exact", head: true });

  if (user.organizationId) {
    query = query.eq("organization_id", user.organizationId);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(`Cannot read accounting periods: ${error.message}`);
  }

  return count ?? 0;
}

async function countJournalEntries(user: UserAccount, status?: JournalEntryStatus): Promise<number> {
  const supabase = createSupabaseServiceClient();
  let query = supabase.from("journal_entries").select("id", { count: "exact", head: true });

  if (user.organizationId) {
    query = query.eq("organization_id", user.organizationId);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(`Cannot read journal entries: ${error.message}`);
  }

  return count ?? 0;
}

export async function getAccountingOverview(user: UserAccount): Promise<AccountingOverview> {
  const supabase = createSupabaseServiceClient();

  const [
    periodsTotal,
    openPeriods,
    closedPeriods,
    draftEntries,
    postedEntries,
    voidEntries,
    recentEntriesResult
  ] = await Promise.all([
    countAccountingPeriods(user),
    countAccountingPeriods(user, "open"),
    countAccountingPeriods(user, "closed"),
    countJournalEntries(user, "draft"),
    countJournalEntries(user, "posted"),
    countJournalEntries(user, "void"),
    (() => {
      let query = supabase
        .from("journal_entries")
        .select("id, entry_no, description, status, source_type, source_id, created_at, posted_at")
        .order("created_at", { ascending: false })
        .limit(10);

      if (user.organizationId) {
        query = query.eq("organization_id", user.organizationId);
      }

      return query;
    })()
  ]);

  if (recentEntriesResult.error) {
    throw new Error(`Cannot read recent journal entries: ${recentEntriesResult.error.message}`);
  }

  return {
    periodsTotal,
    openPeriods,
    closedPeriods,
    draftEntries,
    postedEntries,
    voidEntries,
    recentEntries: ((recentEntriesResult.data ?? []) as JournalEntryRow[]).map(toJournalEntrySummary)
  };
}
