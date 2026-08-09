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
    const message = error instanceof Error ? error.message : "Không thể đọc dữ liệu vận hành.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
