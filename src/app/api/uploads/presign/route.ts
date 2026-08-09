import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrders } from "@/server/db";
import { createR2UploadUrl } from "@/server/r2";
import { hasPermission, requireAuth, requireSameOrigin } from "@/server/auth";
import { getValidationErrorMessage } from "@/lib/validation";

export const runtime = "nodejs";

const presignSchema = z.object({
  orderId: z.string().trim().min(3, "Mã đơn hàng không hợp lệ.").max(64, "Mã đơn hàng quá dài."),
  fileName: z
    .string()
    .trim()
    .min(3, "Tên file quá ngắn.")
    .max(180, "Tên file không được vượt quá 180 ký tự.")
    .refine((value) => !/[\\/]/.test(value), "Tên file không được chứa đường dẫn."),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  fileSizeBytes: z.number().int("Dung lượng file không hợp lệ.").positive("Dung lượng file phải lớn hơn 0.").max(10 * 1024 * 1024, "File không được vượt quá 10MB."),
  purpose: z.enum(["payment-proof", "invoice", "product-image"])
});

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireAuth();
    const payload = presignSchema.parse(await request.json());

    if (payload.purpose === "product-image" && !hasPermission(user, "catalog.write")) {
      return NextResponse.json({ error: "Chi Admin duoc upload anh san pham." }, { status: 403 });
    }

    const orders = await getOrders(user);
    const canAccessOrder = orders.some((order) => order.id === payload.orderId);
    if (payload.purpose !== "product-image" && !canAccessOrder) {
      return NextResponse.json({ error: "Khong co quyen upload vao don hang nay." }, { status: 403 });
    }

    const result = await createR2UploadUrl(payload);
    return NextResponse.json(result);
  } catch (error) {
    const message = getValidationErrorMessage(error, "Không thể tạo đường dẫn upload.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
