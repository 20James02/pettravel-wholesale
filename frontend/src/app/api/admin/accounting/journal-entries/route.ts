import { NextResponse } from "next/server";
import { getJournalEntryDetails } from "@/server/accounting/repository";
import { requirePermission } from "@/server/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requirePermission("accounting.read");
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit") ?? 20);
    const entries = await getJournalEntryDetails(user, Number.isFinite(limitParam) ? limitParam : 20);
    return NextResponse.json({ entries });
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("ACCOUNTING_JOURNAL_ENTRIES_FAILED", error);
    return NextResponse.json({ error: "Không thể đọc sổ nhật ký kế toán." }, { status: 500 });
  }
}
