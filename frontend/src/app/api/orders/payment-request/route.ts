import { NextResponse } from "next/server";
import { z } from "zod";
import { getValidationErrorMessage } from "@/lib/validation";
import { requirePermission, requireSameOrigin } from "@/server/auth";
import { BackendRequestError, backendFetchJson } from "@/server/backend-client";

export const runtime = "nodejs";

const reissuePaymentRequestSchema = z.object({
  orderId: z.string().trim().min(1).max(128)
}).strict();

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("order.confirm_payment");
    const input = reissuePaymentRequestSchema.parse(await request.json());
    const result = await backendFetchJson(
      `/api/v1/orders/payment-request/reissue?actor_id=${encodeURIComponent(user.id)}`,
      {
        method: "POST",
        body: JSON.stringify({ order_id: input.orderId })
      }
    ) as { paymentRequest: Record<string, unknown> };
    return NextResponse.json({ success: true, paymentRequest: result.paymentRequest });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = getValidationErrorMessage(error, "Không thể phát hành lại yêu cầu thanh toán.");
    return NextResponse.json(
      { error: message },
      { status: error instanceof BackendRequestError ? error.status : 400 }
    );
  }
}
