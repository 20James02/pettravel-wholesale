import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { suppliers } from "@/lib/mock-data";

export const runtime = "nodejs";

/**
 * GET /api/suppliers — Admin only.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 500 });
  }

  return NextResponse.json({ suppliers });
}
