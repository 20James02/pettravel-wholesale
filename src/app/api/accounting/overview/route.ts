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

    const message = error instanceof Error
      ? error.message
      : "Khong the doc du lieu ke toan.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
