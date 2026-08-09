import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { getAppUsers, createAppUser } from "@/server/db";

export const runtime = "nodejs";

const createUserSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(9),
  password: z.string().min(6),
  role: z.string(),
  company: z.string().optional()
});

export async function GET() {
  try {
    await requireAdmin();
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  try {
    const users = await getAppUsers();
    return NextResponse.json({ users });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Không thể lấy danh sách tài khoản.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  try {
    const payload = createUserSchema.parse(await request.json());

    await createAppUser({
      email: payload.email,
      fullName: payload.fullName,
      phone: payload.phone,
      passwordRaw: payload.password,
      role: payload.role,
      company: payload.company
    });

    return NextResponse.json({ success: true, message: "Tạo tài khoản thành công!" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Không thể tạo tài khoản.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
