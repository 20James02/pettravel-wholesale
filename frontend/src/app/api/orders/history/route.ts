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
    return NextResponse.json(
      { error: (error as Error).message || "Không thể tải lịch sử đơn hàng." },
      { status: 500 }
    );
  }
}
