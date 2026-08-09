import { NextResponse } from "next/server";
import { z } from "zod";
import { createAppUser } from "@/server/db";

export const runtime = "nodejs";

const registerSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(9),
  company: z.string().min(2),
  password: z.string().min(6)
});

export async function POST(request: Request) {
  try {
    const payload = registerSchema.parse(await request.json());

    await createAppUser({
      email: payload.email,
      fullName: payload.fullName,
      phone: payload.phone,
      passwordRaw: payload.password,
      role: "customer_owner",
      company: payload.company
    });

    return NextResponse.json({ success: true, message: "Đăng ký tài khoản đại lý thành công!" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi đăng ký tài khoản.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
