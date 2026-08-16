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

// ── SUPPLIERS ────────────────────────────────────────────────

export async function getSuppliers(): Promise<Supplier[]> {
  return backendFetch(`/api/v1/suppliers`);
}

export async function saveSupplier(supplier: Supplier): Promise<void> {
  await backendFetch(`/api/v1/suppliers`, {
    method: "POST",
    body: JSON.stringify(supplier)
  });
}

export async function deleteSupplier(id: string): Promise<void> {
  await backendFetch(`/api/v1/suppliers/${id}`, {
    method: "DELETE"
  });
}

// ── CATEGORIES (SETTINGS) ────────────────────────────────────

export async function getCategories(): Promise<string[]> {
  return backendFetch(`/api/v1/categories`);
}

export async function saveCategories(categories: string[]): Promise<void> {
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
  return backendFetch(`/api/v1/categories/policy`);
}

export async function getRolePermissions(): Promise<Record<string, string[]>> {
  return backendFetch(`/api/v1/users/role-permissions`);
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

