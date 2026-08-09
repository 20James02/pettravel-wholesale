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

    const message = error instanceof Error
      ? error.message
      : "Không thể đọc sổ nhật ký kế toán.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
