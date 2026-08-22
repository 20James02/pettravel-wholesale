export type RoleKey =
  | "super_admin"
  | "admin_manager"
  | "order_operator"
  | "accountant"
  | "warehouse"
  | "customer_owner"
  | "customer_staff";

export type PermissionKey =
  | "catalog.read"
  | "catalog.write"
  | "supplier.read"
  | "supplier.write"
  | "order.read"
  | "order.quote"
  | "order.adjust"
  | "order.confirm_payment"
  | "order.ship"
  | "order.comment_internal"
  | "accounting.read"
  | "accounting.write"
  | "accounting.post"
  | "accounting.close_period"
  | "accounting.export"
  | "operations.read"
  | "operations.write"
  | "operations.post"
  | "rbac.write";

export type CommercialStatus =
  | "draft"
  | "submitted"
  | "admin_review"
  | "quoted"
  | "customer_accepted"
  | "locked"
  | "cancelled";

export type PaymentStatus =
  | "unrequested"
  | "deposit_requested"
  | "deposit_uploaded"
  | "deposit_confirmed"
  | "full_requested"
  | "full_uploaded"
  | "paid"
  | "cod_remaining"
  | "refunded";


export type FulfillmentStatus =
  | "not_started"
  | "supplier_checking"
  | "supplier_confirmed"
  | "packing"
  | "ready_to_ship"
  | "shipped"
  | "delivered";

export type PaymentIntent = "deposit_cod" | "pay_full";

export interface UserAccount {
  id: string;
  name: string;
  company: string;
  organizationId?: string;
  email: string;
  role: RoleKey;
  isAdmin: boolean;
  permissions: PermissionKey[];
}

export interface Supplier {
  id: string;
  name: string;
  code: string;
  leadTimeDays: number;
  adminOnly: boolean;
}

export interface ProductVariant {
  id: string;
  sku: string;
  label: string;
  barcode?: string;
  wholesalePrice?: number;
  minOrderQty: number;
  stock: number;
  supplierId?: string;
  imageUrl?: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  category: string;
  brand: string;
  imageUrl: string;
  images?: string[];
  dimensions?: string;
  weight?: number;
  description?: string;
  tags: string[];
  variants: ProductVariant[];
}

export type UploadStatus = "pending" | "uploading" | "success" | "error" | "retrying";

export interface ProductUploadImage {
  id: string;
  file?: File;
  previewUrl: string;
  r2Url?: string;
  r2Key?: string;
  status: UploadStatus;
  progress: number;
  error?: string;
}

export interface OrderItem {
  id: string;
  productCode: string;
  productName: string;
  variantSku: string;
  variantLabel: string;
  variantImage?: string;
  quantity: number;
  unitPriceSnapshot: number;
  supplierId?: string;
  locked?: boolean;
}

export interface QuoteAdjustment {
  id: string;
  type: "discount" | "free_shipping" | "offer" | "shipping_fee";
  label: string;
  amount: number;
  requiresApproval: boolean;
  approvedBy?: string;
}

export interface QuoteVersion {
  id: string;
  version: number;
  status: "draft" | "published" | "accepted" | "superseded";
  subtotal: number;
  adjustments: QuoteAdjustment[];
  finalTotal: number;
  depositAmount: number;
  codRemaining: number;
  shippingFeeOption?: "included" | "separate_cod";
  expiresAt: string;
}

export interface PaymentRequest {
  id: string;
  quoteVersion: number;
  amount: number;
  purpose: "deposit" | "full" | "remaining";
  reference: string;
  qrPayload: string;
  expiresAt: string;
  status: "active" | "uploaded" | "confirmed" | "expired" | "superseded";
}

export interface PaymentProof {
  id: string;
  paymentRequestId: string;
  fileName: string;
  storageKey?: string;
  contentType?: string;
  fileSizeBytes?: number;
  uploadedAt: string;
  status: "pending_admin_confirmation" | "accepted" | "rejected";
}

export interface FulfillmentGroup {
  id: string;
  supplierId?: string;
  supplierName?: string;
  status: FulfillmentStatus;
  itemIds: string[];
  internalNote?: string;
}

export interface Shipment {
  carrier: string;
  trackingCode: string;
  shippingFee: number;
  eta: string;
  note: string;
}

export interface OrderComment {
  id: string;
  author: string;
  audience: "customer_visible" | "internal";
  message: string;
  createdAt: string;
}

export interface CustomerOrder {
  id: string;
  number: string;
  customerName: string;
  customerCompany: string;
  customerId: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  commercialStatus: CommercialStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  paymentIntent: PaymentIntent;
  invoiceRequested: boolean;
  items: OrderItem[];
  quoteVersions: QuoteVersion[];
  paymentRequests: PaymentRequest[];
  paymentProofs: PaymentProof[];
  fulfillmentGroups: FulfillmentGroup[];
  shipment?: Shipment;
  recipientName?: string;
  recipientPhone?: string;
  recipientAddress?: string;
  customerTaxCode?: string;
  customerNote?: string;
  comments: OrderComment[];
  acceptedQuoteId?: string;
  acceptedQuoteVersion?: number;
  updatedAt: string;
}

// ── CUSTOMER MUTATION DTOS (MINIMAL INTENT - NO OVERPOSTING) ─

export interface CustomerOrderCreateInput {
  items: Array<{ variantSku: string; quantity: number; variantImage?: string | null }>;
  paymentIntent?: PaymentIntent;
  recipientName?: string;
  recipientPhone?: string;
  recipientAddress?: string;
  customerTaxCode?: string;
  customerNote?: string;
}

export interface CustomerOrderContactUpdateInput {
  id: string;
  expectedUpdatedAt?: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientAddress?: string;
  customerTaxCode?: string;
  customerNote?: string;
  paymentIntent?: PaymentIntent;
  invoiceRequested?: boolean;
}

export interface CustomerQuoteAcceptanceInput {
  id: string;
  expectedUpdatedAt?: string;
  commercialStatus: "customer_accepted";
  acceptedQuoteId: string;
  acceptedQuoteVersion: number;
}

export interface CustomerQuoteChangeRequestInput {
  id: string;
  expectedUpdatedAt?: string;
  commercialStatus: "admin_review";
  customerNote?: string;
  comments?: Array<{ id?: string; message: string }>;
}

export interface CustomerPaymentProofInput {
  id: string;
  expectedUpdatedAt?: string;
  paymentProofs: PaymentProof[];
}

export interface CustomerCommentInput {
  id: string;
  expectedUpdatedAt?: string;
  comments: Array<{ id?: string; message: string }>;
}

export type CustomerOrderMutationPayload =
  | { action: "accept_quote"; payload: CustomerQuoteAcceptanceInput }
  | { action: "request_changes"; payload: CustomerQuoteChangeRequestInput }
  | { action: "update_contact"; payload: CustomerOrderContactUpdateInput }
  | { action: "upload_proof"; payload: CustomerPaymentProofInput }
  | { action: "comment"; payload: CustomerCommentInput };

export interface OrderRevisionRecord {
  id: string;
  orderId: string;
  revisionNo: number;
  actorId: string;
  actorName: string;
  actorRole: "admin" | "customer" | "staff";
  actionType: "submit_proposal" | "publish_quote" | "accept_quote" | "request_changes" | "update_shipping" | "update_order";
  fromCommercialStatus?: string;
  toCommercialStatus: string;
  itemsSnapshot: OrderItem[];
  quoteSnapshot?: QuoteVersion[];
  shippingSnapshot: {
    recipientName?: string;
    recipientPhone?: string;
    recipientAddress?: string;
    customerTaxCode?: string;
    customerNote?: string;
  };
  note?: string;
  createdAt: string;
}

export interface PromotionTier {
  id: string;
  minOrderValue: number;
  discountPercent: number;
  isFreeShipping: boolean;
  giftName?: string;
  description?: string;
}

export interface AdminPolicy {
  freeShippingThreshold: number;
  defaultDepositRate: number;
  maxOperatorDiscountRate: number;
  requireManagerApprovalAbove: number;
  minWholesaleOrderValue?: number;
  tiers?: PromotionTier[];
  giftThreshold?: number;
  giftName?: string;
}

export type AccountingPeriodStatus = "open" | "closed";
export type JournalEntryStatus = "draft" | "posted" | "void";

export interface JournalEntrySummary {
  id: string;
  entryNo: string;
  description: string;
  status: JournalEntryStatus;
  sourceType: string;
  sourceId: string;
  createdAt: string;
  postedAt?: string;
}

export interface JournalLineSummary {
  id: string;
  lineNo: number;
  accountCode: string;
  accountName: string;
  debitAmountVnd: number;
  creditAmountVnd: number;
  memo?: string;
  orderId?: string;
  supplierId?: string;
  partnerOrgId?: string;
}

export interface JournalEntryDetail extends JournalEntrySummary {
  debitTotalVnd: number;
  creditTotalVnd: number;
  isBalanced: boolean;
  lines: JournalLineSummary[];
}

export interface AccountingOverview {
  periodsTotal: number;
  openPeriods: number;
  closedPeriods: number;
  draftEntries: number;
  postedEntries: number;
  voidEntries: number;
  recentEntries: JournalEntrySummary[];
}

export type OperationsDocumentType = "purchase_receipt" | "sales_invoice" | "expense" | "defect_report" | "stock_adjustment";
export type OperationsDocumentStatus = "draft" | "pending_review" | "posted" | "void";

export interface InventoryMetric {
  onHandQty: number;
  reservedQty: number;
  availableQty: number;
  defectiveQty: number;
  inventoryValueVnd: number;
}

export interface OperationsDocumentSummary {
  id: string;
  documentNo: string;
  type: OperationsDocumentType;
  status: OperationsDocumentStatus;
  partnerName?: string;
  totalAmountVnd: number;
  createdAt: string;
}

export interface OperationsOverview {
  inventory: InventoryMetric;
  openPurchaseReceipts: number;
  pendingInvoices: number;
  pendingExpenses: number;
  defectiveSkuCount: number;
  recentDocuments: OperationsDocumentSummary[];
}

export interface ReportAlert {
  severity: "info" | "warning" | "critical";
  area: "sales" | "inventory" | "accounting" | "reconciliation" | "invoice" | "receivable" | "payable" | "data";
  message: string;
}

export interface ReportKpis {
  totalOrders: number;
  activeOrders: number;
  acceptedOrders: number;
  invoiceRequestedOrders: number;
  estimatedSalesVnd: number;
  estimatedGrossSalesVnd: number;
  discountAndOfferVnd: number;
  paymentRequestedVnd: number;
  paymentConfirmedVnd: number;
  paymentPendingProofVnd: number;
  receivableOpenVnd: number;
  receivableOverdueVnd: number;
  payableOpenVnd: number;
  payableOverdueVnd: number;
  reconciliationMatchedVnd: number;
  reconciliationUnmatchedVnd: number;
  openReconciliationBatches: number;
  unmatchedBankTransactions: number;
  inventoryValueVnd: number;
  onHandQty: number;
  availableQty: number;
  defectiveQty: number;
  reservationOpenQty: number;
  reservationExpiredQty: number;
  postedJournalEntries: number;
  draftJournalEntries: number;
  trialBalanceDebitVnd: number;
  trialBalanceCreditVnd: number;
  trialBalanceDifferenceVnd: number;
}

export interface ReportBreakdownRow {
  key: string;
  label: string;
  quantity?: number;
  amountVnd: number;
  secondaryAmountVnd?: number;
}

export interface AdminReportsOverview {
  generatedAt: string;
  basis: "posted_only" | "mixed_operational_estimate";
  kpis: ReportKpis;
  salesByStatus: ReportBreakdownRow[];
  salesBySupplier: ReportBreakdownRow[];
  receivableByCustomer: ReportBreakdownRow[];
  payableByPartner: ReportBreakdownRow[];
  reconciliationByType: ReportBreakdownRow[];
  reservationsBySku: ReportBreakdownRow[];
  inventoryBySku: ReportBreakdownRow[];
  accountingByAccount: ReportBreakdownRow[];
  alerts: ReportAlert[];
}
