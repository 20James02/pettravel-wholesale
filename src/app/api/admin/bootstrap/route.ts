import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { requireSameOrigin } from "@/server/auth";
import { createAppUser } from "@/server/db";

export const runtime = "nodejs";

const bootstrapSchema = z.object({
  email: z.string().email(),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(9).max(30),
  password: z.string().min(12).max(128)
});

function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
  } catch (resp) {
    if (resp instanceof Response) return resp;
  }

  const configuredEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const configuredToken = process.env.ADMIN_BOOTSTRAP_TOKEN?.trim();

  if (!configuredEmail || !configuredToken || configuredToken.length < 32) {
    return NextResponse.json({ error: "Bootstrap admin is not configured." }, { status: 404 });
  }

  const providedToken = request.headers.get("x-bootstrap-token")?.trim() ?? "";
  if (!timingSafeEqualString(providedToken, configuredToken)) {
    return NextResponse.json({ error: "Bootstrap token is invalid." }, { status: 403 });
  }

  try {
    const payload = bootstrapSchema.parse(await request.json());
    if (payload.email.trim().toLowerCase() !== configuredEmail) {
      return NextResponse.json({ error: "Bootstrap email does not match configured owner." }, { status: 403 });
    }

    await createAppUser({
      email: payload.email,
      fullName: payload.fullName,
      phone: payload.phone,
      passwordRaw: payload.password,
      role: "super_admin",
      company: "Pet Travel Wholesale"
    });

    return NextResponse.json({ ok: true, message: "Bootstrap admin created. Remove ADMIN_BOOTSTRAP_TOKEN after verification." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to bootstrap admin.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
