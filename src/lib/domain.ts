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
  email: string;
  role: RoleKey;
  isAdmin: boolean;
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
  wholesalePrice: number;
  minOrderQty: number;
  stock: number;
  supplierId: string;
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

export interface OrderItem {
  id: string;
  productCode: string;
  productName: string;
  variantSku: string;
  variantLabel: string;
  quantity: number;
  unitPriceSnapshot: number;
  supplierId: string;
}

export interface QuoteAdjustment {
  id: string;
  type: "discount" | "free_shipping" | "offer" | "shipping_fee";
  label: string;
  amount: number;
  requiresApproval: boolean;
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
  uploadedAt: string;
  status: "pending_admin_confirmation" | "accepted" | "rejected";
}

export interface FulfillmentGroup {
  id: string;
  supplierId: string;
  supplierName: string;
  status: FulfillmentStatus;
  itemIds: string[];
  internalNote: string;
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
  comments: OrderComment[];
  updatedAt: string;
}

export interface AdminPolicy {
  freeShippingThreshold: number;
  defaultDepositRate: number;
  maxOperatorDiscountRate: number;
  requireManagerApprovalAbove: number;
}
