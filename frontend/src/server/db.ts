import "server-only";

import crypto from "crypto";
import type {
  Product,
  ProductVariant,
  Supplier,
  CustomerOrder,
  UserAccount,
  RoleKey,
  OrderItem,
  QuoteVersion,
  PaymentRequest,
  PaymentProof,
  QuoteAdjustment,
  OrderComment
} from "@/lib/domain";
import { backendFetchJson } from "@/server/backend-client";

type NumericValue = number | string | null;

interface SupplierOfferRow {
  id: string;
  supplier_id: string;
  wholesale_price: NumericValue;
  min_order_qty: NumericValue;
  stock_qty: NumericValue;
  lead_time_days: NumericValue;
  active: boolean;
}

interface ProductVariantRow {
  id: string;
  sku: string;
  label: string;
  image_url?: string | null;
  active: boolean;
  supplier_offers?: SupplierOfferRow[] | null;
}

interface ProductRow {
  id: string;
  code: string;
  name: string;
  brand: string;
  category: string;
  description?: string | null;
  image_url?: string | null;
  images?: string[] | null;
  dimensions?: string | null;
  weight?: NumericValue;
  tags?: string[] | null;
  product_variants?: ProductVariantRow[] | null;
}

interface SupplierRow {
  id: string;
  code: string;
  name: string;
  lead_time_days: number;
  admin_only: boolean;
}

interface RelationUserRow {
  id?: string;
  full_name?: string | null;
  organization_id?: string | null;
  organizations?: { name?: string | null } | null;
}

interface OrderItemRow {
  id: string;
  product_code_snapshot: string;
  product_name_snapshot: string;
  variant_sku_snapshot: string;
  variant_label_snapshot: string;
  quantity: number;
  unit_price_snapshot: NumericValue;
  supplier_id: string;
}

interface QuoteAdjustmentRow {
  id: string;
  type: QuoteAdjustment["type"];
  label: string;
  amount: NumericValue;
  requires_approval: boolean;
}

interface QuoteVersionRow {
  id: string;
  version: number;
  status: QuoteVersion["status"];
  subtotal: NumericValue;
  final_total: NumericValue;
  deposit_amount: NumericValue;
  cod_remaining: NumericValue;
  expires_at: string;
  quote_adjustments?: QuoteAdjustmentRow[] | null;
}

interface PaymentProofRow {
  id: string;
  storage_key?: string | null;
  file_name: string;
  content_type?: string | null;
  file_size_bytes?: number | null;
  status: PaymentProof["status"];
  uploaded_at: string;
}

interface PaymentRequestRow {
  id: string;
  purpose: PaymentRequest["purpose"];
  amount: NumericValue;
  reference: string;
  qr_payload: string;
  status: PaymentRequest["status"];
  expires_at: string;
  payment_proofs?: PaymentProofRow[] | null;
}

interface OrderCommentRow {
  id: string;
  audience: OrderComment["audience"];
  message: string;
  created_at: string;
  app_users?: { full_name?: string | null } | null;
}

interface OrderRow {
  id: string;
  order_number: string;
  commercial_status: CustomerOrder["commercialStatus"];
  payment_status: CustomerOrder["paymentStatus"];
  fulfillment_status: CustomerOrder["fulfillmentStatus"];
  payment_intent: CustomerOrder["paymentIntent"];
  invoice_requested: boolean;
  updated_at: string;
  created_at: string;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  recipient_address?: string | null;
  assigned_staff_id?: string | null;
  assigned_staff?: { full_name?: string | null } | null;
  app_users?: RelationUserRow | null;
  order_items?: OrderItemRow[] | null;
  quote_versions?: QuoteVersionRow[] | null;
  payment_requests?: PaymentRequestRow[] | null;
  order_comments?: OrderCommentRow[] | null;
}

interface AppUserDbRow {
  id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  avatar_url?: string | null;
  created_at: string;
  organizations?: { name?: string | null } | Array<{ name?: string | null }> | null;
  user_roles?: Array<{
    roles?: { key?: RoleKey | null } | Array<{ key?: RoleKey | null }> | null;
  }> | null;
}

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

export async function saveOrder(order: CustomerOrder, creatorId: string): Promise<void> {
  await backendFetch(`/api/v1/orders/save?creator_id=${creatorId}`, {
    method: "POST",
    body: JSON.stringify({ order })
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
  return {
    super_admin: [
      "catalog.read", "catalog.write",
      "supplier.read", "supplier.write",
      "order.read", "order.quote", "order.adjust",
      "order.confirm_payment", "order.ship",
      "order.comment_internal",
      "accounting.read", "accounting.write", "accounting.post", "accounting.export",
      "operations.read", "operations.write", "operations.post",
      "rbac.write"
    ],
    admin_manager: [
      "catalog.read", "catalog.write",
      "supplier.read", "supplier.write",
      "order.read", "order.quote", "order.adjust",
      "order.confirm_payment", "order.ship",
      "order.comment_internal",
      "accounting.read", "accounting.write", "accounting.post", "accounting.export",
      "operations.read", "operations.write", "operations.post"
    ],
    order_operator: [
      "catalog.read", "supplier.read",
      "order.read", "order.quote", "order.adjust",
      "order.ship", "order.comment_internal",
      "operations.read", "operations.write"
    ],
    accountant: [
      "order.read", "order.confirm_payment", "order.comment_internal",
      "accounting.read", "accounting.write", "accounting.post", "accounting.export",
      "operations.read", "operations.write", "operations.post"
    ],
    warehouse: [
      "catalog.read", "supplier.read", "order.read", "order.ship", "order.comment_internal",
      "operations.read", "operations.write", "operations.post"
    ],
    customer_owner: ["catalog.read", "order.read"],
    customer_staff: ["catalog.read", "order.read"]
  };
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
