import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth";
import { getAdminReportsOverview } from "@/server/reports/repository";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requirePermission("accounting.read");
    const overview = await getAdminReportsOverview(user);
    return NextResponse.json({ overview });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Không thể tải báo cáo quản trị.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
