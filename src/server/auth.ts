import "server-only";

import { cookies } from "next/headers";
import type { UserAccount } from "@/lib/domain";
import { createSupabaseServiceClient } from "./supabase";

const SESSION_COOKIE = "pt_session";

/**
 * Encode a simple session token (demo only — replace with JWT/Supabase Auth later).
 * Format: base64(userId)
 */
export function encodeSession(userId: string): string {
  return Buffer.from(userId, "utf-8").toString("base64url");
}

/**
 * Decode a session token back to userId.
 */
function decodeSession(token: string): string | null {
  try {
    return Buffer.from(token, "base64url").toString("utf-8");
  } catch {
    return null;
  }
}

/**
 * Read session cookie and return the current user, or null if not logged in.
 */
export async function getSessionUser(): Promise<UserAccount | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const userId = decodeSession(token);
  if (!userId) return null;

  const DEMO_UUID_MAP: Record<string, string> = {
    u_admin: "00000000-0000-0000-0000-000000000001",
    u_customer_minh: "00000000-0000-0000-0000-000000000002",
    u_customer_lan: "00000000-0000-0000-0000-000000000003"
  };

  const uuid = DEMO_UUID_MAP[userId] || userId;

  try {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("app_users")
      .select(`
        id,
        full_name,
        email,
        organizations (
          name
        )
      `)
      .eq("id", uuid)
      .single();

    if (error || !data) return null;

    const isAdmin = data.email === "admin@pettravel.vn";
    const org: any = data.organizations;

    return {
      id: data.id,
      name: data.full_name,
      company: org?.name ?? "Happy Paws Retail",
      email: data.email,
      role: isAdmin ? "super_admin" : "customer_owner",
      isAdmin
    };
  } catch {
    return null;
  }
}

/**
 * Require authentication. Returns user or throws a Response with 401.
 */
export async function requireAuth(): Promise<UserAccount> {
  const user = await getSessionUser();
  if (!user) {
    throw new Response(JSON.stringify({ error: "Vui lòng đăng nhập để tiếp tục." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}

/**
 * Require admin role. Returns user or throws a Response with 403.
 */
export async function requireAdmin(): Promise<UserAccount> {
  const user = await requireAuth();
  if (!user.isAdmin) {
    throw new Response(JSON.stringify({ error: "Bạn không có quyền truy cập khu vực này." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}
