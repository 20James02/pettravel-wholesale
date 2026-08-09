import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, requireSameOrigin } from "@/server/auth";
import { createAppUser, getAppUsers } from "@/server/db";
import {
  emailSchema,
  fullNameSchema,
  getValidationErrorMessage,
  optionalCompanySchema,
  passwordSchema,
  phoneSchema
} from "@/lib/validation";

export const runtime = "nodejs";

const createUserSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  role: z.enum([
    "super_admin",
    "admin_manager",
    "order_operator",
    "accountant",
    "warehouse",
    "customer_owner",
    "customer_staff"
  ]),
  company: optionalCompanySchema
});

export async function GET() {
  try {
    await requirePermission("rbac.write");
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  try {
    const users = await getAppUsers();
    return NextResponse.json({ users });
  } catch (error) {
    const msg = getValidationErrorMessage(error, "Không thể lấy danh sách tài khoản.");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requirePermission("rbac.write");
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return NextResponse.json({ error: "Lỗi xác thực." }, { status: 403 });
  }

  try {
    const parsed = createUserSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: getValidationErrorMessage(parsed.error, "Dữ liệu tạo tài khoản không hợp lệ.") },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    await createAppUser({
      email: payload.email,
      fullName: payload.fullName,
      phone: payload.phone,
      passwordRaw: payload.password,
      role: payload.role,
      company: payload.company || undefined
    });

    return NextResponse.json({ success: true, message: "Tạo tài khoản thành công!" });
  } catch (error) {
    const msg = getValidationErrorMessage(error, "Không thể tạo tài khoản.");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
