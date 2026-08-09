import "server-only";

import type {
  AdminPolicy,
  CustomerOrder,
  PermissionKey,
  Product,
  RoleKey,
  Supplier,
  UserAccount
} from "@/lib/domain";

/* ──────────────────────────────────────────────────────
   SUPPLIERS (admin-only except Pet Travel branding)
   ────────────────────────────────────────────────────── */

export let suppliers: Supplier[] = [
  { id: "sup_pettravel", code: "PT", name: "Pet Travel", leadTimeDays: 1, adminOnly: false },
  { id: "sup_pawcare", code: "PC", name: "PawCare Vietnam", leadTimeDays: 3, adminOnly: true },
  { id: "sup_meowline", code: "ML", name: "MeowLine Supply", leadTimeDays: 2, adminOnly: true }
];

export let categories: string[] = ["Túi vận chuyển", "Ăn uống du lịch", "Vệ sinh"];

/* ──────────────────────────────────────────────────────
   USERS
   ────────────────────────────────────────────────────── */

export const demoUsers: UserAccount[] = [
  {
    id: "u_admin",
    name: "Admin Pet Travel",
    company: "Pet Travel WholeSale",
    email: "admin@pettravel.vn",
    role: "super_admin",
    isAdmin: true
  },
  {
    id: "u_customer_minh",
    name: "Nguyễn Minh",
    company: "Happy Paws Retail",
    email: "minh@happypaws.vn",
    role: "customer_owner",
    isAdmin: false
  },
  {
    id: "u_customer_lan",
    name: "Trần Ngọc Lan",
    company: "PetLand Đà Nẵng",
    email: "lan@petland.vn",
    role: "customer_owner",
    isAdmin: false
  }
];

/* ──────────────────────────────────────────────────────
   ROLE PERMISSIONS
   ────────────────────────────────────────────────────── */

export const rolePermissions: Record<RoleKey, PermissionKey[]> = {
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

/* ──────────────────────────────────────────────────────
   ADMIN POLICY
   ────────────────────────────────────────────────────── */

export const adminPolicy: AdminPolicy = {
  freeShippingThreshold: 5000000,
  defaultDepositRate: 0.3,
  maxOperatorDiscountRate: 0.08,
  requireManagerApprovalAbove: 500000
};

/* ──────────────────────────────────────────────────────
   PRODUCTS
   ────────────────────────────────────────────────────── */

export let products: Product[] = [
  {
    id: "p_1",
    code: "PT-BAG-001",
    name: "Túi vận chuyển thú cưng AirGo",
    brand: "Pet Travel",
    category: "Túi vận chuyển",
    imageUrl: "/product-bag.svg",
    tags: ["hàng bán chạy", "máy bay", "chó mèo"],
    variants: [
      {
        id: "v_1", sku: "PT-BAG-001-S-GR",
        label: "Size S, xám graphite",
        wholesalePrice: 185000, minOrderQty: 6, stock: 84,
        supplierId: "sup_pettravel"
      },
      {
        id: "v_2", sku: "PT-BAG-001-M-BK",
        label: "Size M, đen carbon",
        wholesalePrice: 235000, minOrderQty: 6, stock: 52,
        supplierId: "sup_pawcare"
      }
    ]
  },
  {
    id: "p_2",
    code: "PT-BOWL-019",
    name: "Bộ bát gấp du lịch StayHydro",
    brand: "Pet Travel",
    category: "Ăn uống du lịch",
    imageUrl: "/product-bowl.svg",
    tags: ["silicone", "du lịch", "combo"],
    variants: [
      {
        id: "v_3", sku: "PT-BOWL-019-2PK",
        label: "Combo 2 bát, xanh teal",
        wholesalePrice: 72000, minOrderQty: 12, stock: 180,
        supplierId: "sup_pettravel"
      },
      {
        id: "v_4", sku: "PT-BOWL-019-4PK",
        label: "Combo 4 bát, mix màu",
        wholesalePrice: 138000, minOrderQty: 8, stock: 94,
        supplierId: "sup_meowline"
      }
    ]
  },
  {
    id: "p_3",
    code: "PT-WIPES-042",
    name: "Khăn ướt vệ sinh chân sau đi chơi",
    brand: "CleanPaw",
    category: "Vệ sinh",
    imageUrl: "/product-wipes.svg",
    tags: ["tiêu hao", "dễ bán lại", "cao cấp"],
    variants: [
      {
        id: "v_5", sku: "PT-WIPES-042-80",
        label: "Gói 80 miếng, mùi nhẹ",
        wholesalePrice: 46000, minOrderQty: 24, stock: 320,
        supplierId: "sup_pettravel"
      },
      {
        id: "v_6", sku: "PT-WIPES-042-120",
        label: "Gói 120 miếng, không mùi",
        wholesalePrice: 62000, minOrderQty: 24, stock: 190,
        supplierId: "sup_pawcare"
      }
    ]
  }
];

/* ──────────────────────────────────────────────────────
   ORDERS — Multiple orders, each owned by a specific user.
   Business rule: Each customer can only have ONE active order
   (status NOT in ["cancelled", "delivered"]) at any given time.
   ────────────────────────────────────────────────────── */

export let demoOrders: CustomerOrder[] = [
  {
    id: "ord_1001",
    number: "PTW-260808-001",
    customerName: "Nguyễn Minh",
    customerCompany: "Happy Paws Retail",
    customerId: "u_customer_minh",
    commercialStatus: "quoted",
    paymentStatus: "deposit_requested",
    fulfillmentStatus: "supplier_checking",
    paymentIntent: "deposit_cod",
    invoiceRequested: true,
    updatedAt: "2026-08-08T09:25:00+07:00",
    items: [
      {
        id: "oi_1",
        productCode: "PT-BAG-001",
        productName: "Túi vận chuyển thú cưng AirGo",
        variantSku: "PT-BAG-001-M-BK",
        variantLabel: "Size M, đen carbon",
        quantity: 12,
        unitPriceSnapshot: 235000,
        supplierId: "sup_pawcare"
      },
      {
        id: "oi_2",
        productCode: "PT-BOWL-019",
        productName: "Bộ bát gấp du lịch StayHydro",
        variantSku: "PT-BOWL-019-2PK",
        variantLabel: "Combo 2 bát, xanh teal",
        quantity: 24,
        unitPriceSnapshot: 72000,
        supplierId: "sup_pettravel"
      }
    ],
    quoteVersions: [
      {
        id: "q_2",
        version: 2,
        status: "published",
        subtotal: 4548000,
        adjustments: [
          { id: "adj_1", type: "discount", label: "Chiết khấu khách đại lý đợt 1", amount: -320000, requiresApproval: false },
          { id: "adj_2", type: "shipping_fee", label: "Phí ship tạm tính", amount: 90000, requiresApproval: false }
        ],
        finalTotal: 4318000,
        depositAmount: 1300000,
        codRemaining: 3018000,
        expiresAt: "2026-08-09T18:00:00+07:00"
      }
    ],
    paymentRequests: [
      {
        id: "pay_1",
        quoteVersion: 2,
        amount: 1300000,
        purpose: "deposit",
        reference: "PTW-260808-001-Q2-DEP",
        qrPayload: "QR|PTW-260808-001|1300000|q2",
        expiresAt: "2026-08-09T18:00:00+07:00",
        status: "active"
      }
    ],
    paymentProofs: [],
    fulfillmentGroups: [
      {
        id: "fg_1",
        supplierId: "sup_pawcare",
        supplierName: "PawCare Vietnam",
        status: "supplier_checking",
        itemIds: ["oi_1"],
        internalNote: "Đang xác nhận màu đen carbon, cần phản hồi trước 15:00."
      },
      {
        id: "fg_2",
        supplierId: "sup_pettravel",
        supplierName: "Pet Travel",
        status: "supplier_confirmed",
        itemIds: ["oi_2"],
        internalNote: "Có sẵn tại kho chính, có thể đóng gói ngay khi xác nhận cọc."
      }
    ],
    comments: [
      {
        id: "c_1",
        author: "Admin Pet Travel",
        audience: "customer_visible",
        message: "Đơn đã được duyệt báo giá v2. Anh/chị kiểm tra tiền cọc và tải ảnh chuyển khoản lên đơn.",
        createdAt: "2026-08-08T09:25:00+07:00"
      },
      {
        id: "c_2",
        author: "Order Ops",
        audience: "internal",
        message: "Khách yêu cầu xuất hóa đơn. Kiểm tra MST trước khi giao.",
        createdAt: "2026-08-08T09:27:00+07:00"
      }
    ]
  },
  {
    id: "ord_1002",
    number: "PTW-260808-002",
    customerName: "Trần Ngọc Lan",
    customerCompany: "PetLand Đà Nẵng",
    customerId: "u_customer_lan",
    commercialStatus: "submitted",
    paymentStatus: "unrequested",
    fulfillmentStatus: "not_started",
    paymentIntent: "pay_full",
    invoiceRequested: false,
    updatedAt: "2026-08-08T11:40:00+07:00",
    items: [
      {
        id: "oi_3",
        productCode: "PT-WIPES-042",
        productName: "Khăn ướt vệ sinh chân sau đi chơi",
        variantSku: "PT-WIPES-042-80",
        variantLabel: "Gói 80 miếng, mùi nhẹ",
        quantity: 48,
        unitPriceSnapshot: 46000,
        supplierId: "sup_pettravel"
      }
    ],
    quoteVersions: [],
    paymentRequests: [],
    paymentProofs: [],
    fulfillmentGroups: [],
    comments: [
      {
        id: "c_3",
        author: "Trần Ngọc Lan",
        audience: "customer_visible",
        message: "Chị ơi cho em đặt 48 gói khăn ướt. Ship về Đà Nẵng giúp em nhé.",
        createdAt: "2026-08-08T11:40:00+07:00"
      }
    ]
  }
];

/* ──────────────────────────────────────────────────────
   HELPERS
   ────────────────────────────────────────────────────── */

const TERMINAL_STATUSES: CustomerOrder["commercialStatus"][] = ["cancelled"];
const COMPLETED_FULFILLMENT: CustomerOrder["fulfillmentStatus"][] = ["delivered"];

/**
 * Check if a customer already has an active (non-terminal) order.
 */
export function hasActiveOrder(customerId: string): boolean {
  return demoOrders.some(
    (o) =>
      o.customerId === customerId &&
      !TERMINAL_STATUSES.includes(o.commercialStatus) &&
      !COMPLETED_FULFILLMENT.includes(o.fulfillmentStatus)
  );
}

/**
 * Get orders visible to a specific user.
 * Admin sees all; Customer sees only their own.
 */
export function getOrdersForUser(user: UserAccount): CustomerOrder[] {
  if (user.isAdmin) return demoOrders;
  return demoOrders.filter((o) => o.customerId === user.id);
}

/**
 * Sanitize an order for customer view — strip internal data.
 */
export function sanitizeOrderForCustomer(order: CustomerOrder): CustomerOrder {
  return {
    ...order,
    // Strip supplier info from items
    items: order.items.map((item) => ({
      ...item,
      supplierId: "sup_pettravel" // mask real supplier
    })),
    // Strip fulfillment groups (contains supplier names + internal notes)
    fulfillmentGroups: order.fulfillmentGroups.map((fg) => ({
      ...fg,
      supplierId: "sup_pettravel",
      supplierName: "Pet Travel Việt Nam",
      internalNote: ""
    })),
    // Strip internal comments
    comments: order.comments.filter((c) => c.audience === "customer_visible")
  };
}

/**
 * Sanitize products for customer/guest view — strip supplierId from variants.
 * Guest: no price, no stock. Customer: price + stock visible.
 */
export function sanitizeProductsForRole(
  allProducts: Product[],
  role: "guest" | "customer" | "admin"
): unknown[] {
  return allProducts.map((p) => {
    if (role === "guest") {
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        category: p.category,
        brand: p.brand,
        imageUrl: p.imageUrl,
        tags: p.tags,
        variants: [] // no variant details for guests
      };
    }
    if (role === "customer") {
      return {
        ...p,
        variants: p.variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          label: v.label,
          wholesalePrice: v.wholesalePrice,
          minOrderQty: v.minOrderQty,
          stock: v.stock
          // supplierId stripped
        }))
      };
    }
    // Admin: full data
    return p;
  });
}

export function updateDemoOrder(updatedOrder: CustomerOrder) {
  demoOrders = demoOrders.map(o => o.id === updatedOrder.id ? updatedOrder : o);
}

export function addDemoOrder(newOrder: CustomerOrder) {
  demoOrders.push(newOrder);
}

export function updateDemoSuppliers(newSuppliers: Supplier[]) {
  suppliers = newSuppliers;
}

export function updateDemoCategories(newCategories: string[]) {
  categories = newCategories;
}

export function updateDemoProducts(newProducts: Product[]) {
  products = newProducts;
}
