import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, requirePermission, requireSameOrigin } from "@/server/auth";
import { createSupabaseServiceClient } from "@/server/supabase";

export const runtime = "nodejs";

const promotionsSchema = z.object({
  freeShippingThreshold: z.number().nonnegative(),
  defaultDepositRate: z.number().min(0).max(1),
  maxOperatorDiscountRate: z.number().min(0).max(1),
  requireManagerApprovalAbove: z.number().nonnegative(),
  giftThreshold: z.number().nonnegative().optional(),
  giftName: z.string().optional()
});

export async function GET() {
  try {
    await requirePermission("order.adjust");
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "admin_policy")
    .maybeSingle();

  if (error || !data) {
    // Default fallback policy settings
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

  return NextResponse.json({ policy: data.value });
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
    const payload = promotionsSchema.parse(await request.json());
    const supabase = createSupabaseServiceClient();

    const { error } = await supabase.from("app_settings").upsert({
      key: "admin_policy",
      value: payload
    });

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, policy: payload });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Dữ liệu không hợp lệ.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
