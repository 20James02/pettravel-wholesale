import "server-only";

import { createSupabaseServiceClient } from "./supabase";
import crypto from "crypto";
import { Client } from "pg";
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

// Static UUID mappings for demo users & organizations to bootstrap database.
export const DEMO_MAPPINGS = {
  orgs: {
    happy_paws: "00000000-0000-0000-0000-000000000101",
    petland: "00000000-0000-0000-0000-000000000102",
    internal: "00000000-0000-0000-0000-000000000103"
  },
  users: {
    admin: "00000000-0000-0000-0000-000000000001",
    minh: "00000000-0000-0000-0000-000000000002",
    lan: "00000000-0000-0000-0000-000000000003"
  }
};

import { hashPassword, isConfiguredAdminEmail } from "./auth";

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function getRoleFromUserRow(row: AppUserDbRow): RoleKey {
  if (isConfiguredAdminEmail(row.email)) {
    return "super_admin";
  }

  const roleKey = row.user_roles
    ?.map((userRole) => relationOne(userRole.roles)?.key)
    .find((key): key is RoleKey => Boolean(key));

  return roleKey ?? "customer_owner";
}

async function assignUserRole(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  userId: string,
  roleKey: RoleKey
): Promise<void> {
  const { data: role, error: roleErr } = await supabase
    .from("roles")
    .select("id")
    .eq("key", roleKey)
    .single();

  if (roleErr || !role) {
    throw new Error(`Role không tồn tại trong Supabase: ${roleKey}`);
  }

  await supabase.from("user_roles").delete().eq("user_id", userId);
  const { error: assignErr } = await supabase.from("user_roles").insert({
    user_id: userId,
    role_id: role.id
  });

  if (assignErr) throw new Error(assignErr.message);
}

async function resolveOrderOrganizationId(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  order: CustomerOrder,
  actorId: string
): Promise<string> {
  const { data: existingOrder } = await supabase
    .from("customer_orders")
    .select("organization_id")
    .eq("id", order.id)
    .maybeSingle();

  if (existingOrder?.organization_id) {
    return existingOrder.organization_id;
  }

  const ownerId = order.customerId || actorId;
  const { data: owner, error: ownerErr } = await supabase
    .from("app_users")
    .select("organization_id")
    .eq("id", ownerId)
    .single();

  if (ownerErr || !owner?.organization_id) {
    throw new Error("Không xác định được tổ chức của đơn hàng.");
  }

  return owner.organization_id;
}

/**
 * Automatically upsert demo organizations & users to Supabase
 * to ensure that foreign keys are valid when demo accounts place orders.
 */
export async function bootstrapDemoUsers(supabase = createSupabaseServiceClient()) {
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_DEMO_DATA !== "true") {
    return;
  }

  const demoAdminPassword = process.env.DEMO_ADMIN_PASSWORD;
  const demoMinhPassword = process.env.DEMO_MINH_PASSWORD;
  const demoLanPassword = process.env.DEMO_LAN_PASSWORD;

  if (!demoAdminPassword || !demoMinhPassword || !demoLanPassword) {
    console.warn("Demo user bootstrap skipped because demo passwords are not configured.");
    return;
  }

  try {
    // 1. Upsert organizations
    await supabase.from("organizations").upsert([
      { id: DEMO_MAPPINGS.orgs.internal, name: "Pet Travel Wholesale" },
      { id: DEMO_MAPPINGS.orgs.happy_paws, name: "Happy Paws Retail" },
      { id: DEMO_MAPPINGS.orgs.petland, name: "PetLand Đà Nẵng" }
    ], { onConflict: "id" });

    // 2. Upsert app users
    await supabase.from("app_users").upsert([
      {
        id: DEMO_MAPPINGS.users.admin,
        email: "admin@pettravel.vn",
        full_name: "Admin Pet Travel",
        phone: "0912345678",
        password_hash: hashPassword(demoAdminPassword),
        organization_id: DEMO_MAPPINGS.orgs.internal,
        status: "active"
      },
      {
        id: DEMO_MAPPINGS.users.minh,
        email: "minh@happypaws.vn",
        full_name: "Nguyễn Minh",
        phone: "0987654321",
        password_hash: hashPassword(demoMinhPassword),
        organization_id: DEMO_MAPPINGS.orgs.happy_paws,
        status: "active"
      },
      {
        id: DEMO_MAPPINGS.users.lan,
        email: "lan@petland.vn",
        full_name: "Trần Ngọc Lan",
        phone: "0901234567",
        password_hash: hashPassword(demoLanPassword),
        organization_id: DEMO_MAPPINGS.orgs.petland,
        status: "active"
      }
    ], { onConflict: "id" });

    await assignUserRole(supabase, DEMO_MAPPINGS.users.admin, "super_admin");
    await assignUserRole(supabase, DEMO_MAPPINGS.users.minh, "customer_owner");
    await assignUserRole(supabase, DEMO_MAPPINGS.users.lan, "customer_owner");
  } catch (err) {
    console.error("Failed to bootstrap demo users in database:", err);
  }
}

/**
 * Seeds initial products, variants, and suppliers if the database is empty.
 */
export async function seedInitialDataIfNeeded() {
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_DEMO_DATA !== "true") {
    return;
  }

  const supabase = createSupabaseServiceClient();
  await ensureDbInitialized(supabase);
  try {
    // Check if suppliers are empty
    const { count: supCount } = await supabase.from("suppliers").select("id", { count: "exact", head: true });
    if (supCount === 0) {
      console.log("Seeding default suppliers...");
      await supabase.from("suppliers").insert([
        { id: "sup_pettravel", code: "PT", name: "Pet Travel", lead_time_days: 1, admin_only: false },
        { id: "sup_pawcare", code: "PC", name: "PawCare Vietnam", lead_time_days: 3, admin_only: true },
        { id: "sup_meowline", code: "ML", name: "MeowLine Supply", lead_time_days: 2, admin_only: true }
      ]);
    }

    // Check if products are empty
    const { count: prodCount } = await supabase.from("products").select("id", { count: "exact", head: true });
    if (prodCount === 0) {
      console.log("Seeding default products & variants...");
      // Seed default categories
      await saveCategories(["Túi vận chuyển", "Ăn uống du lịch", "Vệ sinh"]);

      // Seed 2 default products
      const p1Id = "p_seed_1";
      const p2Id = "p_seed_2";

      await supabase.from("products").insert([
        {
          id: p1Id,
          code: "PT-BAG-001",
          name: "Túi vận chuyển thú cưng AirGo",
          brand: "Pet Travel",
          category: "Túi vận chuyển",
          description: "Túi vận chuyển chất lượng cao, thoáng khí, phù hợp mang đi du lịch.",
          image_url: "/product-bag.svg",
          images: ["/product-bag.svg"],
          dimensions: "45x25x28 cm",
          weight: 1.2,
          tags: ["hàng bán chạy", "máy bay"]
        },
        {
          id: p2Id,
          code: "PT-FOOD-002",
          name: "Thức ăn hạt sỉ dinh dưỡng",
          brand: "Pet Travel",
          category: "Ăn uống du lịch",
          description: "Thức ăn hạt cao cấp cung cấp đầy đủ dưỡng chất cho chó mèo.",
          image_url: "/product-food.svg",
          images: ["/product-food.svg"],
          dimensions: "30x20x10 cm",
          weight: 1.5,
          tags: ["dinh dưỡng", "chất lượng cao"]
        }
      ]);

      // Seed variants
      const v1Id = "v_seed_1";
      const v2Id = "v_seed_2";
      const v3Id = "v_seed_3";

      await supabase.from("product_variants").insert([
        { id: v1Id, product_id: p1Id, sku: "PT-BAG-001-S-GR", label: "Size S - Xám" },
        { id: v2Id, product_id: p1Id, sku: "PT-BAG-001-M-BL", label: "Size M - Đen" },
        { id: v3Id, product_id: p2Id, sku: "PT-FOOD-002-BAG-15KG", label: "Túi 1.5kg" }
      ]);

      // Seed supplier offers
      await supabase.from("supplier_offers").insert([
        { supplier_id: "sup_pettravel", product_variant_id: v1Id, wholesale_price: 320000, min_order_qty: 5, stock_qty: 120, lead_time_days: 1 },
        { supplier_id: "sup_pettravel", product_variant_id: v2Id, wholesale_price: 380000, min_order_qty: 5, stock_qty: 80, lead_time_days: 1 },
        { supplier_id: "sup_pettravel", product_variant_id: v3Id, wholesale_price: 150000, min_order_qty: 10, stock_qty: 100, lead_time_days: 1 }
      ]);
    }
  } catch (err) {
    console.error("Failed to seed initial data:", err);
  }
}

// ── PRODUCTS & VARIANTS ──────────────────────────────────────

export async function getProducts(role: "guest" | "customer" | "admin"): Promise<Product[]> {
  await seedInitialDataIfNeeded();
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase
    .from("products")
    .select(`
      id,
      code,
      name,
      brand,
      category,
      description,
      image_url,
      images,
      dimensions,
      weight,
      tags,
      active,
      product_variants (
        id,
        sku,
        label,
        image_url,
        active,
        supplier_offers (
          id,
          supplier_id,
          wholesale_price,
          min_order_qty,
          stock_qty,
          lead_time_days,
          active
        )
      )
    `)
    .eq("active", true);

  if (error || !data) return [];

  return (data as ProductRow[]).map((p) => {
    const variants: ProductVariant[] = p.product_variants
      ?.filter((pv) => pv.active)
      .flatMap((pv) => {
        const offers = pv.supplier_offers?.filter((so) => so.active) ?? [];
        if (offers.length === 0) return [];
        return offers.map((so) => ({
          id: pv.id,
          sku: pv.sku,
          label: pv.label,
          wholesalePrice: Number(so.wholesale_price),
          minOrderQty: Number(so.min_order_qty),
          stock: Number(so.stock_qty),
          supplierId: role === "customer" ? "sup_pettravel" : so.supplier_id, // Strip supplier details for customers
          imageUrl: pv.image_url ?? undefined
        }));
      }) ?? [];

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      brand: p.brand,
      category: p.category,
      description: p.description ?? "",
      imageUrl: p.image_url ?? "/product-food.svg",
      images: p.images ?? [p.image_url ?? "/product-food.svg"],
      dimensions: p.dimensions ?? "",
      weight: Number(p.weight) || 0,
      tags: p.tags ?? [],
      variants: role === "guest" ? variants.map(v => ({ ...v, wholesalePrice: 0 })) : variants
    };
  });
}

export async function saveProduct(product: Product): Promise<void> {
  const supabase = createSupabaseServiceClient();

  // 1. Upsert product (dùng onConflict: "code" để tự động UPDATE nếu mã sản phẩm đã tồn tại)
  const { error: prodErr } = await supabase.from("products").upsert({
    id: product.id,
    code: product.code,
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
    image_url: product.imageUrl,
    images: product.images,
    dimensions: product.dimensions,
    weight: product.weight,
    tags: product.tags,
    active: true
  }, { onConflict: "code" });

  if (prodErr) {
    if (prodErr.message.includes("products_code_key") || prodErr.message.includes("duplicate key")) {
      throw new Error(`Mã sản phẩm "${product.code}" đã tồn tại trên một sản phẩm khác. Vui lòng đổi mã sản phẩm.`);
    }
    throw new Error(prodErr.message);
  }

  // 2. Upsert variants and offers
  for (const v of product.variants) {
    try {
      const { error: varErr } = await supabase.from("product_variants").upsert({
        id: v.id,
        product_id: product.id,
        sku: v.sku,
        label: v.label,
        image_url: v.imageUrl || null,
        active: true
      });
      if (varErr) throw varErr;
    } catch (err: any) {
      const isMissingColError = err.message && (
        err.message.includes("image_url") || 
        err.message.includes("does not exist") || 
        err.message.includes("column") ||
        err.message.includes("schema cache")
      );
      if (isMissingColError) {
        console.log("Self-healing DB: Missing variant image_url column. Attempting migration & fail-safe fallback...");
        try {
          await ensureDbInitialized(supabase, true);
        } catch {
          // ignore migration exception
        }

        // Retry 1: With image_url
        const { error: retryErr } = await supabase.from("product_variants").upsert({
          id: v.id,
          product_id: product.id,
          sku: v.sku,
          label: v.label,
          image_url: v.imageUrl || null,
          active: true
        });

        // Retry 2 (Fail-Safe): If Supabase schema cache still rejects image_url, upsert WITHOUT image_url column
        if (retryErr) {
          console.warn("Supabase schema cache missing image_url, executing Fail-Safe upsert without image_url");
          const { error: safeErr } = await supabase.from("product_variants").upsert({
            id: v.id,
            product_id: product.id,
            sku: v.sku,
            label: v.label,
            active: true
          });
          if (safeErr) throw new Error(safeErr.message);
        }
      } else {
        throw new Error(err.message || String(err));
      }
    }

    const { error: offerErr } = await supabase.from("supplier_offers").upsert({
      supplier_id: v.supplierId || "sup_pettravel",
      product_variant_id: v.id,
      wholesale_price: v.wholesalePrice,
      min_order_qty: v.minOrderQty,
      stock_qty: v.stock,
      active: true
    }, { onConflict: "supplier_id,product_variant_id" });
    if (offerErr) throw new Error(offerErr.message);
  }
}

export async function deleteProduct(id: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  // Soft delete
  await supabase.from("products").update({ active: false }).eq("id", id);
}

// ── SUPPLIERS ────────────────────────────────────────────────

export async function getSuppliers(): Promise<Supplier[]> {
  await seedInitialDataIfNeeded();
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.from("suppliers").select("*").eq("active", true);
  if (error || !data) return [];
  return (data as SupplierRow[]).map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    leadTimeDays: s.lead_time_days,
    adminOnly: s.admin_only
  }));
}

export async function saveSupplier(supplier: Supplier): Promise<void> {
  const supabase = createSupabaseServiceClient();
  await supabase.from("suppliers").upsert({
    id: supplier.id,
    code: supplier.code,
    name: supplier.name,
    lead_time_days: supplier.leadTimeDays,
    admin_only: supplier.adminOnly,
    active: true
  });
}

export async function deleteSupplier(id: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  await supabase.from("suppliers").update({ active: false }).eq("id", id);
}

// ── CATEGORIES (SETTINGS) ────────────────────────────────────

export async function getCategories(): Promise<string[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", "product_categories").single();
  if (error || !data) {
    return ["Túi vận chuyển", "Ăn uống du lịch", "Vệ sinh"];
  }
  return data.value?.categories ?? [];
}

export async function saveCategories(categories: string[]): Promise<void> {
  const supabase = createSupabaseServiceClient();
  await supabase.from("app_settings").upsert({
    key: "product_categories",
    value: { categories }
  });
}

// ── ORDERS ───────────────────────────────────────────────────

export async function getOrders(user: UserAccount): Promise<CustomerOrder[]> {
  const supabase = createSupabaseServiceClient();
  let query = supabase.from("customer_orders").select(`
    id,
    order_number,
    commercial_status,
    payment_status,
    fulfillment_status,
    payment_intent,
    invoice_requested,
    current_quote_version,
    updated_at,
    created_at,
    recipient_name,
    recipient_phone,
    recipient_address,
    assigned_staff_id,
    assigned_staff:app_users!assigned_staff_id(full_name),
    app_users (
      id,
      full_name,
      organization_id,
      organizations (
        name
      )
    ),
    order_items (
      id,
      product_code_snapshot,
      product_name_snapshot,
      variant_sku_snapshot,
      variant_label_snapshot,
      quantity,
      unit_price_snapshot,
      supplier_id
    ),
    quote_versions (
      id,
      version,
      status,
      subtotal,
      final_total,
      deposit_amount,
      cod_remaining,
      expires_at,
      quote_adjustments (
        id,
        type,
        label,
        amount,
        requires_approval
      )
    ),
    payment_requests (
      id,
      purpose,
      amount,
      reference,
      qr_payload,
      status,
      expires_at,
      payment_proofs (
        id,
        storage_key,
        file_name,
        content_type,
        file_size_bytes,
        status,
        uploaded_at
      )
    ),
    order_comments (
      id,
      audience,
      message,
      created_at,
      app_users (
        full_name
      )
    )
  `);

  if (!user.isAdmin) {
    if (!user.organizationId) {
      return [];
    }
    query = query.eq("organization_id", user.organizationId);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error || !data) return [];

  return (data as OrderRow[]).map((o) => {
    // Map items
    const items: OrderItem[] = o.order_items?.map((i) => ({
      id: i.id,
      productCode: i.product_code_snapshot,
      productName: i.product_name_snapshot,
      variantSku: i.variant_sku_snapshot,
      variantLabel: i.variant_label_snapshot,
      quantity: i.quantity,
      unitPriceSnapshot: Number(i.unit_price_snapshot),
      supplierId: i.supplier_id
    })) ?? [];

    // Map quote versions
    const quoteVersions: QuoteVersion[] = o.quote_versions?.map((qv) => {
      const adjustments: QuoteAdjustment[] = qv.quote_adjustments?.map((qa) => ({
        id: qa.id,
        type: qa.type,
        label: qa.label,
        amount: Number(qa.amount),
        requiresApproval: qa.requires_approval
      })) ?? [];

      return {
      id: qv.id,
      version: qv.version,
      status: qv.status,
      subtotal: Number(qv.subtotal),
      finalTotal: Number(qv.final_total),
      depositAmount: Number(qv.deposit_amount),
      codRemaining: Number(qv.cod_remaining),
      expiresAt: qv.expires_at,
      adjustments
      };
    }) ?? [];

    // Map payments and proofs
    const latestQuoteVersion = quoteVersions.at(-1)?.version ?? 1;
    const paymentRequests: PaymentRequest[] = o.payment_requests?.map((pr) => ({
      id: pr.id,
      quoteVersion: latestQuoteVersion,
      purpose: pr.purpose,
      amount: Number(pr.amount),
      reference: pr.reference,
      qrPayload: pr.qr_payload,
      status: pr.status,
      expiresAt: pr.expires_at
    })) ?? [];

    const paymentProofs: PaymentProof[] = o.payment_requests?.flatMap((pr) => 
      pr.payment_proofs?.map((pf) => ({
        id: pf.id,
        paymentRequestId: pr.id,
        fileName: pf.file_name,
        uploadedAt: pf.uploaded_at,
        status: pf.status
      })) ?? []
    ) ?? [];

    // Map comments
    const comments: OrderComment[] = o.order_comments
      ?.filter((c) => user.isAdmin || c.audience === "customer_visible")
      .map((c) => ({
        id: c.id,
        author: c.app_users?.full_name ?? "Đại lý sỉ",
        audience: c.audience,
        message: c.message,
        createdAt: c.created_at
      })) ?? [];

    return {
      id: o.id,
      number: o.order_number,
      customerName: o.app_users?.full_name ?? "Đại lý sỉ",
      customerCompany: o.app_users?.organizations?.name ?? "Happy Paws Retail",
      customerId: o.app_users?.id ?? user.id,
      commercialStatus: o.commercial_status,
      paymentStatus: o.payment_status,
      fulfillmentStatus: o.fulfillment_status,
      paymentIntent: o.payment_intent,
      invoiceRequested: o.invoice_requested,
      recipientName: o.recipient_name ?? "",
      recipientPhone: o.recipient_phone ?? "",
      recipientAddress: o.recipient_address ?? "",
      assignedStaffId: o.assigned_staff_id ?? undefined,
      assignedStaffName: o.assigned_staff?.full_name ?? undefined,
      items,
      quoteVersions,
      paymentRequests,
      paymentProofs,
      fulfillmentGroups: [],
      comments,
      updatedAt: o.updated_at
    };
  });
}

export async function saveOrder(order: CustomerOrder, creatorId: string): Promise<void> {
  const supabase = createSupabaseServiceClient();

  const orgId = await resolveOrderOrganizationId(supabase, order, creatorId);

  // 1. Upsert customer_orders
  const { error: orderErr } = await supabase.from("customer_orders").upsert({
    id: order.id,
    order_number: order.number,
    organization_id: orgId,
    created_by: creatorId,
    commercial_status: order.commercialStatus,
    payment_status: order.paymentStatus,
    fulfillment_status: order.fulfillmentStatus,
    payment_intent: order.paymentIntent,
    invoice_requested: order.invoiceRequested,
    recipient_name: order.recipientName || null,
    recipient_phone: order.recipientPhone || null,
    recipient_address: order.recipientAddress || null,
    assigned_staff_id: order.assignedStaffId || null,
    updated_at: new Date().toISOString()
  });

  if (orderErr) throw new Error(orderErr.message);

  // 2. Upsert order items
  if (order.items && order.items.length > 0) {
    const itemsToInsert = order.items.map(item => ({
      id: item.id || `item_${Date.now()}_${Math.random().toString().slice(-4)}`,
      order_id: order.id,
      product_code_snapshot: item.productCode,
      product_name_snapshot: item.productName,
      variant_sku_snapshot: item.variantSku,
      variant_label_snapshot: item.variantLabel,
      quantity: item.quantity,
      unit_price_snapshot: item.unitPriceSnapshot,
      supplier_id: item.supplierId || "sup_pettravel"
    }));

    // Delete old items and insert fresh
    await supabase.from("order_items").delete().eq("order_id", order.id);
    const { error: itemsErr } = await supabase.from("order_items").insert(itemsToInsert);
    if (itemsErr) throw new Error(itemsErr.message);
  }

  // 3. Upsert quote versions & adjustments
  for (const qv of order.quoteVersions) {
    const { error: qvErr } = await supabase.from("quote_versions").upsert({
      id: qv.id,
      order_id: order.id,
      version: qv.version,
      status: qv.status,
      subtotal: qv.subtotal,
      final_total: qv.finalTotal,
      deposit_amount: qv.depositAmount,
      cod_remaining: qv.codRemaining,
      expires_at: qv.expiresAt || new Date(Date.now() + 86400000 * 3).toISOString() // 3 days expiry
    });

    if (qvErr) throw new Error(qvErr.message);

    if (qv.adjustments && qv.adjustments.length > 0) {
      const adjustmentsToInsert = qv.adjustments.map(qa => ({
        id: qa.id,
        quote_id: qv.id,
        type: qa.type,
        label: qa.label,
        amount: qa.amount,
        requires_approval: qa.requiresApproval
      }));

      await supabase.from("quote_adjustments").delete().eq("quote_id", qv.id);
      const { error: adjErr } = await supabase.from("quote_adjustments").insert(adjustmentsToInsert);
      if (adjErr) throw new Error(adjErr.message);
    }
  }

  // 4. Upsert payment requests & proofs
  for (const pr of order.paymentRequests) {
    // Find associated quote version UUID
    const qvUuid = order.quoteVersions[0]?.id || null;
    if (!qvUuid) continue;

    const { error: prErr } = await supabase.from("payment_requests").upsert({
      id: pr.id,
      order_id: order.id,
      quote_id: qvUuid,
      purpose: pr.purpose === "deposit" ? "deposit" : pr.purpose === "full" ? "full" : "remaining",
      amount: pr.amount,
      reference: pr.reference,
      qr_payload: pr.qrPayload,
      status: pr.status,
      expires_at: pr.expiresAt || new Date(Date.now() + 86400000 * 3).toISOString()
    });

    if (prErr) throw new Error(prErr.message);
  }

  // Upsert proofs (mapped to requests)
  for (const pf of order.paymentProofs) {
    const { error: pfErr } = await supabase.from("payment_proofs").upsert({
      id: pf.id,
      payment_request_id: pf.paymentRequestId,
      storage_key: pf.fileName, // Using file_name as key for now
      file_name: pf.fileName,
      content_type: "image/png",
      file_size_bytes: 1024 * 1024, // placeholder 1MB
      status: pf.status,
      uploaded_by: creatorId
    });
    if (pfErr) throw new Error(pfErr.message);
  }

  // 5. Upsert comments
  for (const c of order.comments) {
    await supabase.from("order_comments").upsert({
      id: c.id,
      order_id: order.id,
      author_id: creatorId,
      audience: c.audience === "internal" ? "internal" : "customer_visible",
      message: c.message,
      created_at: c.createdAt || new Date().toISOString()
    });
  }
}

export interface AdminPolicy {
  freeShippingThreshold: number;
  defaultDepositRate: number;
  maxOperatorDiscountRate: number;
  requireManagerApprovalAbove: number;
}

export async function getAdminPolicy(): Promise<AdminPolicy> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", "admin_policy").single();
  if (error || !data) {
    return {
      freeShippingThreshold: 5000000,
      defaultDepositRate: 0.3,
      maxOperatorDiscountRate: 0.08,
      requireManagerApprovalAbove: 500000
    };
  }
  const val = data.value as Partial<AdminPolicy>;
  return {
    freeShippingThreshold: Number(val.freeShippingThreshold) || 5000000,
    defaultDepositRate: Number(val.defaultDepositRate) || 0.3,
    maxOperatorDiscountRate: Number(val.maxOperatorDiscountRate) || 0.08,
    requireManagerApprovalAbove: Number(val.requireManagerApprovalAbove) || 500000
  };
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
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("app_users")
    .select(`
      id,
      email,
      full_name,
      phone,
      avatar_url,
      created_at,
      organizations (
        name
      ),
      user_roles (
        roles (
          key
        )
      )
    `)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return (data as AppUserDbRow[]).map((u) => {
    const role = getRoleFromUserRow(u);
    const org = relationOne(u.organizations);
    return {
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      phone: u.phone ?? "",
      avatarUrl: u.avatar_url ?? "",
      role,
      company: org?.name ?? "",
      createdAt: u.created_at
    };
  });
}

export async function createAppUser(input: {
  email: string;
  fullName: string;
  phone: string;
  passwordRaw: string;
  role: RoleKey;
  company?: string;
}): Promise<void> {
  const supabase = createSupabaseServiceClient();

  // 1. Check email uniqueness
  const { data: existingEmail } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", input.email.trim())
    .maybeSingle();

  if (existingEmail) {
    throw new Error("Email đã được đăng ký!");
  }

  // 2. Check phone uniqueness if provided
  if (input.phone) {
    const { data: existingPhone } = await supabase
      .from("app_users")
      .select("id")
      .eq("phone", input.phone.trim())
      .maybeSingle();

    if (existingPhone) {
      throw new Error("Số điện thoại đã được đăng ký!");
    }
  }

  // 3. Handle organization creation
  let orgId: string | null = null;
  if (input.company && input.company.trim()) {
    const companyTrimmed = input.company.trim();
    const { data: existingOrg } = await supabase
      .from("organizations")
      .select("id")
      .eq("name", companyTrimmed)
      .maybeSingle();

    if (existingOrg) {
      orgId = existingOrg.id;
    } else {
      const newOrgId = crypto.randomUUID();
      const { error: orgErr } = await supabase
        .from("organizations")
        .insert({ id: newOrgId, name: companyTrimmed });
      if (orgErr) throw new Error(orgErr.message);
      orgId = newOrgId;
    }
  } else {
    orgId = DEMO_MAPPINGS.orgs.internal;
  }

  // 4. Insert user
  const newUserId = crypto.randomUUID();
  const { error: userErr } = await supabase.from("app_users").insert({
    id: newUserId,
    email: input.email.trim(),
    full_name: input.fullName.trim(),
    phone: input.phone.trim(),
    password_hash: hashPassword(input.passwordRaw),
    organization_id: orgId,
    status: "active"
  });

  if (userErr) throw new Error(userErr.message);
  await assignUserRole(supabase, newUserId, input.role);
}

export async function updateUserProfile(
  userId: string,
  input: { fullName?: string; avatarUrl?: string; newPasswordRaw?: string }
): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const updateData: Record<string, string> = {};

  if (input.fullName !== undefined) {
    updateData.full_name = input.fullName.trim();
  }
  if (input.avatarUrl !== undefined) {
    updateData.avatar_url = input.avatarUrl.trim();
  }
  if (input.newPasswordRaw) {
    updateData.password_hash = hashPassword(input.newPasswordRaw);
  }

  if (Object.keys(updateData).length === 0) return;

  const { error } = await supabase
    .from("app_users")
    .update(updateData)
    .eq("id", userId);

  if (error) throw new Error(error.message);
}

let isDbInitialized = false;

export async function ensureDbInitialized(supabase = createSupabaseServiceClient(), forceRun = false) {
  if (!forceRun && isDbInitialized) return;
  if (!forceRun && (process.env.NODE_ENV === "production" || process.env.ALLOW_RUNTIME_MIGRATIONS !== "true")) {
    return;
  }
  isDbInitialized = true;

  const migrationSql = `
    -- Thêm trường image_url vào bảng product_variants
    ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS image_url text;

    -- 1. Thêm trường phone, password_hash, và avatar_url vào bảng app_users
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone text;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash text;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS avatar_url text;

    -- Tạo ràng buộc UNIQUE cho số điện thoại
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'app_users_phone_key'
        ) THEN
            ALTER TABLE app_users ADD CONSTRAINT app_users_phone_key UNIQUE (phone);
        END IF;
    END
    $$;

    -- 2. Thêm trường assigned_staff_id để khóa đơn hàng
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS assigned_staff_id text REFERENCES app_users(id) ON DELETE SET NULL;
  `;

  let migrationSuccess = false;

  // 1. Try running migration via direct PostgreSQL connection (Robust Fallback)
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const client = new Client({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false } // Required for external SSL connection to Supabase
      });
      await client.connect();
      await client.query(migrationSql);
      await client.query("NOTIFY pgrst, 'reload schema';");
      await client.end();
      migrationSuccess = true;
      console.log("Database schema successfully auto-updated and PostgREST cache reloaded via direct PG connection!");
    } catch (dbErr: unknown) {
      const message = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.warn("Direct PG migration failed, falling back to RPC:", message);
    }
  }

  // 2. If direct PG failed or wasn't configured, fall back to Supabase RPC
  if (!migrationSuccess) {
    try {
      const { error: migrationErr } = await supabase.rpc("exec_sql", { sql_query: migrationSql });
      if (migrationErr) {
        console.warn("Auto-migration RPC skipped or failed:", migrationErr.message);
      } else {
        await supabase.rpc("exec_sql", { sql_query: "NOTIFY pgrst, 'reload schema';" });
        console.log("Database schema successfully auto-updated and PostgREST cache reloaded via RPC!");
      }
    } catch (err) {
      console.warn("Auto-migration RPC exception:", err);
    }
  }

  // 3. Auto-run bootstrap of demo organizations and accounts
  try {
    await bootstrapDemoUsers(supabase);
  } catch (err) {
    console.warn("Seeding demo users skipped:", err);
  }
}
