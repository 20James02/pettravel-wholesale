import { NextResponse } from "next/server";
import { z } from "zod";
import { hasPermission, requireAuth } from "@/server/auth";
import { backendFetchJson } from "@/server/backend-client";
import { getOrders } from "@/server/db";

export const runtime = "nodejs";

const querySchema = z.object({
  orderId: z.string().trim().min(3).max(64),
  proofId: z.string().trim().min(3).max(128)
});

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    if (user.isAdmin && !hasPermission(user, "order.confirm_payment")) {
      return NextResponse.json({ error: "Bạn không có quyền xem minh chứng thanh toán." }, { status: 403 });
    }
    const url = new URL(request.url);
    const query = querySchema.parse({
      orderId: url.searchParams.get("orderId"),
      proofId: url.searchParams.get("proofId")
    });

    const order = (await getOrders(user)).find((item) => item.id === query.orderId);
    const proof = order?.paymentProofs.find((item) => item.id === query.proofId);
    if (!order || !proof?.storageKey) {
      return NextResponse.json({ error: "Không tìm thấy minh chứng hoặc bạn không có quyền truy cập." }, { status: 404 });
    }

    const data = (await backendFetchJson("/api/v1/uploads/private-download-url", {
      method: "POST",
      body: JSON.stringify({
        purpose: "payment-proof",
        orderId: order.id,
        storageKey: proof.storageKey
      })
    })) as { downloadUrl?: string };

    const downloadUrl = new URL(data.downloadUrl ?? "");
    if (downloadUrl.protocol !== "https:" || !downloadUrl.hostname.endsWith(".r2.cloudflarestorage.com")) {
      throw new Error("Invalid private storage download URL");
    }

    const response = NextResponse.redirect(downloadUrl, { status: 302 });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Unable to create private proof download", error);
    return NextResponse.json({ error: "Không thể mở minh chứng lúc này." }, { status: 400 });
  }
}
