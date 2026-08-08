import "server-only";

import { cookies } from "next/headers";
import type { UserAccount } from "@/lib/domain";
import { demoUsers } from "@/lib/mock-data";

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

  // Demo: look up in mock data. Production: query Supabase.
  const user = demoUsers.find((u) => u.id === userId);
  return user ?? null;
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
