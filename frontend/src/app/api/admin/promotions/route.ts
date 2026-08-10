import { NextResponse } from "next/server";
import { requireAdmin, requirePermission, requireSameOrigin } from "@/server/auth";
import { getValidationErrorMessage, promotionsPolicySchema } from "@/lib/validation";

export const runtime = "nodejs";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function backendFetch(path: string, options: RequestInit = {}) {
  const url = `${BACKEND_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend error: ${response.status} - ${text}`);
  }
  return response.json();
}

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
  } catch (error) {
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

