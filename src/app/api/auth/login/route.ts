import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/server/supabase";
import { encodeSession, isConfiguredAdminEmail, requireSameOrigin, verifyPassword } from "@/server/auth";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128)
});

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { email, password } = loginSchema.parse(await request.json());
    const supabase = createSupabaseServiceClient();

    const { data: user, error } = await supabase
      .from("app_users")
      .select(`
        id,
        full_name,
        email,
        password_hash,
        organizations (
          name
        )
      `)
      .eq("email", email.trim().toLowerCase())
      .single();

    if (error || !user) {
      return NextResponse.json(
        { error: "Tài khoản không tồn tại hoặc thông tin đăng nhập sai." },
        { status: 401 }
      );
    }

    if (!verifyPassword(password, user.password_hash)) {
      return NextResponse.json(
        { error: "Tài khoản không tồn tại hoặc thông tin đăng nhập sai." },
        { status: 401 }
      );
    }

    const isAdmin = isConfiguredAdminEmail(user.email);
    const token = encodeSession(user.id);
    const org = Array.isArray(user.organizations) ? user.organizations[0] : user.organizations;

    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.full_name,
        company: org?.name ?? "Happy Paws Retail",
        email: user.email,
        role: isAdmin ? "super_admin" : "customer_owner",
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
    const message = error instanceof Error ? error.message : "Lỗi đăng nhập.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
