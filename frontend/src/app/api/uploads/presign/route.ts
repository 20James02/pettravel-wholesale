import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrders } from "@/server/db";
import { hasPermission, requireAuth, requireSameOrigin } from "@/server/auth";
import { backendFetchJson } from "@/server/backend-client";
import { getValidationErrorMessage } from "@/lib/validation";

export const runtime = "nodejs";

const presignSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, "Tên file không được để trống.")
    .max(180, "Tên file không được vượt quá 180 ký tự.")
    .refine((value) => !/[\\/]/.test(value), "Tên file không được chứa đường dẫn."),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif", "application/pdf"]),
  fileSizeBytes: z
    .number()
    .int("Dung lượng file không hợp lệ.")
    .positive("Dung lượng file phải lớn hơn 0.")
    .max(10 * 1024 * 1024, "File không được vượt quá 10MB."),
  purpose: z.enum(["payment-proof", "invoice", "product-image", "variant-image"]),
  orderId: z.string().trim().min(3).max(64).optional(),
  productId: z.string().trim().min(1).max(64).optional(),
  variantId: z.string().trim().min(1).max(64).optional()
});

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireAuth();
    const payload = presignSchema.parse(await request.json());

    const isProductUpload = payload.purpose === "product-image" || payload.purpose === "variant-image";

    if (isProductUpload && !hasPermission(user, "catalog.write")) {
      return NextResponse.json({ error: "Chỉ Quản trị viên mới có quyền upload ảnh sản phẩm." }, { status: 403 });
    }

    if (!isProductUpload) {
      if (!payload.orderId) {
        return NextResponse.json({ error: "Cần mã đơn hàng để upload chứng từ." }, { status: 400 });
      }
      const orders = await getOrders(user);
      const canAccessOrder = orders.some((order) => order.id === payload.orderId);
      if (!canAccessOrder) {
        return NextResponse.json({ error: "Không có quyền upload vào đơn hàng này." }, { status: 403 });
      }
    }

    const data = await backendFetchJson("/api/v1/uploads/presign", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return NextResponse.json(data);
  } catch (error) {
    const message = getValidationErrorMessage(error, "Không thể tạo đường dẫn upload.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
