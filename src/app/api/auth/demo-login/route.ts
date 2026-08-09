import { NextResponse } from "next/server";
import { z } from "zod";
import { demoUsers } from "@/lib/mock-data";
import { encodeSession } from "@/server/auth";
import { bootstrapDemoUsers } from "@/server/db";

export const runtime = "nodejs";

const loginSchema = z.object({
  userId: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const { userId } = loginSchema.parse(await request.json());
    const user = demoUsers.find((u) => u.id === userId);

    if (!user) {
      return NextResponse.json(
        { error: "Tài khoản không tồn tại." },
        { status: 404 }
      );
    }

    const token = encodeSession(userId);
    await bootstrapDemoUsers();
    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        company: user.company,
        email: user.email,
        role: user.role,
        isAdmin: user.isAdmin
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
