import { NextResponse } from "next/server";
import { z } from "zod";

import { getValidationErrorMessage } from "@/lib/validation";
import { requireAuth, requireSameOrigin } from "@/server/auth";
import { getOrders } from "@/server/db";
import { buildPaymentReference, buildQrPayload } from "@/server/payment";

export const runtime = "nodejs";

const paymentRequestSchema = z.object({
  orderId: z.string().trim().min(3).max(64),
  orderNumber: z.string().trim().min(3).max(80),
  quoteVersion: z.number().int().positive(),
  amount: z.number().int().positive().max(100_000_000_000),
  purpose: z.enum(["deposit", "full", "remaining"])
});

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireAuth();
    const input = paymentRequestSchema.parse(await request.json());
    const order = (await getOrders(user)).find((candidate) => candidate.id === input.orderId);
    if (!order || order.number !== input.orderNumber) {
      return NextResponse.json({ error: "Không có quyền tạo yêu cầu thanh toán cho đơn này." }, { status: 403 });
    }

    const reference = buildPaymentReference(input);
    return NextResponse.json({
      id: `pay_req_${crypto.randomUUID()}`,
      quoteVersion: input.quoteVersion,
      amount: input.amount,
      purpose: input.purpose,
      reference,
      qrPayload: buildQrPayload({ ...input, reference }),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      status: "active"
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: getValidationErrorMessage(error, "Không thể tạo yêu cầu thanh toán.") },
      { status: 400 }
    );
  }
}
