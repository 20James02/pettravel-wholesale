import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireSameOrigin } from "@/server/auth";
import { updateUserProfile } from "@/server/db";

export const runtime = "nodejs";

const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  avatarUrl: z.string().url().or(z.string().length(0)).optional(),
  newPassword: z.string().min(12).max(128).optional()
});

export async function PUT(request: Request) {
  let user;
  try {
    requireSameOrigin(request);
    user = await requireAuth();
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 401 });
  }

  try {
    const payload = updateProfileSchema.parse(await request.json());

    await updateUserProfile(user.id, {
      fullName: payload.fullName,
      avatarUrl: payload.avatarUrl || undefined,
      newPasswordRaw: payload.newPassword
    });

    return NextResponse.json({ success: true, message: "Cập nhật thông tin tài khoản thành công!" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Không thể cập nhật thông tin.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
