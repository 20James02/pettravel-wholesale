import { NextResponse } from "next/server";
import { requireAdmin, requirePermission, requireSameOrigin } from "@/server/auth";
import { backendFetchJson as backendFetch } from "@/server/backend-client";
import { invalidateDbCache } from "@/server/db";
import { getValidationErrorMessage, promotionsPolicySchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requirePermission("order.adjust");
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  try {
    const data = await backendFetch(`/api/v1/categories/policy`);
    return NextResponse.json({ policy: data });
  } catch {
    return NextResponse.json({
      policy: {
        freeShippingThreshold: 5000000,
        defaultDepositRate: 0.3,
        maxOperatorDiscountRate: 0.08,
        requireManagerApprovalAbove: 500000,
        giftThreshold: 10000000,
        giftName: "Bát ăn inox cao cấp chống trượt"
      }
    });
  }
}

export async function PUT(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAdmin();
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  try {
    const payload = promotionsPolicySchema.parse(await request.json());
    invalidateDbCache("admin_policy");
    await backendFetch(`/api/v1/categories/policy`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return NextResponse.json({ success: true, policy: payload });
  } catch (error) {
    const msg = getValidationErrorMessage(error, "Dữ liệu cấu hình không hợp lệ.");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
