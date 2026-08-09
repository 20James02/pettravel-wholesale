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

interface ReceivableLedgerReportRow {
  customer_name: string;
  due_date?: string | null;
  debit_amount: number | string;
  credit_amount: number | string;
  status: string;
}

interface PayableLedgerReportRow {
  partner_name: string;
  due_date?: string | null;
  debit_amount: number | string;
  credit_amount: number | string;
  status: string;
}

interface ReconciliationBatchReportRow {
  type: string;
  status: string;
  total_external_amount: number | string;
  total_matched_amount: number | string;
  total_difference_amount: number | string;
}

interface BankTransactionReportRow {
  reconciliation_status: string;
  amount: number | string;
}

interface StockReservationReportRow {
  sku_snapshot: string;
  quantity: number;
  status: string;
  expires_at?: string | null;
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

async function readStockReservations(user: UserAccount, alerts: ReportAlert[]) {
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("stock_reservations")
    .select("sku_snapshot, quantity, status, expires_at")
    .in("status", ["active", "expired"]);

  if (user.organizationId) {
    query = query.eq("organization_id", user.organizationId);
  }

  const { data, error } = await query;
  if (error) {
    alerts.push({
      severity: "warning",
      area: "inventory",
      message: `Chưa đọc được giữ hàng theo đơn: ${error.message}. Hãy chạy supabase/update_v6_stock_reservations.sql.`
    });
    return {
      reservationOpenQty: 0,
      reservationExpiredQty: 0,
      reservationsBySku: [] as ReportBreakdownRow[]
    };
  }

  const now = new Date().toISOString();
  const bySku = new Map<string, ReportBreakdownRow>();
  let openQty = 0;
  let expiredQty = 0;

  for (const row of (data ?? []) as StockReservationReportRow[]) {
    const isExpired = row.status === "expired" || Boolean(row.expires_at && row.expires_at < now);
    if (isExpired) expiredQty += Number(row.quantity ?? 0);
    if (!isExpired && row.status === "active") openQty += Number(row.quantity ?? 0);

    const current = bySku.get(row.sku_snapshot) ?? {
      key: row.sku_snapshot,
      label: row.sku_snapshot,
      quantity: 0,
      amountVnd: 0,
      secondaryAmountVnd: 0
    };
    if (!isExpired && row.status === "active") {
      current.quantity = (current.quantity ?? 0) + Number(row.quantity ?? 0);
    } else {
      current.secondaryAmountVnd = (current.secondaryAmountVnd ?? 0) + Number(row.quantity ?? 0);
    }
    bySku.set(row.sku_snapshot, current);
  }

  return {
    reservationOpenQty: openQty,
    reservationExpiredQty: expiredQty,
    reservationsBySku: [...bySku.values()]
      .sort((a, b) => ((b.quantity ?? 0) + (b.secondaryAmountVnd ?? 0)) - ((a.quantity ?? 0) + (a.secondaryAmountVnd ?? 0)))
      .slice(0, 12)
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

async function readReceivables(user: UserAccount, alerts: ReportAlert[]) {
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("receivable_ledger_entries")
    .select("customer_name, due_date, debit_amount, credit_amount, status")
    .neq("status", "void");

  if (user.organizationId) {
    query = query.eq("organization_id", user.organizationId);
  }

  const { data, error } = await query;
  if (error) {
    alerts.push({
      severity: "warning",
      area: "receivable",
      message: `Chưa đọc được sổ công nợ phải thu: ${error.message}. Hãy chạy supabase/update_v5_receivables_reconciliation.sql.`
    });
    return {
      receivableOpenVnd: 0,
      receivableOverdueVnd: 0,
      receivableByCustomer: [] as ReportBreakdownRow[]
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const byCustomer = new Map<string, ReportBreakdownRow>();
  let open = 0;
  let overdue = 0;

  for (const row of (data ?? []) as ReceivableLedgerReportRow[]) {
    const balance = Number(row.debit_amount ?? 0) - Number(row.credit_amount ?? 0);
    if (balance <= 0 || row.status === "settled") continue;
    open += balance;
    if (row.due_date && row.due_date < today) overdue += balance;
    addAmount(byCustomer, row.customer_name, row.customer_name, balance, 1);
  }

  return {
    receivableOpenVnd: open,
    receivableOverdueVnd: overdue,
    receivableByCustomer: [...byCustomer.values()].sort((a, b) => b.amountVnd - a.amountVnd).slice(0, 12)
  };
}

async function readPayables(user: UserAccount, alerts: ReportAlert[]) {
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("payable_ledger_entries")
    .select("partner_name, due_date, debit_amount, credit_amount, status")
    .neq("status", "void");

  if (user.organizationId) {
    query = query.eq("organization_id", user.organizationId);
  }

  const { data, error } = await query;
  if (error) {
    alerts.push({
      severity: "warning",
      area: "payable",
      message: `Chưa đọc được sổ công nợ phải trả: ${error.message}. Hãy chạy supabase/update_v5_receivables_reconciliation.sql.`
    });
    return {
      payableOpenVnd: 0,
      payableOverdueVnd: 0,
      payableByPartner: [] as ReportBreakdownRow[]
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const byPartner = new Map<string, ReportBreakdownRow>();
  let open = 0;
  let overdue = 0;

  for (const row of (data ?? []) as PayableLedgerReportRow[]) {
    const balance = Number(row.credit_amount ?? 0) - Number(row.debit_amount ?? 0);
    if (balance <= 0 || row.status === "settled") continue;
    open += balance;
    if (row.due_date && row.due_date < today) overdue += balance;
    addAmount(byPartner, row.partner_name, row.partner_name, balance, 1);
  }

  return {
    payableOpenVnd: open,
    payableOverdueVnd: overdue,
    payableByPartner: [...byPartner.values()].sort((a, b) => b.amountVnd - a.amountVnd).slice(0, 12)
  };
}

async function readReconciliation(user: UserAccount, alerts: ReportAlert[]) {
  const supabase = createSupabaseServiceClient();
  let batchesQuery = supabase
    .from("reconciliation_batches")
    .select("type, status, total_external_amount, total_matched_amount, total_difference_amount");
  let bankQuery = supabase
    .from("bank_transactions")
    .select("reconciliation_status, amount");

  if (user.organizationId) {
    batchesQuery = batchesQuery.eq("organization_id", user.organizationId);
    bankQuery = bankQuery.eq("organization_id", user.organizationId);
  }

  const [batchesResult, bankResult] = await Promise.all([batchesQuery, bankQuery]);
  if (batchesResult.error || bankResult.error) {
    alerts.push({
      severity: "warning",
      area: "reconciliation",
      message: `Chưa đọc được dữ liệu đối soát: ${batchesResult.error?.message ?? bankResult.error?.message}. Hãy chạy supabase/update_v5_receivables_reconciliation.sql.`
    });
    return {
      reconciliationMatchedVnd: 0,
      reconciliationUnmatchedVnd: 0,
      openReconciliationBatches: 0,
      unmatchedBankTransactions: 0,
      reconciliationByType: [] as ReportBreakdownRow[]
    };
  }

  const byType = new Map<string, ReportBreakdownRow>();
  let matched = 0;
  let difference = 0;
  let openBatches = 0;

  for (const row of (batchesResult.data ?? []) as ReconciliationBatchReportRow[]) {
    const matchedAmount = Number(row.total_matched_amount ?? 0);
    const diffAmount = Number(row.total_difference_amount ?? 0);
    matched += matchedAmount;
    difference += diffAmount;
    if (["open", "reviewing"].includes(row.status)) openBatches += 1;

    const current = byType.get(row.type) ?? {
      key: row.type,
      label: row.type,
      quantity: 0,
      amountVnd: 0,
      secondaryAmountVnd: 0
    };
    current.quantity = (current.quantity ?? 0) + 1;
    current.amountVnd += matchedAmount;
    current.secondaryAmountVnd = (current.secondaryAmountVnd ?? 0) + diffAmount;
    byType.set(row.type, current);
  }

  const unmatchedBankTransactions = ((bankResult.data ?? []) as BankTransactionReportRow[])
    .filter((row) => row.reconciliation_status === "unmatched").length;
  const unmatchedBankAmount = ((bankResult.data ?? []) as BankTransactionReportRow[])
    .filter((row) => row.reconciliation_status === "unmatched")
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  return {
    reconciliationMatchedVnd: matched,
    reconciliationUnmatchedVnd: difference + unmatchedBankAmount,
    openReconciliationBatches: openBatches,
    unmatchedBankTransactions,
    reconciliationByType: [...byType.values()].sort((a, b) => b.amountVnd - a.amountVnd).slice(0, 12)
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
  const [inventory, reservations, accounting, receivables, payables, reconciliation] = await Promise.all([
    readInventory(user, alerts),
    readStockReservations(user, alerts),
    readAccounting(user, alerts),
    readReceivables(user, alerts),
    readPayables(user, alerts),
    readReconciliation(user, alerts)
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
  if (reservations.reservationExpiredQty > 0) {
    alerts.push({
      severity: "warning",
      area: "inventory",
      message: `Có ${reservations.reservationExpiredQty} sản phẩm đang bị giữ hàng quá hạn. Cần release hoặc gia hạn để tồn khả dụng không bị sai.`
    });
  }
  if (accounting.trialBalanceDifferenceVnd !== 0) {
    alerts.push({
      severity: "critical",
      area: "accounting",
      message: `Trial balance đang lệch ${accounting.trialBalanceDifferenceVnd.toLocaleString("vi-VN")} VND. Không được khóa kỳ cho tới khi xử lý.`
    });
  }
  if (receivables.receivableOverdueVnd > 0) {
    alerts.push({
      severity: "critical",
      area: "receivable",
      message: `Công nợ phải thu quá hạn ${receivables.receivableOverdueVnd.toLocaleString("vi-VN")} VND cần nhắc thanh toán hoặc khóa hạn mức đại lý.`
    });
  }
  if (payables.payableOverdueVnd > 0) {
    alerts.push({
      severity: "warning",
      area: "payable",
      message: `Công nợ phải trả quá hạn ${payables.payableOverdueVnd.toLocaleString("vi-VN")} VND cần kiểm tra nhà cung cấp/đối tác vận chuyển.`
    });
  }
  if (reconciliation.reconciliationUnmatchedVnd > 0 || reconciliation.unmatchedBankTransactions > 0) {
    alerts.push({
      severity: "warning",
      area: "reconciliation",
      message: `Còn ${reconciliation.unmatchedBankTransactions} giao dịch ngân hàng chưa khớp, tổng chênh/chưa đối soát ${reconciliation.reconciliationUnmatchedVnd.toLocaleString("vi-VN")} VND.`
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
      receivableOpenVnd: receivables.receivableOpenVnd,
      receivableOverdueVnd: receivables.receivableOverdueVnd,
      payableOpenVnd: payables.payableOpenVnd,
      payableOverdueVnd: payables.payableOverdueVnd,
      reconciliationMatchedVnd: reconciliation.reconciliationMatchedVnd,
      reconciliationUnmatchedVnd: reconciliation.reconciliationUnmatchedVnd,
      openReconciliationBatches: reconciliation.openReconciliationBatches,
      unmatchedBankTransactions: reconciliation.unmatchedBankTransactions,
      inventoryValueVnd: inventory.inventoryValueVnd,
      onHandQty: inventory.onHandQty,
      availableQty: inventory.availableQty,
      defectiveQty: inventory.defectiveQty,
      reservationOpenQty: reservations.reservationOpenQty,
      reservationExpiredQty: reservations.reservationExpiredQty,
      postedJournalEntries: accounting.postedJournalEntries,
      draftJournalEntries: accounting.draftJournalEntries,
      trialBalanceDebitVnd: accounting.trialBalanceDebitVnd,
      trialBalanceCreditVnd: accounting.trialBalanceCreditVnd,
      trialBalanceDifferenceVnd: accounting.trialBalanceDifferenceVnd
    },
    salesByStatus: sales.salesByStatus,
    salesBySupplier: sales.salesBySupplier,
    receivableByCustomer: receivables.receivableByCustomer,
    payableByPartner: payables.payableByPartner,
    reconciliationByType: reconciliation.reconciliationByType,
    reservationsBySku: reservations.reservationsBySku,
    inventoryBySku: inventory.inventoryBySku,
    accountingByAccount: accounting.accountingByAccount,
    alerts
  };
}
