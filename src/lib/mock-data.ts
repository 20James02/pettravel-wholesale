import type {
  AdminPolicy,
  CustomerOrder,
  PermissionKey,
  Product,
  RoleKey,
  Supplier,
  UserAccount
} from "@/lib/domain";

export const suppliers: Supplier[] = [
  { id: "sup_pettravel", code: "PT", name: "Pet Travel", leadTimeDays: 1, adminOnly: false },
  { id: "sup_pawcare", code: "PC", name: "PawCare Vietnam", leadTimeDays: 3, adminOnly: true },
  { id: "sup_meowline", code: "ML", name: "MeowLine Supply", leadTimeDays: 2, adminOnly: true }
];

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
    id: "u_customer",
    name: "Nguyen Minh",
    company: "Happy Paws Retail",
    email: "minh@happypaws.vn",
    role: "customer_owner",
    isAdmin: false
  }
];

export const rolePermissions: Record<RoleKey, PermissionKey[]> = {
  super_admin: [
    "catalog.read",
    "catalog.write",
    "supplier.read",
    "supplier.write",
    "order.read",
    "order.quote",
    "order.adjust",
    "order.confirm_payment",
    "order.ship",
    "order.comment_internal",
    "rbac.write"
  ],
  admin_manager: [
    "catalog.read",
    "catalog.write",
    "supplier.read",
    "supplier.write",
    "order.read",
    "order.quote",
    "order.adjust",
    "order.confirm_payment",
    "order.ship",
    "order.comment_internal"
  ],
  order_operator: [
    "catalog.read",
    "supplier.read",
    "order.read",
    "order.quote",
    "order.adjust",
    "order.ship",
    "order.comment_internal"
  ],
  accountant: ["order.read", "order.confirm_payment", "order.comment_internal"],
  warehouse: ["catalog.read", "supplier.read", "order.read", "order.ship", "order.comment_internal"],
  customer_owner: ["catalog.read", "order.read"],
  customer_staff: ["catalog.read", "order.read"]
};

export const adminPolicy: AdminPolicy = {
  freeShippingThreshold: 5000000,
  defaultDepositRate: 0.3,
  maxOperatorDiscountRate: 0.08,
  requireManagerApprovalAbove: 500000
};

export const products: Product[] = [
  {
    id: "p_1",
    code: "PT-BAG-001",
    name: "Tui van chuyen thu cung AirGo",
    brand: "Pet Travel",
    category: "Tui van chuyen",
    imageUrl: "/product-bag.svg",
    tags: ["hang ban chay", "may bay", "cho meo"],
    variants: [
      {
        id: "v_1",
        sku: "PT-BAG-001-S-GR",
        label: "Size S, xam graphite",
        wholesalePrice: 185000,
        minOrderQty: 6,
        stock: 84,
        supplierId: "sup_pettravel"
      },
      {
        id: "v_2",
        sku: "PT-BAG-001-M-BK",
        label: "Size M, den carbon",
        wholesalePrice: 235000,
        minOrderQty: 6,
        stock: 52,
        supplierId: "sup_pawcare"
      }
    ]
  },
  {
    id: "p_2",
    code: "PT-BOWL-019",
    name: "Bo bat gap du lich StayHydro",
    brand: "Pet Travel",
    category: "An uong du lich",
    imageUrl: "/product-bowl.svg",
    tags: ["silicone", "du lich", "combo"],
    variants: [
      {
        id: "v_3",
        sku: "PT-BOWL-019-2PK",
        label: "Combo 2 bat, xanh teal",
        wholesalePrice: 72000,
        minOrderQty: 12,
        stock: 180,
        supplierId: "sup_pettravel"
      },
      {
        id: "v_4",
        sku: "PT-BOWL-019-4PK",
        label: "Combo 4 bat, mix mau",
        wholesalePrice: 138000,
        minOrderQty: 8,
        stock: 94,
        supplierId: "sup_meowline"
      }
    ]
  },
  {
    id: "p_3",
    code: "PT-WIPES-042",
    name: "Khan uot ve sinh chan sau di choi",
    brand: "CleanPaw",
    category: "Ve sinh",
    imageUrl: "/product-wipes.svg",
    tags: ["tieu hao", "de ban lai", "cao cap"],
    variants: [
      {
        id: "v_5",
        sku: "PT-WIPES-042-80",
        label: "Goi 80 mieng, mui nhe",
        wholesalePrice: 46000,
        minOrderQty: 24,
        stock: 320,
        supplierId: "sup_pettravel"
      },
      {
        id: "v_6",
        sku: "PT-WIPES-042-120",
        label: "Goi 120 mieng, khong mui",
        wholesalePrice: 62000,
        minOrderQty: 24,
        stock: 190,
        supplierId: "sup_pawcare"
      }
    ]
  }
];

export const demoOrder: CustomerOrder = {
  id: "ord_1001",
  number: "PTW-260808-001",
  customerName: "Nguyen Minh",
  customerCompany: "Happy Paws Retail",
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
      productName: "Tui van chuyen thu cung AirGo",
      variantSku: "PT-BAG-001-M-BK",
      variantLabel: "Size M, den carbon",
      quantity: 12,
      unitPriceSnapshot: 235000,
      supplierId: "sup_pawcare"
    },
    {
      id: "oi_2",
      productCode: "PT-BOWL-019",
      productName: "Bo bat gap du lich StayHydro",
      variantSku: "PT-BOWL-019-2PK",
      variantLabel: "Combo 2 bat, xanh teal",
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
        {
          id: "adj_1",
          type: "discount",
          label: "Chiet khau khach dai ly dot 1",
          amount: -320000,
          requiresApproval: false
        },
        {
          id: "adj_2",
          type: "shipping_fee",
          label: "Phi ship tam tinh",
          amount: 90000,
          requiresApproval: false
        }
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
      reference: "PTW-PTW-260808-001-Q2-DEP-092500",
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
      internalNote: "Dang xac nhan mau den carbon, can phan hoi truoc 15:00."
    },
    {
      id: "fg_2",
      supplierId: "sup_pettravel",
      supplierName: "Pet Travel",
      status: "supplier_confirmed",
      itemIds: ["oi_2"],
      internalNote: "Co san tai kho chinh, co the dong goi ngay khi xac nhan coc."
    }
  ],
  comments: [
    {
      id: "c_1",
      author: "Admin Pet Travel",
      audience: "customer_visible",
      message: "Don da duoc duyet bao gia v2. Anh/chi kiem tra tien coc va tai anh chuyen khoan len don.",
      createdAt: "2026-08-08T09:25:00+07:00"
    },
    {
      id: "c_2",
      author: "Order Ops",
      audience: "internal",
      message: "Khach yeu cau xuat hoa don. Kiem tra MST truoc khi giao.",
      createdAt: "2026-08-08T09:27:00+07:00"
    }
  ]
};
