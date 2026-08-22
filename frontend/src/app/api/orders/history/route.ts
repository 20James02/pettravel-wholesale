import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth";
import { getOrderRevisionHistory } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch (response) {
    if (response instanceof Response) return response;
    throw response;
  }

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("order_id");
  if (!orderId) {
    return NextResponse.json({ error: "Thiếu mã đơn hàng." }, { status: 400 });
  }

  try {
    const history = await getOrderRevisionHistory(orderId, user);
    return NextResponse.json({ history });
  } catch (error) {
    console.error("ORDER_HISTORY_FETCH_FAILED", {
      orderId,
      userId: user.id,
      error: error instanceof Error ? error.message : "unknown"
    });
    return NextResponse.json(
      { error: "Không thể tải lịch sử đơn hàng. Vui lòng thử lại sau." },
      { status: 500 }
    );
  }
}
