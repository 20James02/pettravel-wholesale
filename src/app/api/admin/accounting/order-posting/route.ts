import { NextResponse } from "next/server";
import { accountingOrderPostingSchema, getValidationErrorMessage } from "@/lib/validation";
import { postOrderAccounting } from "@/server/accounting/order-posting";
import { requirePermission, requireSameOrigin } from "@/server/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = accountingOrderPostingSchema.parse(await request.json());
    const user = await requirePermission("accounting.post");
    const result = await postOrderAccounting(input, user);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = getValidationErrorMessage(error, "Không thể ghi sổ kế toán cho đơn hàng.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
