import { NextResponse } from "next/server";
import { z } from "zod";
import type { RoleKey } from "@/lib/domain";
import { createSupabaseServiceClient } from "@/server/supabase";
import { encodeSession, isConfiguredAdminEmail, requireSameOrigin, verifyPassword } from "@/server/auth";
import { emailSchema, getValidationErrorMessage, loginPasswordSchema } from "@/lib/validation";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema
});

const INTERNAL_ROLE_KEYS: ReadonlySet<RoleKey> = new Set([
  "super_admin",
  "admin_manager",
  "order_operator",
  "accountant",
  "warehouse"
]);

interface LoginUserRow {
  id: string;
  full_name: string;
  email: string;
  organization_id?: string | null;
  password_hash: string | null;
  organizations?: { name?: string | null } | Array<{ name?: string | null }> | null;
  user_roles?: Array<{
    roles?: { key?: RoleKey | null } | Array<{ key?: RoleKey | null }> | null;
  }> | null;
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function roleFromLoginRow(row: LoginUserRow): RoleKey {
  if (isConfiguredAdminEmail(row.email)) {
    return "super_admin";
  }

  const roleKey = row.user_roles
    ?.map((userRole) => relationOne(userRole.roles)?.key)
    .find((key): key is RoleKey => Boolean(key));

  return roleKey ?? "customer_owner";
}

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
        organization_id,
        password_hash,
        organizations (
          name
        ),
        user_roles (
          roles (
            key
          )
        )
      `)
      .eq("email", email)
      .eq("status", "active")
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

    const row = user as LoginUserRow;
    const role = roleFromLoginRow(row);
    const isAdmin = INTERNAL_ROLE_KEYS.has(role);
    const token = encodeSession(user.id);
    const org = relationOne(row.organizations);

    const response = NextResponse.json({
      user: {
        id: row.id,
        name: row.full_name,
        company: org?.name ?? "Happy Paws Retail",
        organizationId: row.organization_id ?? undefined,
        email: row.email,
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
