import type { RoleKey } from "@/lib/domain";

export type AppMode = "guest" | "customer" | "admin";

export type TabKey =
  | "catalog"
  | "cart"
  | "order"
  | "admin"
  | "admin_products"
  | "admin_reconciliation"
  | "admin_operations"
  | "admin_accounting"
  | "admin_reports"
  | "admin_invoices"
  | "settings"
  | "admin_suppliers"
  | "admin_categories"
  | "admin_users"
  | "profile"
  | "admin_promotions";

export interface ApiUser {
  id: string;
  name: string;
  company: string;
  email: string;
  role: RoleKey;
  isAdmin: boolean;
  phone?: string;
  avatarUrl?: string;
}

export const TAB_ROUTE_MAP: Record<TabKey, string> = {
  catalog: "/",
  cart: "/",
  order: "/orders",
  profile: "/profile",
  admin_reports: "/admin",
  admin: "/admin/orders",
  admin_products: "/admin/products",
  admin_categories: "/admin/categories",
  admin_suppliers: "/admin/suppliers",
  admin_operations: "/admin/operations",
  admin_accounting: "/admin/accounting",
  admin_reconciliation: "/admin/accounting",
  admin_invoices: "/admin/accounting",
  admin_promotions: "/admin/promotions",
  admin_users: "/admin/users",
  settings: "/admin/promotions"
};

export const ROUTE_TAB_MAP: Record<string, TabKey> = {
  "/": "catalog",
  "/orders": "order",
  "/order": "order",
  "/profile": "profile",
  "/admin": "admin_reports",
  "/admin/reports": "admin_reports",
  "/admin/orders": "admin",
  "/admin/products": "admin_products",
  "/admin/categories": "admin_categories",
  "/admin/suppliers": "admin_suppliers",
  "/admin/operations": "admin_operations",
  "/admin/accounting": "admin_accounting",
  "/admin/promotions": "admin_promotions",
  "/admin/users": "admin_users"
};
