import { NextResponse } from "next/server";
import { z } from "zod";
import { createR2UploadUrl } from "@/server/r2";

export const runtime = "nodejs";

const presignSchema = z.object({
  orderId: z.string().min(3).max(64),
  fileName: z.string().min(3).max(180),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  purpose: z.enum(["payment-proof", "invoice", "product-image"])
});

export async function POST(request: Request) {
  try {
    const payload = presignSchema.parse(await request.json());
    const result = await createR2UploadUrl(payload);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create upload URL.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
