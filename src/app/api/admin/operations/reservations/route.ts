import { NextResponse } from "next/server";
import { getValidationErrorMessage, stockReservationCommandSchema } from "@/lib/validation";
import { requirePermission, requireSameOrigin } from "@/server/auth";
import { runStockReservationCommand } from "@/server/operations/reservations";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = stockReservationCommandSchema.parse(await request.json());
    const user = await requirePermission(input.action === "consume_order" ? "operations.post" : "operations.write");
    const result = await runStockReservationCommand(input, user);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = getValidationErrorMessage(error, "Không thể xử lý giữ hàng cho đơn.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
