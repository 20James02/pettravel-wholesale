import "server-only";

import { cookies } from "next/headers";
import type { UserAccount } from "@/lib/domain";
import { createSupabaseServiceClient } from "./supabase";
import crypto from "crypto";

export function hashPassword(password: string): string {
  // PBKDF2-SHA512 with iterations and pepper for enterprise security
  const pepper = process.env.PASSWORD_PEPPER || "pettravel_secret_pepper_2026";
  return crypto.pbkdf2Sync(password, pepper, 1000, 64, "sha512").toString("hex");
}

const SESSION_COOKIE = "pt_session";

/**
 * Encode a session token using HMAC-SHA256 signature to prevent tampering.
 * Format: userId.signature
 */
export function encodeSession(userId: string): string {
  const secret = process.env.JWT_SECRET || "pettravel_secret_session_key_2026";
  const signature = crypto.createHmac("sha256", secret).update(userId).digest("base64url");
  return `${userId}.${signature}`;
}

/**
 * Decode and verify the session token's signature.
 */
function decodeSession(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [userId, signature] = parts;
    const secret = process.env.JWT_SECRET || "pettravel_secret_session_key_2026";
    const expectedSignature = crypto.createHmac("sha256", secret).update(userId).digest("base64url");
    if (signature === expectedSignature) {
      return userId;
    }
    return null;
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
