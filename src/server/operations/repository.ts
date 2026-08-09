import "server-only";

import crypto from "crypto";
import type {
  OperationsDocumentStatus,
  OperationsDocumentSummary,
  OperationsDocumentType,
  OperationsOverview,
  UserAccount
} from "@/lib/domain";
import { createSupabaseServiceClient } from "@/server/supabase";

interface OperationsDocumentLineInput {
  productVariantId?: string;
  sku?: string;
  description: string;
  quantity: number;
  unitCostVnd: number;
  supplierId?: string;
}

export interface CreateOperationsDocumentInput {
  type: OperationsDocumentType;
  documentNo?: string;
  partnerName?: string;
  note?: string;
  lines?: OperationsDocumentLineInput[];
  expenseCategory?: string;
  amountVnd?: number;
  shouldPost?: boolean;
}

interface InventoryBalanceRow {
  id: string;
  warehouse_id: string;
  product_variant_id?: string | null;
  sku: string;
  supplier_id?: string | null;
  on_hand_qty: number;
  reserved_qty: number;
  defective_qty: number;
  avg_cost_vnd: number | string;
}

interface OperationsDocumentRow {
  id: string;
  document_no: string;
  type: OperationsDocumentType;
  status: OperationsDocumentStatus;
  partner_name?: string | null;
  total_amount: number | string | null;
  created_at: string;
}

function requireOrganizationId(user: UserAccount): string {
  if (!user.organizationId) {
    throw new Error("Tài khoản nội bộ chưa được gắn tổ chức Pet Travel để ghi nhận nghiệp vụ.");
  }
  return user.organizationId;
}

function toDocumentSummary(row: OperationsDocumentRow): OperationsDocumentSummary {
  return {
    id: row.id,
    documentNo: row.document_no,
    type: row.type,
    status: row.status,
    partnerName: row.partner_name ?? undefined,
    totalAmountVnd: Number(row.total_amount ?? 0),
    createdAt: row.created_at
  };
}

async function countDocuments(
  user: UserAccount,
  type: OperationsDocumentType,
  statuses: OperationsDocumentStatus[]
): Promise<number> {
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("operations_documents")
    .select("id", { count: "exact", head: true })
    .eq("type", type)
    .in("status", statuses);

  if (user.organizationId) query = query.eq("organization_id", user.organizationId);

  const { count, error } = await query;
  if (error) throw new Error(`Không thể đọc chứng từ vận hành: ${error.message}`);
  return count ?? 0;
}

async function getDefaultWarehouseId(organizationId: string): Promise<string> {
  const supabase = createSupabaseServiceClient();
  const { data: existing, error: selectError } = await supabase
    .from("warehouses")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_default", true)
    .eq("active", true)
    .maybeSingle();

  if (selectError) throw new Error(selectError.message);
  if (existing?.id) return existing.id;

  const warehouseId = crypto.randomUUID();
  const { error: insertError } = await supabase.from("warehouses").insert({
    id: warehouseId,
    organization_id: organizationId,
    code: "MAIN",
    name: "Kho chính Pet Travel",
    is_default: true,
    active: true
  });

  if (insertError) throw new Error(insertError.message);
  return warehouseId;
}

async function updateInventoryBalance(params: {
  organizationId: string;
  warehouseId: string;
  line: OperationsDocumentLineInput;
  quantityDelta: number;
  defectiveDelta: number;
}): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const sku = params.line.sku || params.line.productVariantId || `MANUAL-${Date.now()}`;

  const { data: balance, error: selectError } = await supabase
    .from("inventory_balances")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("warehouse_id", params.warehouseId)
    .eq("sku", sku)
    .maybeSingle();

  if (selectError) throw new Error(selectError.message);

  const current = (balance as InventoryBalanceRow | null) ?? null;
  const currentOnHand = current?.on_hand_qty ?? 0;
  const currentReserved = current?.reserved_qty ?? 0;
  const currentDefective = current?.defective_qty ?? 0;
  const nextOnHand = currentOnHand + params.quantityDelta;
  const nextDefective = currentDefective + params.defectiveDelta;

  if (nextOnHand < 0) {
    throw new Error(`Tồn kho SKU ${sku} không đủ để ghi nhận phiếu xuất/hóa đơn.`);
  }
  if (nextDefective < 0 || nextDefective > nextOnHand) {
    throw new Error(`Số lượng hàng lỗi SKU ${sku} vượt quá tồn kho thực tế.`);
  }
  if (currentReserved > nextOnHand - nextDefective) {
    throw new Error(`Tồn khả dụng SKU ${sku} không đủ vì đã có hàng được giữ cho đơn khác.`);
  }

  const previousValue = currentOnHand * Number(current?.avg_cost_vnd ?? 0);
  const incomingValue = params.quantityDelta > 0 ? params.quantityDelta * params.line.unitCostVnd : 0;
  const nextAvgCost = nextOnHand > 0 && (previousValue + incomingValue) > 0
    ? Math.round((previousValue + incomingValue) / Math.max(nextOnHand, 1))
    : Number(current?.avg_cost_vnd ?? params.line.unitCostVnd);

  const payload = {
    id: current?.id ?? crypto.randomUUID(),
    organization_id: params.organizationId,
    warehouse_id: params.warehouseId,
    product_variant_id: params.line.productVariantId ?? null,
    sku,
    supplier_id: params.line.supplierId ?? null,
    on_hand_qty: nextOnHand,
    reserved_qty: currentReserved,
    defective_qty: nextDefective,
    avg_cost_vnd: Math.max(0, nextAvgCost),
    updated_at: new Date().toISOString()
  };

  const { error: upsertError } = await supabase
    .from("inventory_balances")
    .upsert(payload, { onConflict: "organization_id,warehouse_id,sku" });

  if (upsertError) throw new Error(upsertError.message);
}

function movementForDocument(type: OperationsDocumentType, quantity: number) {
  if (type === "purchase_receipt") return { movementType: "purchase_in", quantityDelta: quantity, defectiveDelta: 0 };
  if (type === "sales_invoice") return { movementType: "sale_out", quantityDelta: -quantity, defectiveDelta: 0 };
  if (type === "defect_report") return { movementType: "defect_in", quantityDelta: 0, defectiveDelta: quantity };
  if (type === "stock_adjustment") return { movementType: "adjustment", quantityDelta: quantity, defectiveDelta: 0 };
  return null;
}

export async function getOperationsOverview(user: UserAccount): Promise<OperationsOverview> {
  const supabase = createSupabaseServiceClient();

  let balancesQuery = supabase
    .from("inventory_balances")
    .select("id, warehouse_id, product_variant_id, sku, supplier_id, on_hand_qty, reserved_qty, defective_qty, avg_cost_vnd");
  let recentDocsQuery = supabase
    .from("operations_documents")
    .select("id, document_no, type, status, partner_name, total_amount, created_at")
    .order("created_at", { ascending: false })
    .limit(12);

  if (user.organizationId) {
    balancesQuery = balancesQuery.eq("organization_id", user.organizationId);
    recentDocsQuery = recentDocsQuery.eq("organization_id", user.organizationId);
  }

  const [
    balancesResult,
    openPurchaseReceipts,
    pendingInvoices,
    pendingExpenses,
    recentDocsResult
  ] = await Promise.all([
    balancesQuery,
    countDocuments(user, "purchase_receipt", ["draft", "pending_review"]),
    countDocuments(user, "sales_invoice", ["draft", "pending_review"]),
    countDocuments(user, "expense", ["draft", "pending_review"]),
    recentDocsQuery
  ]);

  if (balancesResult.error) throw new Error(`Không thể đọc tồn kho: ${balancesResult.error.message}`);
  if (recentDocsResult.error) throw new Error(`Không thể đọc chứng từ gần nhất: ${recentDocsResult.error.message}`);

  const balances = (balancesResult.data ?? []) as InventoryBalanceRow[];
  const onHandQty = balances.reduce((sum, row) => sum + Number(row.on_hand_qty ?? 0), 0);
  const reservedQty = balances.reduce((sum, row) => sum + Number(row.reserved_qty ?? 0), 0);
  const defectiveQty = balances.reduce((sum, row) => sum + Number(row.defective_qty ?? 0), 0);
  const inventoryValueVnd = balances.reduce(
    (sum, row) => sum + Number(row.on_hand_qty ?? 0) * Number(row.avg_cost_vnd ?? 0),
    0
  );

  return {
    inventory: {
      onHandQty,
      reservedQty,
      defectiveQty,
      availableQty: Math.max(0, onHandQty - reservedQty - defectiveQty),
      inventoryValueVnd
    },
    openPurchaseReceipts,
    pendingInvoices,
    pendingExpenses,
    defectiveSkuCount: balances.filter((row) => Number(row.defective_qty ?? 0) > 0).length,
    recentDocuments: ((recentDocsResult.data ?? []) as OperationsDocumentRow[]).map(toDocumentSummary)
  };
}

export async function createOperationsDocument(
  input: CreateOperationsDocumentInput,
  user: UserAccount
): Promise<OperationsDocumentSummary> {
  const supabase = createSupabaseServiceClient();
  const organizationId = requireOrganizationId(user);
  const warehouseId = await getDefaultWarehouseId(organizationId);
  const lines = input.lines ?? [];
  const lineTotal = lines.reduce((sum, line) => sum + line.quantity * line.unitCostVnd, 0);
  const totalAmount = input.type === "expense" ? input.amountVnd ?? 0 : lineTotal;
  const documentId = crypto.randomUUID();
  const now = new Date();
  const documentNo = input.documentNo?.trim() || `${input.type.toUpperCase()}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${Date.now()}`;
  const status: OperationsDocumentStatus = input.shouldPost ? "posted" : "draft";

  const { data: inserted, error: insertError } = await supabase
    .from("operations_documents")
    .insert({
      id: documentId,
      organization_id: organizationId,
      type: input.type,
      document_no: documentNo,
      status,
      partner_name: input.partnerName || null,
      total_amount: totalAmount,
      note: input.note || null,
      created_by: user.id,
      posted_by: input.shouldPost ? user.id : null,
      posted_at: input.shouldPost ? now.toISOString() : null
    })
    .select("id, document_no, type, status, partner_name, total_amount, created_at")
    .single();

  if (insertError || !inserted) throw new Error(insertError?.message ?? "Không thể tạo chứng từ vận hành.");

  if (lines.length > 0) {
    const lineRows = lines.map((line, index) => ({
      id: crypto.randomUUID(),
      document_id: documentId,
      organization_id: organizationId,
      line_no: index + 1,
      product_variant_id: line.productVariantId ?? null,
      sku_snapshot: line.sku || line.productVariantId || `MANUAL-${index + 1}`,
      description: line.description,
      quantity: line.quantity,
      unit_cost: line.unitCostVnd,
      total_cost: line.quantity * line.unitCostVnd,
      supplier_id: line.supplierId ?? null
    }));
    const { error: lineError } = await supabase.from("operations_document_lines").insert(lineRows);
    if (lineError) throw new Error(lineError.message);
  }

  if (input.type === "expense") {
    const { error: expenseError } = await supabase.from("expense_documents").insert({
      id: crypto.randomUUID(),
      organization_id: organizationId,
      operations_document_id: documentId,
      expense_category: input.expenseCategory || "Chi phí phát sinh",
      amount: totalAmount
    });
    if (expenseError) throw new Error(expenseError.message);
  }

  if (input.type === "sales_invoice") {
    const { error: invoiceError } = await supabase.from("business_invoices").insert({
      id: crypto.randomUUID(),
      organization_id: organizationId,
      operations_document_id: documentId,
      invoice_no: documentNo,
      invoice_type: "sales",
      status: input.shouldPost ? "issued" : "draft",
      partner_name: input.partnerName || null,
      total_amount: totalAmount,
      issued_at: input.shouldPost ? now.toISOString() : null
    });
    if (invoiceError) throw new Error(invoiceError.message);
  }

  if (input.shouldPost) {
    for (const line of lines) {
      const movement = movementForDocument(input.type, line.quantity);
      if (!movement) continue;

      await updateInventoryBalance({
        organizationId,
        warehouseId,
        line,
        quantityDelta: movement.quantityDelta,
        defectiveDelta: movement.defectiveDelta
      });

      const { error: movementError } = await supabase.from("stock_movements").insert({
        id: crypto.randomUUID(),
        organization_id: organizationId,
        warehouse_id: warehouseId,
        document_id: documentId,
        product_variant_id: line.productVariantId ?? null,
        sku_snapshot: line.sku || line.productVariantId || "MANUAL",
        movement_type: movement.movementType,
        quantity_delta: movement.quantityDelta,
        defective_delta: movement.defectiveDelta,
        unit_cost: line.unitCostVnd,
        created_by: user.id
      });

      if (movementError) throw new Error(movementError.message);
    }
  }

  return toDocumentSummary(inserted as OperationsDocumentRow);
}
