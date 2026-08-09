import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireSameOrigin } from "@/server/auth";
import { updateUserProfile } from "@/server/db";
import { fullNameSchema, getValidationErrorMessage, optionalUrlSchema, passwordSchema } from "@/lib/validation";

export const runtime = "nodejs";

const updateProfileSchema = z.object({
  fullName: fullNameSchema.optional(),
  avatarUrl: optionalUrlSchema.optional(),
  newPassword: passwordSchema.optional()
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
    const parsed = updateProfileSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: getValidationErrorMessage(parsed.error, "Dữ liệu cập nhật không hợp lệ.") },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    await updateUserProfile(user.id, {
      fullName: payload.fullName,
      avatarUrl: payload.avatarUrl || undefined,
      newPasswordRaw: payload.newPassword
    });

    return NextResponse.json({ success: true, message: "Cập nhật thông tin tài khoản thành công!" });
  } catch (error) {
    const msg = getValidationErrorMessage(error, "Không thể cập nhật thông tin.");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
