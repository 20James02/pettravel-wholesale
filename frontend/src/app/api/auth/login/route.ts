import { NextResponse } from "next/server";
import { z } from "zod";
import type { RoleKey } from "@/lib/domain";
import { encodeSession, requireSameOrigin } from "@/server/auth";
import { getBackendHeaders, getBackendUrl } from "@/server/backend-client";
import {
  loginIdentifierSchema,
  getValidationErrorMessage,
  loginPasswordSchema
} from "@/lib/validation";

export const runtime = "nodejs";

const loginSchema = z.object({
  identifier: loginIdentifierSchema.optional(),
  email: z.string().optional(),
  password: loginPasswordSchema
}).refine((data) => Boolean(data.identifier?.trim() || data.email?.trim()), {
  message: "Vui lòng nhập email hoặc số điện thoại đăng nhập.",
  path: ["identifier"]
});

const INTERNAL_ROLE_KEYS: ReadonlySet<RoleKey> = new Set([
  "super_admin",
  "admin_manager",
  "order_operator",
  "accountant",
  "warehouse"
]);

interface BackendLoginResponse {
  detail?: string;
  error?: string;
  user?: {
    id: string;
    name: string;
    company?: string;
    email: string;
    role: string;
  };
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await request.json();
    const { identifier, email, password } = loginSchema.parse(body);
    const loginTarget = (identifier || email || "").trim();

    const BACKEND_URL = getBackendUrl();
    let res: Response;
    try {
      res = await fetch(`${BACKEND_URL}/api/v1/auth/login-json`, {
        method: "POST",
        headers: getBackendHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ identifier: loginTarget, email: loginTarget, password })
      });
    } catch {
      return NextResponse.json(
        { error: "Không thể kết nối đến máy chủ. Vui lòng thử lại sau." },
        { status: 502 }
      );
    }

    const text = await res.text();
    let data: BackendLoginResponse = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text || `Máy chủ phản hồi lỗi HTTP ${res.status}` };
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: data.detail || data.error || "Sai email hoặc mật khẩu đăng nhập." },
        { status: res.status || 401 }
      );
    }

    const user = data.user;
    if (!user || !user.id) {
      return NextResponse.json(
        { error: "Dữ liệu người dùng từ máy chủ không hợp lệ." },
        { status: 500 }
      );
    }
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
