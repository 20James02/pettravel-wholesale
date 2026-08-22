import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth";
import { getOperationsOverview } from "@/server/operations/repository";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requirePermission("operations.read");
    const overview = await getOperationsOverview(user);
    return NextResponse.json({ overview });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("OPERATIONS_OVERVIEW_FAILED", error);
    return NextResponse.json({ error: "Không thể đọc dữ liệu vận hành." }, { status: 500 });
  }
}
