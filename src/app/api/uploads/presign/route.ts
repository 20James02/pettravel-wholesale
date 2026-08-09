import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrders } from "@/server/db";
import { createR2UploadUrl } from "@/server/r2";
import { hasPermission, requireAuth, requireSameOrigin } from "@/server/auth";

export const runtime = "nodejs";

const presignSchema = z.object({
  orderId: z.string().min(3).max(64),
  fileName: z.string().min(3).max(180),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  fileSizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
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
    const message = error instanceof Error ? error.message : "Unable to create upload URL.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
