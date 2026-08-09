import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/server/supabase";
import { encodeSession, hashPassword } from "@/server/auth";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export async function POST(request: Request) {
  try {
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

    const hash = hashPassword(password);
    if (user.password_hash !== hash) {
      return NextResponse.json(
        { error: "Tài khoản không tồn tại hoặc thông tin đăng nhập sai." },
        { status: 401 }
      );
    }

    const isAdmin = user.email === "admin@pettravel.vn";
    const token = encodeSession(user.id);
    const org: any = user.organizations;

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
      maxAge: 60 * 60 * 24 * 30 // 30 days
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi đăng nhập.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
