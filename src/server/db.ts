import "server-only";

import { createSupabaseServiceClient } from "./supabase";
import type {
  Product,
  ProductVariant,
  Supplier,
  CustomerOrder,
  UserAccount,
  OrderItem,
  QuoteVersion,
  PaymentRequest,
  PaymentProof,
  QuoteAdjustment
} from "@/lib/domain";

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

/**
 * Automatically upsert demo organizations & users to Supabase
 * to ensure that foreign keys are valid when demo accounts place orders.
 */
export async function bootstrapDemoUsers(supabase = createSupabaseServiceClient()) {
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
        organization_id: DEMO_MAPPINGS.orgs.internal,
        status: "active"
      },
      {
        id: DEMO_MAPPINGS.users.minh,
        email: "minh@happypaws.vn",
        full_name: "Nguyễn Minh",
        organization_id: DEMO_MAPPINGS.orgs.happy_paws,
        status: "active"
      },
      {
        id: DEMO_MAPPINGS.users.lan,
        email: "lan@petland.vn",
        full_name: "Trần Ngọc Lan",
        organization_id: DEMO_MAPPINGS.orgs.petland,
        status: "active"
      }
    ], { onConflict: "id" });
  } catch (err) {
    console.error("Failed to bootstrap demo users in database:", err);
  }
}

/**
 * Seeds initial products, variants, and suppliers if the database is empty.
 */
export async function seedInitialDataIfNeeded() {
  const supabase = createSupabaseServiceClient();
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

  return data.map((p: any) => {
    const variants = p.product_variants
      ?.filter((pv: any) => pv.active)
      .flatMap((pv: any) => {
        const offers = pv.supplier_offers?.filter((so: any) => so.active) ?? [];
        if (offers.length === 0) return [];
        return offers.map((so: any) => ({
          id: pv.id,
          sku: pv.sku,
          label: pv.label,
          wholesalePrice: Number(so.wholesale_price),
          minOrderQty: Number(so.min_order_qty),
          stock: Number(so.stock_qty),
          supplierId: role === "customer" ? "sup_pettravel" : so.supplier_id // Strip supplier details for customers
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
      variants: role === "guest" ? [] : variants // Guests see no variants or pricing
    };
  });
}

export async function saveProduct(product: Product): Promise<void> {
  const supabase = createSupabaseServiceClient();

  // 1. Upsert product
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
  });

  if (prodErr) throw new Error(prodErr.message);

  // 2. Upsert variants and offers
  for (const v of product.variants) {
    const { error: varErr } = await supabase.from("product_variants").upsert({
      id: v.id,
      product_id: product.id,
      sku: v.sku,
      label: v.label,
      active: true
    });
    if (varErr) throw new Error(varErr.message);

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
  return data.map((s: any) => ({
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
    // If not admin, get user's organization orders
    const mappedOrgId = user.id === DEMO_MAPPINGS.users.minh
      ? DEMO_MAPPINGS.orgs.happy_paws
      : DEMO_MAPPINGS.orgs.petland;
    query = query.eq("organization_id", mappedOrgId);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error || !data) return [];

  return data.map((o: any) => {
    // Map items
    const items = o.order_items?.map((i: any) => ({
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
    const quoteVersions = o.quote_versions?.map((qv: any) => ({
      id: qv.id,
      version: qv.version,
      status: qv.status,
      subtotal: Number(qv.subtotal),
      finalTotal: Number(qv.final_total),
      depositAmount: Number(qv.deposit_amount),
      codRemaining: Number(qv.cod_remaining),
      expiresAt: qv.expires_at,
      adjustments: qv.quote_adjustments?.map((qa: any) => ({
        id: qa.id,
        type: qa.type,
        label: qa.label,
        amount: Number(qa.amount),
        requiresApproval: qa.requires_approval
      })) ?? []
    })) ?? [];

    // Map payments and proofs
    const paymentRequests = o.payment_requests?.map((pr: any) => ({
      id: pr.id,
      purpose: pr.purpose,
      amount: Number(pr.amount),
      reference: pr.reference,
      qrPayload: pr.qr_payload,
      status: pr.status,
      expiresAt: pr.expires_at
    })) ?? [];

    const paymentProofs = o.payment_requests?.flatMap((pr: any) => 
      pr.payment_proofs?.map((pf: any) => ({
        id: pf.id,
        paymentRequestId: pr.id,
        fileName: pf.file_name,
        uploadedAt: pf.uploaded_at,
        status: pf.status
      })) ?? []
    ) ?? [];

    // Map comments
    const comments = o.order_comments
      ?.filter((c: any) => user.isAdmin || c.audience === "customer_visible")
      .map((c: any) => ({
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

  const orgId = creatorId === DEMO_MAPPINGS.users.minh
    ? DEMO_MAPPINGS.orgs.happy_paws
    : creatorId === DEMO_MAPPINGS.users.lan
      ? DEMO_MAPPINGS.orgs.petland
      : DEMO_MAPPINGS.orgs.internal;

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
  const val = data.value as any;
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
      "order.comment_internal", "rbac.write"
    ],
    admin_manager: [
      "catalog.read", "catalog.write",
      "supplier.read", "supplier.write",
      "order.read", "order.quote", "order.adjust",
      "order.confirm_payment", "order.ship",
      "order.comment_internal"
    ],
    order_operator: [
      "catalog.read", "supplier.read",
      "order.read", "order.quote", "order.adjust",
      "order.ship", "order.comment_internal"
    ],
    accountant: ["order.read", "order.confirm_payment", "order.comment_internal"],
    warehouse: ["catalog.read", "supplier.read", "order.read", "order.ship", "order.comment_internal"],
    customer_owner: ["catalog.read", "order.read"],
    customer_staff: ["catalog.read", "order.read"]
  };
}
