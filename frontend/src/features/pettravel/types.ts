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
