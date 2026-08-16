import "server-only";

import type {
  Product,
  Supplier,
  CustomerOrder,
  UserAccount
} from "@/lib/domain";
import { backendFetchJson } from "@/server/backend-client";

// ── BACKEND REST CLIENT ──────────────────────────────────────

const backendFetch = backendFetchJson;

// ── PRODUCTS & VARIANTS ──────────────────────────────────────

export async function getProducts(role: "guest" | "customer" | "admin"): Promise<Product[]> {
  return backendFetch(`/api/v1/products?role=${role}`);
}

export async function saveProduct(product: Product): Promise<void> {
  await backendFetch(`/api/v1/products`, {
    method: "POST",
    body: JSON.stringify(product)
  });
}

export async function deleteProduct(id: string): Promise<void> {
  await backendFetch(`/api/v1/products/${id}`, {
    method: "DELETE"
  });
}

// ── IN-MEMORY CACHE FOR STATIC/SEMI-STATIC DATA ─────────────

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

const dbCache = new Map<string, CacheEntry<unknown>>();
const DB_CACHE_TTL_MS = 60 * 1000; // 60 seconds

function getCached<T>(key: string): T | null {
  const entry = dbCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > DB_CACHE_TTL_MS) {
    dbCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T): void {
  dbCache.set(key, { data, cachedAt: Date.now() });
}

export function invalidateDbCache(prefix?: string): void {
  if (prefix) {
    for (const k of dbCache.keys()) {
      if (k.startsWith(prefix)) dbCache.delete(k);
    }
  } else {
    dbCache.clear();
  }
}

// ── SUPPLIERS ────────────────────────────────────────────────

export async function getSuppliers(): Promise<Supplier[]> {
  const cached = getCached<Supplier[]>("suppliers");
  if (cached) return cached;
  const data: Supplier[] = await backendFetch(`/api/v1/suppliers`);
  setCached("suppliers", data);
  return data;
}

export async function saveSupplier(supplier: Supplier): Promise<void> {
  invalidateDbCache("suppliers");
  await backendFetch(`/api/v1/suppliers`, {
    method: "POST",
    body: JSON.stringify(supplier)
  });
}

export async function deleteSupplier(id: string): Promise<void> {
  invalidateDbCache("suppliers");
  await backendFetch(`/api/v1/suppliers/${id}`, {
    method: "DELETE"
  });
}

// ── CATEGORIES (SETTINGS) ────────────────────────────────────

export async function getCategories(): Promise<string[]> {
  const cached = getCached<string[]>("categories");
  if (cached) return cached;
  const data: string[] = await backendFetch(`/api/v1/categories`);
  setCached("categories", data);
  return data;
}

export async function saveCategories(categories: string[]): Promise<void> {
  invalidateDbCache("categories");
  await backendFetch(`/api/v1/categories`, {
    method: "POST",
    body: JSON.stringify({ categories })
  });
}

// ── ORDERS ───────────────────────────────────────────────────

export async function getOrders(user: UserAccount): Promise<CustomerOrder[]> {
  return backendFetch(`/api/v1/orders/list?user_id=${user.id}&is_admin=${user.isAdmin}`);
}

export async function saveOrder(
  order: CustomerOrder,
  creatorId: string,
  expectedUpdatedAt?: string
): Promise<{ orderId: string; orderNumber: string; updatedAt: string }> {
  return backendFetch(`/api/v1/orders/save?creator_id=${creatorId}`, {
    method: "POST",
    body: JSON.stringify({ order, expectedUpdatedAt })
  });
}

// ── ADMIN SETTINGS & PERMISSIONS ─────────────────────────────

export interface AdminPolicy {
  freeShippingThreshold: number;
  defaultDepositRate: number;
  maxOperatorDiscountRate: number;
  requireManagerApprovalAbove: number;
}

export async function getAdminPolicy(): Promise<AdminPolicy> {
  const cached = getCached<AdminPolicy>("admin_policy");
  if (cached) return cached;
  const data: AdminPolicy = await backendFetch(`/api/v1/categories/policy`);
  setCached("admin_policy", data);
  return data;
}

export async function getRolePermissions(): Promise<Record<string, string[]>> {
  const cached = getCached<Record<string, string[]>>("role_permissions");
  if (cached) return cached;
  const data: Record<string, string[]> = await backendFetch(`/api/v1/users/role-permissions`);
  setCached("role_permissions", data);
  return data;
}

// ── USER ACCOUNTS ────────────────────────────────────────────

export interface AppUserRow {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  avatarUrl: string;
  role: string;
  company: string;
  createdAt: string;
}

export async function getAppUsers(): Promise<AppUserRow[]> {
  return backendFetch(`/api/v1/users`);
}
export async function createAppUser(input: {
  id?: string;
  email: string;
  fullName: string;
  phone: string;
  passwordRaw: string;
  role: string;
  company?: string;
}): Promise<void> {
  await backendFetch(`/api/v1/users`, {
    method: "POST",
    body: JSON.stringify({
      id: input.id,
      email: input.email,
      fullName: input.fullName,
      phone: input.phone,
      password: input.passwordRaw,
      role: input.role,
      company: input.company
    })
  });
}

export async function updateUserProfile(
  id: string,
  updates: { fullName?: string; phone?: string; role?: string; company?: string; avatarUrl?: string; newPasswordRaw?: string }
): Promise<void> {
  await backendFetch(`/api/v1/users/profile`, {
    method: "PUT",
    body: JSON.stringify({
      id,
      fullName: updates.fullName,
      phone: updates.phone,
      role: updates.role,
      company: updates.company,
      password: updates.newPasswordRaw
    })
  });
}

export async function deleteAppUser(id: string): Promise<{ status: string; message: string }> {
  return backendFetch(`/api/v1/users/${id}`, {
    method: "DELETE"
  });
}

