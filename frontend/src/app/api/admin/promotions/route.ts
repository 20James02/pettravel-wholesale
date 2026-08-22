import { NextResponse } from "next/server";
import { requireAdmin, requirePermission, requireSameOrigin } from "@/server/auth";
import { BackendRequestError, backendFetchJson as backendFetch } from "@/server/backend-client";
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
  } catch (error) {
    console.error("PROMOTIONS_POLICY_FETCH_FAILED", error);
    return NextResponse.json(
      { error: "Không thể tải chính sách giá từ hệ thống dữ liệu." },
      { status: 502 }
    );
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
    if (error instanceof Response) return error;
    if (error instanceof BackendRequestError) {
      console.error("PROMOTIONS_POLICY_SAVE_FAILED", error);
      return NextResponse.json(
        { error: "Không thể lưu chính sách giá vào hệ thống dữ liệu." },
        { status: 502 }
      );
    }
    const msg = getValidationErrorMessage(error, "Dữ liệu cấu hình không hợp lệ.");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
