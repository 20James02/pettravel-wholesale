import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      company: user.company,
      email: user.email,
      role: user.role,
      isAdmin: user.isAdmin
    }
  });
}

/** Logout — clear session cookie */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("pt_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  return response;
}
