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
import { consumeRateLimit, getRequestRateLimitKey, resetRateLimit } from "@/server/rate-limit";

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
    const rateLimitKey = getRequestRateLimitKey(request, "login", loginTarget);
    const rateLimit = consumeRateLimit(rateLimitKey, { limit: 8, windowMs: 5 * 60 * 1_000 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi rồi thử lại." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

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
      data = {};
    }

    if (!res.ok) {
      const safeClientMessage = [400, 401, 403, 429].includes(res.status)
        ? data.detail || data.error || "Sai email hoặc mật khẩu đăng nhập."
        : "Máy chủ xử lý đăng nhập gặp sự cố. Vui lòng thử lại sau.";
      return NextResponse.json(
        { error: safeClientMessage },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 }
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
    resetRateLimit(rateLimitKey);

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
    if (error instanceof Response) return error;
    const message = getValidationErrorMessage(error, "Lỗi đăng nhập.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
