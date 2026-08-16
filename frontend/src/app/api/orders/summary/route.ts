import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth";
import { getOrdersSummary } from "@/server/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch (response) {
    if (response instanceof Response) return response;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));
  const cursorUpdatedAt = searchParams.get("cursor_updated_at") || undefined;
  const cursorId = searchParams.get("cursor_id") || undefined;

  try {
    const summary = await getOrdersSummary(user, limit, cursorUpdatedAt, cursorId);
    return NextResponse.json(summary);
  } catch {
    return NextResponse.json({ error: "Không thể lấy danh sách đơn hàng tóm tắt." }, { status: 500 });
  }
}
