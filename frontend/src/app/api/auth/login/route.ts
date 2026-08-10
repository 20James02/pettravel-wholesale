import { NextResponse } from "next/server";
import { z } from "zod";
import type { RoleKey } from "@/lib/domain";
import { encodeSession, requireSameOrigin } from "@/server/auth";
import { emailSchema, getValidationErrorMessage, loginPasswordSchema } from "@/lib/validation";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema
});

const INTERNAL_ROLE_KEYS: ReadonlySet<RoleKey> = new Set([
  "super_admin",
  "admin_manager",
  "order_operator",
  "accountant",
  "warehouse"
]);

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { email, password } = loginSchema.parse(await request.json());

    const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const res = await fetch(`${BACKEND_URL}/api/v1/auth/login-json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
      const text = await res.text();
      try {
        const errObj = JSON.parse(text);
        return NextResponse.json({ error: errObj.detail || "Sai email hoặc mật khẩu." }, { status: res.status });
      } catch {
        return NextResponse.json({ error: "Tài khoản không tồn tại hoặc thông tin đăng nhập sai." }, { status: 401 });
      }
    }

    const data = await res.json();
    const user = data.user;
    const role = user.role as RoleKey;
    const isAdmin = INTERNAL_ROLE_KEYS.has(role);

    const token = encodeSession(user.id);

    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        company: user.company,
        email: user.email,
        role,
        isAdmin
      }
    });

    response.cookies.set("pt_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12
    });

    return response;
  } catch (error) {
    const message = getValidationErrorMessage(error, "Lỗi đăng nhập.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
