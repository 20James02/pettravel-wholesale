import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { getAdminPolicy, getRolePermissions } from "@/server/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/policy — Admin only.
 * Returns admin policy settings and role permissions from Supabase app_settings.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  try {
    const adminPolicy = await getAdminPolicy();
    const rolePermissions = await getRolePermissions();
    return NextResponse.json({ adminPolicy, rolePermissions });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Không thể lấy thông tin cấu hình.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
