import "server-only";

import type {
  AdminReportsOverview,
  CustomerOrder,
  ReportAlert,
  ReportBreakdownRow,
  UserAccount
} from "@/lib/domain";
import { getOrders } from "@/server/db";
import { createSupabaseServiceClient } from "@/server/supabase";

interface InventoryBalanceReportRow {
  sku: string;
  on_hand_qty: number;
  reserved_qty: number;
  defective_qty: number;
  avg_cost_vnd: number | string;
}

interface JournalLineReportRow {
  account_code: string;
  account_name: string;
  debit_amount: number | string;
  credit_amount: number | string;
}

function latestQuote(order: CustomerOrder) {
  return [...order.quoteVersions].sort((a, b) => b.version - a.version)[0];
}

function isAcceptedBusinessOrder(order: CustomerOrder): boolean {
  return ["customer_accepted", "locked"].includes(order.commercialStatus)
    || ["packing", "ready_to_ship", "shipped", "delivered"].includes(order.fulfillmentStatus);
}

function addAmount(map: Map<string, ReportBreakdownRow>, key: string, label: string, amountVnd: number, quantity = 0) {
  const current = map.get(key) ?? { key, label, quantity: 0, amountVnd: 0 };
  current.amountVnd += amountVnd;
  current.quantity = (current.quantity ?? 0) + quantity;
  map.set(key, current);
}

function summarizeOrders(orders: CustomerOrder[]) {
  const salesByStatus = new Map<string, ReportBreakdownRow>();
  const salesBySupplier = new Map<string, ReportBreakdownRow>();
  let acceptedOrders = 0;
  let activeOrders = 0;
  let invoiceRequestedOrders = 0;
  let estimatedSalesVnd = 0;
  let estimatedGrossSalesVnd = 0;
  let discountAndOfferVnd = 0;
  let paymentRequestedVnd = 0;
  let paymentConfirmedVnd = 0;
  let paymentPendingProofVnd = 0;

  for (const order of orders) {
    if (order.commercialStatus !== "cancelled" && order.fulfillmentStatus !== "delivered") {
      activeOrders += 1;
    }
    if (order.invoiceRequested) invoiceRequestedOrders += 1;

    const quote = latestQuote(order);
    const quoteTotal = quote?.finalTotal ?? order.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceSnapshot,
      0
    );
    const grossOrderTotal = order.items.reduce((sum, item) => sum + item.quantity * item.unitPriceSnapshot, 0);
    estimatedGrossSalesVnd += grossOrderTotal;
    discountAndOfferVnd += Math.max(0, grossOrderTotal - quoteTotal);

    if (isAcceptedBusinessOrder(order)) {
      acceptedOrders += 1;
      estimatedSalesVnd += quoteTotal;
    }

    addAmount(salesByStatus, order.commercialStatus, order.commercialStatus, quoteTotal, 1);

    for (const item of order.items) {
      addAmount(
        salesBySupplier,
        item.supplierId,
        item.supplierId,
        item.quantity * item.unitPriceSnapshot,
        item.quantity
      );
    }

    for (const request of order.paymentRequests) {
      if (["active", "uploaded", "confirmed"].includes(request.status)) {
        paymentRequestedVnd += request.amount;
      }
      if (request.status === "confirmed") {
        paymentConfirmedVnd += request.amount;
      }
      if (request.status === "uploaded") {
        paymentPendingProofVnd += request.amount;
      }
    }
  }

  return {
    acceptedOrders,
    activeOrders,
    invoiceRequestedOrders,
    estimatedSalesVnd,
    estimatedGrossSalesVnd,
    discountAndOfferVnd,
    paymentRequestedVnd,
    paymentConfirmedVnd,
    paymentPendingProofVnd,
    salesByStatus: [...salesByStatus.values()].sort((a, b) => b.amountVnd - a.amountVnd),
    salesBySupplier: [...salesBySupplier.values()].sort((a, b) => b.amountVnd - a.amountVnd)
  };
}

async function readInventory(user: UserAccount, alerts: ReportAlert[]) {
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("inventory_balances")
    .select("sku, on_hand_qty, reserved_qty, defective_qty, avg_cost_vnd")
    .order("updated_at", { ascending: false });

  if (user.organizationId) {
    query = query.eq("organization_id", user.organizationId);
  }

  const { data, error } = await query;
  if (error) {
    alerts.push({
      severity: "warning",
      area: "inventory",
      message: `Chưa đọc được tồn kho vận hành: ${error.message}. Hãy kiểm tra migration update_v4_operations.sql.`
    });
    return {
      inventoryValueVnd: 0,
      onHandQty: 0,
      availableQty: 0,
      defectiveQty: 0,
      inventoryBySku: [] as ReportBreakdownRow[]
    };
  }

  const rows = (data ?? []) as InventoryBalanceReportRow[];
  let inventoryValueVnd = 0;
  let onHandQty = 0;
  let availableQty = 0;
  let defectiveQty = 0;

  const inventoryBySku = rows.map((row) => {
    const onHand = Number(row.on_hand_qty ?? 0);
    const reserved = Number(row.reserved_qty ?? 0);
    const defective = Number(row.defective_qty ?? 0);
    const available = Math.max(0, onHand - reserved - defective);
    const value = onHand * Number(row.avg_cost_vnd ?? 0);
    inventoryValueVnd += value;
    onHandQty += onHand;
    availableQty += available;
    defectiveQty += defective;
    return {
      key: row.sku,
      label: row.sku,
      quantity: available,
      amountVnd: value,
      secondaryAmountVnd: defective
    };
  });

  return {
    inventoryValueVnd,
    onHandQty,
    availableQty,
    defectiveQty,
    inventoryBySku: inventoryBySku.sort((a, b) => b.amountVnd - a.amountVnd).slice(0, 12)
  };
}

async function readAccounting(user: UserAccount, alerts: ReportAlert[]) {
  const supabase = createSupabaseServiceClient();
  let entriesQuery = supabase
    .from("journal_entries")
    .select("id, status", { count: "exact" });
  let linesQuery = supabase
    .from("journal_lines")
    .select("account_code, account_name, debit_amount, credit_amount");

  if (user.organizationId) {
    entriesQuery = entriesQuery.eq("organization_id", user.organizationId);
    linesQuery = linesQuery.eq("organization_id", user.organizationId);
  }

  const [entriesResult, linesResult] = await Promise.all([entriesQuery, linesQuery]);

  if (entriesResult.error || linesResult.error) {
    alerts.push({
      severity: "warning",
      area: "accounting",
      message: `Chưa đọc được sổ kế toán: ${entriesResult.error?.message ?? linesResult.error?.message}. Hãy kiểm tra migration update_v3_accounting.sql.`
    });
    return {
      postedJournalEntries: 0,
      draftJournalEntries: 0,
      trialBalanceDebitVnd: 0,
      trialBalanceCreditVnd: 0,
      trialBalanceDifferenceVnd: 0,
      accountingByAccount: [] as ReportBreakdownRow[]
    };
  }

  const entries = (entriesResult.data ?? []) as Array<{ status: string }>;
  const lines = (linesResult.data ?? []) as JournalLineReportRow[];
  const byAccount = new Map<string, ReportBreakdownRow>();
  let debit = 0;
  let credit = 0;

  for (const line of lines) {
    const lineDebit = Number(line.debit_amount ?? 0);
    const lineCredit = Number(line.credit_amount ?? 0);
    debit += lineDebit;
    credit += lineCredit;
    const key = line.account_code;
    const current = byAccount.get(key) ?? {
      key,
      label: `${line.account_code} - ${line.account_name}`,
      amountVnd: 0,
      secondaryAmountVnd: 0
    };
    current.amountVnd += lineDebit;
    current.secondaryAmountVnd = (current.secondaryAmountVnd ?? 0) + lineCredit;
    byAccount.set(key, current);
  }

  return {
    postedJournalEntries: entries.filter((entry) => entry.status === "posted").length,
    draftJournalEntries: entries.filter((entry) => entry.status === "draft").length,
    trialBalanceDebitVnd: debit,
    trialBalanceCreditVnd: credit,
    trialBalanceDifferenceVnd: Math.abs(debit - credit),
    accountingByAccount: [...byAccount.values()]
      .sort((a, b) => Math.max(b.amountVnd, b.secondaryAmountVnd ?? 0) - Math.max(a.amountVnd, a.secondaryAmountVnd ?? 0))
      .slice(0, 12)
  };
}

export async function getAdminReportsOverview(user: UserAccount): Promise<AdminReportsOverview> {
  const alerts: ReportAlert[] = [
    {
      severity: "info",
      area: "data",
      message: "Báo cáo hiện là mixed operational estimate: doanh thu lấy từ đơn/báo giá, tồn kho từ inventory_balances, kế toán từ journal_lines nếu đã chạy migration và đã post bút toán."
    },
    {
      severity: "warning",
      area: "reconciliation",
      message: "Chưa có bank/COD reconciliation batch, nên số tiền đã xác nhận vẫn cần đối chiếu sao kê thật trước khi khóa sổ."
    }
  ];

  const orders = await getOrders(user);
  const sales = summarizeOrders(orders);
  const [inventory, accounting] = await Promise.all([
    readInventory(user, alerts),
    readAccounting(user, alerts)
  ]);

  if (sales.invoiceRequestedOrders > 0) {
    alerts.push({
      severity: "warning",
      area: "invoice",
      message: `${sales.invoiceRequestedOrders} đơn có yêu cầu xuất hóa đơn; cần module hóa đơn thuế/VAT đầy đủ để báo cáo thuế chính xác.`
    });
  }
  if (inventory.defectiveQty > 0) {
    alerts.push({
      severity: "warning",
      area: "inventory",
      message: `Đang có ${inventory.defectiveQty} sản phẩm lỗi cần luồng xử lý: trả NCC, sửa/đóng gói lại, thanh lý hoặc ghi giảm.`
    });
  }
  if (accounting.trialBalanceDifferenceVnd !== 0) {
    alerts.push({
      severity: "critical",
      area: "accounting",
      message: `Trial balance đang lệch ${accounting.trialBalanceDifferenceVnd.toLocaleString("vi-VN")} VND. Không được khóa kỳ cho tới khi xử lý.`
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    basis: "mixed_operational_estimate",
    kpis: {
      totalOrders: orders.length,
      activeOrders: sales.activeOrders,
      acceptedOrders: sales.acceptedOrders,
      invoiceRequestedOrders: sales.invoiceRequestedOrders,
      estimatedSalesVnd: sales.estimatedSalesVnd,
      estimatedGrossSalesVnd: sales.estimatedGrossSalesVnd,
      discountAndOfferVnd: sales.discountAndOfferVnd,
      paymentRequestedVnd: sales.paymentRequestedVnd,
      paymentConfirmedVnd: sales.paymentConfirmedVnd,
      paymentPendingProofVnd: sales.paymentPendingProofVnd,
      inventoryValueVnd: inventory.inventoryValueVnd,
      onHandQty: inventory.onHandQty,
      availableQty: inventory.availableQty,
      defectiveQty: inventory.defectiveQty,
      postedJournalEntries: accounting.postedJournalEntries,
      draftJournalEntries: accounting.draftJournalEntries,
      trialBalanceDebitVnd: accounting.trialBalanceDebitVnd,
      trialBalanceCreditVnd: accounting.trialBalanceCreditVnd,
      trialBalanceDifferenceVnd: accounting.trialBalanceDifferenceVnd
    },
    salesByStatus: sales.salesByStatus,
    salesBySupplier: sales.salesBySupplier,
    inventoryBySku: inventory.inventoryBySku,
    accountingByAccount: accounting.accountingByAccount,
    alerts
  };
}
