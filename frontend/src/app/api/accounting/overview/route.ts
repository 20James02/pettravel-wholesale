import { NextResponse } from "next/server";
import { getAccountingOverview } from "@/server/accounting/repository";
import { requirePermission } from "@/server/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requirePermission("accounting.read");
    const overview = await getAccountingOverview(user);
    return NextResponse.json({ overview });
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("ACCOUNTING_OVERVIEW_FAILED", error);
    return NextResponse.json({ error: "Không thể đọc dữ liệu kế toán." }, { status: 500 });
  }
}
