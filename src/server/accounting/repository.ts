import "server-only";

import type {
  AccountingOverview,
  JournalEntryDetail,
  JournalEntryStatus,
  JournalEntrySummary,
  UserAccount
} from "@/lib/domain";
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

interface JournalLineRow {
  id: string;
  entry_id: string;
  line_no: number;
  account_code: string;
  account_name: string;
  debit_amount: number | string;
  credit_amount: number | string;
  memo?: string | null;
  partner_org_id?: string | null;
  order_id?: string | null;
  supplier_id?: string | null;
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

function toJournalEntryDetail(row: JournalEntryRow, lines: JournalLineRow[]): JournalEntryDetail {
  const mappedLines = lines
    .sort((a, b) => a.line_no - b.line_no)
    .map((line) => ({
      id: line.id,
      lineNo: line.line_no,
      accountCode: line.account_code,
      accountName: line.account_name,
      debitAmountVnd: Number(line.debit_amount ?? 0),
      creditAmountVnd: Number(line.credit_amount ?? 0),
      memo: line.memo ?? undefined,
      orderId: line.order_id ?? undefined,
      supplierId: line.supplier_id ?? undefined,
      partnerOrgId: line.partner_org_id ?? undefined
    }));
  const debitTotalVnd = mappedLines.reduce((sum, line) => sum + line.debitAmountVnd, 0);
  const creditTotalVnd = mappedLines.reduce((sum, line) => sum + line.creditAmountVnd, 0);

  return {
    ...toJournalEntrySummary(row),
    debitTotalVnd,
    creditTotalVnd,
    isBalanced: debitTotalVnd > 0 && debitTotalVnd === creditTotalVnd,
    lines: mappedLines
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

export async function getJournalEntryDetails(user: UserAccount, limit = 20): Promise<JournalEntryDetail[]> {
  const supabase = createSupabaseServiceClient();
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);

  let entriesQuery = supabase
    .from("journal_entries")
    .select("id, entry_no, description, status, source_type, source_id, created_at, posted_at")
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (user.organizationId) {
    entriesQuery = entriesQuery.eq("organization_id", user.organizationId);
  }

  const { data: entriesData, error: entriesError } = await entriesQuery;
  if (entriesError) {
    throw new Error(`Cannot read journal entries: ${entriesError.message}`);
  }

  const entries = (entriesData ?? []) as JournalEntryRow[];
  if (entries.length === 0) return [];

  let linesQuery = supabase
    .from("journal_lines")
    .select("id, entry_id, line_no, account_code, account_name, debit_amount, credit_amount, memo, partner_org_id, order_id, supplier_id")
    .in("entry_id", entries.map((entry) => entry.id))
    .order("line_no", { ascending: true });

  if (user.organizationId) {
    linesQuery = linesQuery.eq("organization_id", user.organizationId);
  }

  const { data: linesData, error: linesError } = await linesQuery;
  if (linesError) {
    throw new Error(`Cannot read journal lines: ${linesError.message}`);
  }

  const linesByEntry = new Map<string, JournalLineRow[]>();
  for (const line of (linesData ?? []) as JournalLineRow[]) {
    const current = linesByEntry.get(line.entry_id) ?? [];
    current.push(line);
    linesByEntry.set(line.entry_id, current);
  }

  return entries.map((entry) => toJournalEntryDetail(entry, linesByEntry.get(entry.id) ?? []));
}
