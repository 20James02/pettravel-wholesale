import "server-only";

import crypto from "crypto";
import { cookies } from "next/headers";
import type { PermissionKey, RoleKey, UserAccount } from "@/lib/domain";
import { getBackendHeaders, getBackendUrl } from "@/server/backend-client";
import { hasPermission as userHasPermission } from "@/server/authorization";

const SESSION_COOKIE = "pt_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const INTERNAL_ROLE_KEYS: ReadonlySet<RoleKey> = new Set([
  "super_admin",
  "admin_manager",
  "order_operator",
  "accountant",
  "warehouse"
]);
function getRequiredSecret(name: "JWT_SECRET"): string {
  const value = process.env[name];
  if (value && value.length >= 32) return value;

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be set to at least 32 characters in production.`);
  }

  return `dev-only-${name.toLowerCase()}-${"0".repeat(32)}`;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function encodeSession(userId: string): string {
  const payload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    nonce: crypto.randomBytes(16).toString("base64url")
  };
  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getRequiredSecret("JWT_SECRET"))
    .update(payloadEncoded)
    .digest("base64url");

  return `${payloadEncoded}.${signature}`;
}

function decodeSession(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [payloadEncoded, signature] = parts;
    const expectedSignature = crypto
      .createHmac("sha256", getRequiredSecret("JWT_SECRET"))
      .update(payloadEncoded)
      .digest("base64url");

    if (!timingSafeEqualString(signature, expectedSignature)) return null;

    const payload = JSON.parse(Buffer.from(payloadEncoded, "base64url").toString("utf8")) as {
      sub?: string;
      exp?: number;
    };

    if (!payload.sub || !payload.exp) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

    return payload.sub;
  } catch {
    return null;
  }
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;

  const requestOrigin = new URL(request.url).origin;
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin
    : requestOrigin;

  if (origin !== requestOrigin && origin !== appOrigin) {
    throw new Response(JSON.stringify({ error: "Nguon request khong hop le." }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }
}
interface CachedUserSession {
  user: UserAccount;
  cachedAt: number;
}

const userSessionCache = new Map<string, CachedUserSession>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export function invalidateUserSessionCache(userId?: string): void {
  if (userId) {
    userSessionCache.delete(userId);
  } else {
    userSessionCache.clear();
  }
}

export async function getSessionUser(): Promise<UserAccount | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const userId = decodeSession(token);
  if (!userId) return null;

  const now = Date.now();
  const cached = userSessionCache.get(userId);
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.user;
  }

  try {
    const res = await fetch(`${getBackendUrl()}/api/v1/users/by-id/${userId}`, {
      headers: getBackendHeaders()
    });
    if (!res.ok) return null;
    const row = await res.json();
    const role = row.role as RoleKey;
    if (!INTERNAL_ROLE_KEYS.has(role) && role !== "customer_owner" && role !== "customer_staff") {
      return null;
    }
    const isAdmin = INTERNAL_ROLE_KEYS.has(role);

    const userAccount: UserAccount = {
      id: row.id,
      name: row.name,
      company: row.company,
      organizationId: row.organizationId || undefined,
      email: row.email,
      role,
      isAdmin,
      permissions: Array.isArray(row.permissions) ? row.permissions : []
    };

    userSessionCache.set(userId, { user: userAccount, cachedAt: now });
    return userAccount;
  } catch {
    return null;
  }
}
export async function requireAuth(): Promise<UserAccount> {
  const user = await getSessionUser();
  if (!user) {
    throw new Response(JSON.stringify({ error: "Vui long dang nhap de tiep tuc." }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  return user;
}

export async function requireAdmin(): Promise<UserAccount> {
  const user = await requireAuth();
  if (!user.isAdmin) {
    throw new Response(JSON.stringify({ error: "Ban khong co quyen truy cap khu vuc nay." }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }
  return user;
}

export function hasPermission(user: UserAccount, permission: PermissionKey): boolean {
  return userHasPermission(user, permission);
}

export async function requirePermission(permission: PermissionKey): Promise<UserAccount> {
  const user = await requireAuth();
  if (!hasPermission(user, permission)) {
    throw new Response(JSON.stringify({ error: "Ban khong co quyen thuc hien thao tac nay." }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }

  return user;
}
