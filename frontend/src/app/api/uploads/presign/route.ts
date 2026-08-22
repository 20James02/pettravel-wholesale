import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrders } from "@/server/db";
import { hasPermission, requireAuth, requireSameOrigin } from "@/server/auth";
import { BackendRequestError, backendFetchJson } from "@/server/backend-client";
import { getValidationErrorMessage } from "@/lib/validation";
import { consumeRateLimit, getRequestRateLimitKey } from "@/server/rate-limit";

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
    const rateLimit = consumeRateLimit(getRequestRateLimitKey(request, "upload-presign", user.id), {
      limit: 30,
      windowMs: 10 * 60 * 1000
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Bạn tạo quá nhiều yêu cầu upload. Vui lòng thử lại sau." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }
    const payload = presignSchema.parse(await request.json());

    const isProductUpload = payload.purpose === "product-image" || payload.purpose === "variant-image";

    if (isProductUpload && payload.contentType === "application/pdf") {
      return NextResponse.json({ error: "Ảnh sản phẩm chỉ chấp nhận định dạng ảnh." }, { status: 400 });
    }

    if (isProductUpload && !hasPermission(user, "catalog.write")) {
      return NextResponse.json({ error: "Chỉ Quản trị viên mới có quyền upload ảnh sản phẩm." }, { status: 403 });
    }

    if (payload.purpose === "invoice" && !hasPermission(user, "accounting.write")) {
      return NextResponse.json({ error: "Bạn không có quyền upload hóa đơn." }, { status: 403 });
    }

    if (!isProductUpload) {
      if (!payload.orderId) {
        return NextResponse.json({ error: "Cần mã đơn hàng để upload chứng từ." }, { status: 400 });
      }
      const order = (await getOrders(user)).find((item) => item.id === payload.orderId);
      if (!order) {
        return NextResponse.json({ error: "Không có quyền upload vào đơn hàng này." }, { status: 403 });
      }
      if (
        payload.purpose === "payment-proof" &&
        !order.paymentRequests.some(
          (paymentRequest) =>
            paymentRequest.status === "active" && new Date(paymentRequest.expiresAt).getTime() > Date.now()
        )
      ) {
        return NextResponse.json({ error: "Đơn hàng không có yêu cầu thanh toán đang hoạt động." }, { status: 409 });
      }
    }

    const data = await backendFetchJson("/api/v1/uploads/presign", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof BackendRequestError) {
      const status = error.status >= 500 ? 503 : error.status;
      return NextResponse.json(
        { error: status === 503 ? "Dịch vụ lưu trữ tạm thời chưa sẵn sàng." : "Yêu cầu upload không hợp lệ." },
        { status }
      );
    }
    const message = getValidationErrorMessage(error, "Không thể tạo đường dẫn upload.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
