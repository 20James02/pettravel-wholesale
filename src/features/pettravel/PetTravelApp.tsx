"use client";

import Image from "next/image";
import {
  AlertTriangle,
  Bell,
  Boxes,
  Building2,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  FileText,
  LockKeyhole,
  MessageSquare,
  MessageCircle,
  PackageCheck,
  Percent,
  QrCode,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  SplitSquareVertical,
  Truck,
  Upload,
  UserRound,
  Users,
  WalletCards,
  ShoppingCart,
  ChevronRight,
  LogOut,
  Sparkles,
  Heart,
  Check,
  Clock
} from "lucide-react";
import { type ComponentType, type ReactNode, useMemo, useState, useEffect } from "react";
import Lenis from "lenis";
import type {
  AdminPolicy,
  CustomerOrder,
  PaymentIntent,
  PermissionKey,
  Product,
  RoleKey,
  Supplier,
  UserAccount,
  ProductVariant,
  PaymentProof,
  PaymentRequest
} from "@/lib/domain";
import { formatVnd, percent } from "@/lib/money";

type AppMode = "guest" | "customer" | "admin";
type TabKey = "catalog" | "cart" | "order" | "admin" | "admin_products" | "admin_reconciliation" | "admin_invoices" | "settings";

interface PetTravelAppProps {
  users: UserAccount[];
  products: Product[];
  suppliers: Supplier[];
  order: CustomerOrder;
  rolePermissions: Record<RoleKey, PermissionKey[]>;
  adminPolicy: AdminPolicy;
}

const paymentIntentLabels: Record<PaymentIntent, string> = {
  deposit_cod: "Đặt cọc trước 30% + Thanh toán phần còn lại khi nhận hàng (COD)",
  pay_full: "Thanh toán toàn bộ 100% sau khi giá được duyệt"
};

function StatusPill({
  tone = "success",
  children
}: {
  tone?: "success" | "warning" | "info";
  children: ReactNode;
}) {
  const className = tone === "success" ? "status-pill success" : tone === "warning" ? "status-pill warning" : "status-pill info";
  return <span className={className}>{children}</span>;
}

function latestQuote(order: CustomerOrder) {
  return order.quoteVersions[order.quoteVersions.length - 1];
}

export function PetTravelApp({
  users,
  products,
  suppliers,
  order,
  rolePermissions,
  adminPolicy
}: PetTravelAppProps) {
  const [mode, setMode] = useState<AppMode>("guest");
  const [activeTab, setActiveTab] = useState<TabKey>("catalog");
  const [workingOrder, setWorkingOrder] = useState<CustomerOrder>(order);

  // Shop state
  const [categoryFilter, setCategoryFilter] = useState<string>("Tất cả");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Popup Modal states
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariantSku, setSelectedVariantSku] = useState<string>("");
  const [modalQty, setModalQty] = useState<number>(1);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState<number>(0);

  // Chat Popup states
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [chatInput, setChatInput] = useState<string>("");
  const [isInternalComment, setIsInternalComment] = useState<boolean>(false);

  // Product Management states
  const [allProducts, setAllProducts] = useState<Product[]>(products);
  const [showProductForm, setShowProductForm] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formName, setFormName] = useState<string>("");
  const [formCode, setFormCode] = useState<string>("");
  const [formCategory, setFormCategory] = useState<string>("Thức ăn");
  const [formImage, setFormImage] = useState<string>("/product-food.svg");
  const [formTags, setFormTags] = useState<string>("");
  const [formVariants, setFormVariants] = useState<ProductVariant[]>([]);
  
  // Cart state - syncs with initial workingOrder items
  const [cartItems, setCartItems] = useState(
    workingOrder.items.map(item => ({
      id: item.id,
      productCode: item.productCode,
      productName: item.productName,
      variantSku: item.variantSku,
      variantLabel: item.variantLabel,
      quantity: item.quantity,
      unitPriceSnapshot: item.unitPriceSnapshot,
      supplierId: item.supplierId
    }))
  );

  // Admin adjustments state
  const [adminDiscount, setAdminDiscount] = useState<number>(320000); // initial mock discount
  const [adminShippingFee, setAdminShippingFee] = useState<number>(90000); // initial mock shipping
  const [shippingFeeOption, setShippingFeeOption] = useState<"included" | "separate_cod">("included");
  const [customDepositInput, setCustomDepositInput] = useState<string>("");
  const [isQuoteAccepted, setIsQuoteAccepted] = useState<boolean>(true); // default accepted for initial mock
  const [isManagerApproved, setIsManagerApproved] = useState<boolean>(false);

  // Setup Lenis scroll
  useEffect(() => {
    const lenis = new Lenis();
    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
    return () => {
      lenis.destroy();
    };
  }, []);

  const activeUser = mode === "admin" ? users.find((user) => user.isAdmin) : users.find((user) => !user.isAdmin);
  const isLoggedIn = mode !== "guest";
  const isAdmin = mode === "admin";
  const quote = latestQuote(workingOrder);

  // Computed values
  const requiresManagerApproval = (adminDiscount / (quote.subtotal || 1) > adminPolicy.maxOperatorDiscountRate) || (adminDiscount > adminPolicy.requireManagerApprovalAbove);
  const isOrderFrozen = workingOrder.paymentStatus.includes("uploaded") || workingOrder.paymentStatus.includes("confirmed") || workingOrder.paymentStatus === "paid";

  const supplierById = useMemo(
    () => Object.fromEntries(suppliers.map((supplier) => [supplier.id, supplier])),
    [suppliers]
  );

  function visibleSupplierName(supplierId: string) {
    if (isAdmin) return supplierById[supplierId]?.name ?? "Nhà cung cấp đối tác";
    return "Pet Travel Việt Nam";
  }

  function addComment(audience: "customer_visible" | "internal", message: string) {
    setWorkingOrder((current) => ({
      ...current,
      comments: [
        {
          id: `c_${Date.now()}`,
          author: isAdmin ? "Ban Quản trị Pet Travel" : current.customerName,
          audience,
          message,
          createdAt: new Date().toISOString()
        },
        ...current.comments
      ],
      updatedAt: new Date().toISOString()
    }));
  }

  // 1. Customer proposes payment intent
  function changePaymentIntent(intent: PaymentIntent) {
    setWorkingOrder((current) => ({
      ...current,
      paymentIntent: intent,
      paymentStatus: "unrequested",
      paymentRequests: [],
      updatedAt: new Date().toISOString()
    }));
    setIsQuoteAccepted(false);
    addComment(
      "customer_visible",
      intent === "deposit_cod"
        ? `Đại lý đề xuất phương án thanh toán: Đặt cọc ${percent(adminPolicy.defaultDepositRate)} trước + Nhận hàng trả nốt (COD). Bản báo giá cũ hết hiệu lực, chờ nhân viên thẩm định lại.`
        : "Đại lý đề xuất phương án thanh toán: Thanh toán trước 100%. Bản báo giá cũ hết hiệu lực, chờ nhân viên thẩm định lại."
    );
  }

  // 2. Admin publishes a new Quote Version
  function publishNewQuote() {
    setWorkingOrder((current) => {
      const nextVersion = current.quoteVersions.length + 1;
      const subtotal = current.items.reduce((sum, item) => sum + item.quantity * item.unitPriceSnapshot, 0);

      const adjustments = [];
      if (adminDiscount > 0) {
        adjustments.push({
          id: `adj_disc_${Date.now()}`,
          type: "discount" as const,
          label: "Chiết khấu đặc biệt cho Đại lý sỉ",
          amount: -adminDiscount,
          requiresApproval: false
        });
      }
      if (shippingFeeOption === "included" && adminShippingFee > 0) {
        adjustments.push({
          id: `adj_ship_${Date.now()}`,
          type: "shipping_fee" as const,
          label: "Chi phí vận chuyển tạm tính",
          amount: adminShippingFee,
          requiresApproval: false
        });
      }

      const totalAdjustments = adjustments.reduce((sum, adj) => sum + adj.amount, 0);
      const finalTotal = subtotal + totalAdjustments;

      const isDeposit = current.paymentIntent === "deposit_cod";
      const depositRate = isDeposit ? adminPolicy.defaultDepositRate : 1.0;
      const depositAmount = isDeposit ? Math.round(finalTotal * depositRate) : finalTotal;
      const codRemaining = isDeposit ? finalTotal - depositAmount : 0;

      const newQuote = {
        id: `q_${nextVersion}_${Date.now()}`,
        version: nextVersion,
        status: "published" as const,
        subtotal,
        adjustments,
        finalTotal,
        depositAmount,
        codRemaining,
        shippingFeeOption,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };

      const updatedRequests = current.paymentRequests.map((req) =>
        req.status === "active" ? { ...req, status: "superseded" as const } : req
      );

      return {
        ...current,
        commercialStatus: "quoted",
        paymentStatus: "unrequested",
        quoteVersions: [...current.quoteVersions.map(q => ({ ...q, status: "superseded" as const })), newQuote],
        paymentRequests: updatedRequests,
        updatedAt: new Date().toISOString()
      };
    });

    setIsQuoteAccepted(false);
    addComment("customer_visible", `Ban vận hành đã phát hành Bản báo giá chính thức mới (lần ${workingOrder.quoteVersions.length + 1}). Vui lòng kiểm tra và bấm Chấp thuận.`);
  }

  // 3. Customer accepts the quote version
  function acceptQuote() {
    setIsQuoteAccepted(true);
    setWorkingOrder((current) => {
      const updatedQuoteVersions = current.quoteVersions.map((q, idx) =>
        idx === current.quoteVersions.length - 1 ? { ...q, status: "accepted" as const } : q
      );
      return {
        ...current,
        quoteVersions: updatedQuoteVersions,
        updatedAt: new Date().toISOString()
      };
    });
    addComment("customer_visible", `Đại lý đã đồng ý với Bản báo giá lần ${quote.version}. Chờ nhân viên vận hành tạo mã QR thanh toán.`);
  }

  // 4. Admin issues a Payment Request (Generates a static QR)
  function issuePaymentRequest() {
    setWorkingOrder((current) => {
      const activeQuote = current.quoteVersions[current.quoteVersions.length - 1];
      const isDeposit = current.paymentIntent === "deposit_cod";

      const reqAmount = isDeposit
        ? (customDepositInput ? parseInt(customDepositInput, 10) : activeQuote.depositAmount)
        : activeQuote.finalTotal;

      const timeSuffix = new Date().toISOString().replace(/[^0-9]/g, "").slice(8, 14);
      const reference = `PTW-${current.number}-Q${activeQuote.version}-${isDeposit ? "DEP" : "FULL"}-${timeSuffix}`.toUpperCase();

      const newRequest = {
        id: `pay_req_${Date.now()}`,
        quoteVersion: activeQuote.version,
        amount: reqAmount,
        purpose: (isDeposit ? "deposit" : "full") as "deposit" | "full",
        reference,
        qrPayload: `PETTRAVEL_WHOLESALE_PAYMENT|account=190356782390|name=PET TRAVEL WHOLESALE|amount=${reqAmount}|reference=${reference}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        status: "active" as const
      };

      const updatedRequests = current.paymentRequests.map((req) =>
        req.status === "active" ? { ...req, status: "superseded" as const } : req
      );

      if (isDeposit && customDepositInput) {
        const customVal = parseInt(customDepositInput, 10);
        const lastIdx = current.quoteVersions.length - 1;
        current.quoteVersions[lastIdx].depositAmount = customVal;
        current.quoteVersions[lastIdx].codRemaining = activeQuote.finalTotal - customVal;
      }

      return {
        ...current,
        paymentStatus: isDeposit ? "deposit_requested" : "full_requested",
        paymentRequests: [...updatedRequests, newRequest],
        updatedAt: new Date().toISOString()
      };
    });

    addComment("customer_visible", `Mã chuyển khoản QR tĩnh cho yêu cầu thanh toán ${workingOrder.paymentIntent === "deposit_cod" ? "Đặt cọc trước" : "Toàn bộ đơn hàng"} đã được tạo thành công.`);
  }

  // 5. Customer uploads proof of payment
  function simulateProofUpload() {
    setWorkingOrder((current) => {
      const activeRequest = current.paymentRequests[current.paymentRequests.length - 1];
      if (!activeRequest || activeRequest.status !== "active") return current;

      const updatedRequests = current.paymentRequests.map((req, idx) =>
        idx === current.paymentRequests.length - 1 ? { ...req, status: "uploaded" as const } : req
      );

      return {
        ...current,
        paymentStatus: current.paymentIntent === "deposit_cod" ? "deposit_uploaded" : "full_uploaded",
        paymentRequests: updatedRequests,
        paymentProofs: [
          {
            id: `proof_${Date.now()}`,
            paymentRequestId: activeRequest.id,
            fileName: "bien-lai-chuyen-tien-thanh-cong.jpg",
            uploadedAt: new Date().toISOString(),
            status: "pending_admin_confirmation" as const
          },
          ...current.paymentProofs
        ],
        updatedAt: new Date().toISOString()
      };
    });
    addComment("customer_visible", "Đại lý đã tải lên hình ảnh biên lai thành công. Đơn hàng hiện đã bị đóng băng chỉnh sửa để kế toán đối soát thực tế.");
  }

  // 6. Accountant confirms payment (Locks order and payments)
  function confirmDeposit() {
    setWorkingOrder((current) => {
      const updatedRequests = current.paymentRequests.map((req, idx) =>
        idx === current.paymentRequests.length - 1 ? { ...req, status: "confirmed" as const } : req
      );
      const updatedProofs = current.paymentProofs.map((proof, idx) =>
        idx === 0 ? { ...proof, status: "accepted" as const } : proof
      );

      const isDeposit = current.paymentIntent === "deposit_cod";

      return {
        ...current,
        commercialStatus: "locked" as const,
        paymentStatus: isDeposit ? "deposit_confirmed" : "paid",
        fulfillmentStatus: "packing" as const,
        paymentRequests: updatedRequests,
        paymentProofs: updatedProofs,
        updatedAt: new Date().toISOString()
      };
    });
    addComment("customer_visible", "Bộ phận kế toán xác nhận tiền đã vào tài khoản ngân hàng. Đơn hàng đã được khóa giao dịch thành công và chuyển cho kho đóng hàng.");
  }

  // 7. Gán mã vận đơn
  function attachShipment() {
    setWorkingOrder((current) => ({
      ...current,
      fulfillmentStatus: "shipped",
      shipment: {
        carrier: "Giao Hàng Nhanh (GHN)",
        trackingCode: "GHN982601448",
        shippingFee: 90000,
        eta: "2026-08-10",
        note: "Giao giờ hành chính, thu hộ phần còn lại COD nếu có."
      },
      updatedAt: new Date().toISOString()
    }));
    addComment("customer_visible", "Đơn hàng đã được bàn giao cho đối tác vận chuyển GHN. Mã vận đơn: GHN982601448.");
  }

  // Shopping Cart handlers
  function addToCart(variantSku: string, productCode: string, productName: string, variantLabel: string, price: number, supplierId: string) {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.variantSku === variantSku);
      if (existing) {
        return prev.map((item) =>
          item.variantSku === variantSku ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          id: `item_${Date.now()}`,
          productCode,
          productName,
          variantSku,
          variantLabel,
          quantity: 1,
          unitPriceSnapshot: price,
          supplierId
        }
      ];
    });
  }

  function updateCartQty(sku: string, delta: number) {
    setCartItems((prev) =>
      prev
        .map((item) =>
          item.variantSku === sku ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function submitCartProposal() {
    setWorkingOrder((prev) => {
      const subtotal = cartItems.reduce((sum, item) => sum + item.quantity * item.unitPriceSnapshot, 0);
      const isDeposit = prev.paymentIntent === "deposit_cod";
      const initialDeposit = isDeposit ? Math.round(subtotal * adminPolicy.defaultDepositRate) : subtotal;

      const initialQuote = {
        id: `q_1_${Date.now()}`,
        version: 1,
        status: "published" as const,
        subtotal,
        adjustments: [],
        finalTotal: subtotal,
        depositAmount: initialDeposit,
        codRemaining: isDeposit ? subtotal - initialDeposit : 0,
        shippingFeeOption: "included" as const,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };

      return {
        ...prev,
        commercialStatus: "submitted",
        paymentStatus: "unrequested",
        items: cartItems.map(item => ({ ...item })),
        quoteVersions: [initialQuote],
        paymentRequests: [],
        paymentProofs: [],
        updatedAt: new Date().toISOString()
      };
    });
    setIsQuoteAccepted(false);
    setActiveTab("order");
    addComment("customer_visible", "Đại lý vừa gửi danh sách đề xuất đơn hàng sỉ mới. Vui lòng chờ nhân viên kiểm kho và thẩm định báo giá.");
  }

  const customerVisibleComments = workingOrder.comments.filter((comment) => {
    return isAdmin || comment.audience === "customer_visible";
  });

  const filteredProducts = useMemo(() => {
    return allProducts.filter((p) => {
      const matchCat = categoryFilter === "Tất cả" || p.category === categoryFilter;
      const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.code.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [allProducts, categoryFilter, searchQuery]);

  // --- 1. LOGIN/PORTAL SELECTOR VIEW ---
  if (mode === "guest") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-[#FFFDFB] to-[#FFF7ED]">
        <div className="panel max-w-xl w-full text-center flex flex-col gap-6 p-8 relative overflow-hidden">
          <div className="absolute top-4 right-4 text-orange-400 opacity-20">
            <Sparkles size={80} />
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <div className="brand-logo text-5xl floating-mascot">🐾</div>
            <h1 className="text-3xl font-extrabold text-[#331B08] mt-2">Pet Travel WholeSale</h1>
            <p className="muted text-sm max-w-md mx-auto">
              Hệ thống quản lý báo giá sỉ thiết kế thông minh, đối soát an toàn bảo mật dành riêng cho đại lý và vận hành.
            </p>
          </div>

          <div className="border-t border-dashed border-orange-100 my-2"></div>

          <div className="flex flex-col gap-4">
            <h2 className="text-xs font-bold text-orange-950/80 uppercase tracking-widest">Chọn cổng làm việc để bắt đầu</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                className="panel p-6 border-2 border-orange-200 bg-white hover:border-orange-500 hover:-translate-y-1 transition text-left flex flex-col gap-3 group relative cursor-pointer"
                onClick={() => {
                  setMode("customer");
                  setActiveTab("catalog");
                }}
              >
                <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center text-2xl group-hover:scale-110 transition">🛒</div>
                <div>
                  <h3 className="m-0 text-md font-bold text-[#331B08]">Đại lý lấy sỉ</h3>
                  <p className="muted m-0 text-xs mt-1">Lên đơn đề xuất, tải chứng từ cọc, theo dõi hành trình.</p>
                </div>
                <ChevronRight size={18} className="absolute bottom-4 right-4 text-orange-300 group-hover:translate-x-1 transition" />
              </button>

              <button
                type="button"
                className="panel p-6 border-2 border-orange-200 bg-white hover:border-orange-500 hover:-translate-y-1 transition text-left flex flex-col gap-3 group relative cursor-pointer"
                onClick={() => {
                  setMode("admin");
                  setActiveTab("admin");
                }}
              >
                <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center text-2xl group-hover:scale-110 transition">⚙️</div>
                <div>
                  <h3 className="m-0 text-md font-bold text-[#331B08]">Nhân viên Vận hành</h3>
                  <p className="muted m-0 text-xs mt-1">Thẩm định giá sỉ, quản lý kho, phát hành VietQR và đối soát.</p>
                </div>
                <ChevronRight size={18} className="absolute bottom-4 right-4 text-orange-300 group-hover:translate-x-1 transition" />
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // --- 2. MAIN APPLICATION SHELL ---
  return (
    <main className="app-shell">
      {/* SIDEBAR NAVIGATION */}
      <aside className="sidebar">
        <div className="flex items-center gap-3">
          <div className="brand-mark">🐾</div>
          <div>
            <h1 className="text-lg font-bold leading-none">Pet Travel</h1>
            <p className="muted text-xs font-semibold mt-1">Cổng Bán Sỉ Đối Tác</p>
          </div>
        </div>

        {/* LOGGED IN ACCOUNT CARD */}
        <div className="panel p-4 bg-[#FFFDF9] border border-orange-100 rounded-2xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-sm">
              {activeUser?.name.charAt(0)}
            </div>
            <div>
              <p className="m-0 text-sm font-bold text-[#331B08]">{activeUser?.name}</p>
              <p className="muted m-0 text-xs">{activeUser?.company} · {activeUser?.role}</p>
            </div>
          </div>
          <button
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-red-50 text-red-500 hover:text-red-600 transition"
            title="Đăng xuất"
            type="button"
            onClick={() => setMode("guest")}
          >
            <LogOut size={16} />
          </button>
        </div>

        {/* NAVIGATION TABS */}
        <nav className="tabs flex flex-col gap-2 mt-2" aria-label="Điều hướng">
          {mode === "customer" ? (
            <>
              <button
                className="tab-button w-full justify-start"
                type="button"
                data-active={activeTab === "catalog"}
                onClick={() => setActiveTab("catalog")}
              >
                <Boxes size={18} />
                Cửa hàng bán sỉ
              </button>
              <button
                className="tab-button w-full justify-start"
                type="button"
                data-active={activeTab === "cart"}
                onClick={() => setActiveTab("cart")}
              >
                <ShoppingCart size={18} />
                Giỏ hàng của tôi
                {cartItems.length > 0 && (
                  <span className="ml-auto bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                    {cartItems.reduce((acc, curr) => acc + curr.quantity, 0)}
                  </span>
                )}
              </button>
              <button
                className="tab-button w-full justify-start"
                type="button"
                data-active={activeTab === "order"}
                onClick={() => setActiveTab("order")}
              >
                <MessageSquare size={18} />
                Trực phòng đơn hàng
              </button>
            </>
          ) : (
            <>
              <button
                className="tab-button w-full justify-start"
                type="button"
                data-active={activeTab === "admin"}
                onClick={() => setActiveTab("admin")}
              >
                <SplitSquareVertical size={18} />
                Quản lý đơn hàng
              </button>
              <button
                className="tab-button w-full justify-start"
                type="button"
                data-active={activeTab === "admin_products"}
                onClick={() => setActiveTab("admin_products")}
              >
                <Boxes size={18} />
                Quản lý sản phẩm
              </button>
              <button
                className="tab-button w-full justify-start"
                type="button"
                data-active={activeTab === "admin_reconciliation"}
                onClick={() => setActiveTab("admin_reconciliation")}
              >
                <WalletCards size={18} />
                Đối soát & Sao kê
              </button>
              <button
                className="tab-button w-full justify-start"
                type="button"
                data-active={activeTab === "admin_invoices"}
                onClick={() => setActiveTab("admin_invoices")}
              >
                <ReceiptText size={18} />
                Hóa đơn đỏ (VAT)
              </button>
              <button
                className="tab-button w-full justify-start"
                type="button"
                data-active={activeTab === "catalog"}
                onClick={() => setActiveTab("catalog")}
              >
                <Search size={18} />
                Xem trước Cửa hàng
              </button>
              <button
                className="tab-button w-full justify-start"
                type="button"
                data-active={activeTab === "settings"}
                onClick={() => setActiveTab("settings")}
              >
                <Settings size={18} />
                Cấu hình & Đối tác
              </button>
            </>
          )}
        </nav>

        {/* CUTE DECORATION CARD */}
        <div className="mt-auto panel p-4 bg-orange-50 border border-orange-100 rounded-2xl flex flex-col gap-2 relative">
          <div className="text-orange-400 floating-mascot w-6 h-6 absolute -top-3 -right-2">🐾</div>
          <strong className="text-xs text-orange-95 font-bold flex items-center gap-1">
            <Sparkles size={14} className="text-amber-500 fill-amber-500" /> Hệ thống Vận hành Cát
          </strong>
          <p className="text-[11px] text-orange-950/70 m-0 leading-relaxed">
            Mã QR tĩnh bảo mật, tự động cập nhật và phân loại nhà cung ứng theo thời gian thực.
          </p>
        </div>
      </aside>

      {/* MAIN SCREEN AREA */}
      <section className="main-area">
        <header className="topbar">
          <div>
            <p className="muted m-0 text-xs font-bold uppercase tracking-wider">Cửa hàng sỉ Pet Travel / {isAdmin ? "Cổng quản trị" : "Cổng Đại lý"}</p>
            <h2 className="text-2xl font-bold text-[#331B08] mt-1">Xin chào đối tác sỉ đáng yêu! 👋</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <input
                type="text"
                className="text-input pl-10 text-sm max-w-[240px] pr-4 py-2"
                placeholder="Tìm sản phẩm, SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search className="absolute left-3 top-3 text-orange-400" size={16} />
            </div>
            <button className="icon-button" aria-label="Thông báo" type="button">
              <Bell size={18} />
            </button>
          </div>
        </header>

        {/* SUMMARY METRICS */}
        <div className="metrics-grid">
          <div className="metric">
            <span className="muted text-sm flex items-center gap-1 font-semibold"><Heart size={14} className="text-orange-500 fill-orange-500" /> Tổng tiền hàng sỉ</span>
            <strong>{formatVnd(quote.finalTotal)}</strong>
          </div>
          <div className="metric">
            <span className="muted text-sm flex items-center gap-1 font-semibold"><WalletCards size={14} className="text-blue-500" /> Khoản cọc tạm tính</span>
            <strong>{formatVnd(quote.depositAmount)}</strong>
          </div>
        </div>

        {/* --- A. PRODUCT CATALOG TAB --- */}
        {activeTab === "catalog" && (
          <div className="flex flex-col gap-6">
            {/* Category filter tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {["Tất cả", "Thức ăn", "Đồ chơi", "Vệ sinh"].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`tab-button min-h-[38px] ${categoryFilter === cat ? 'bg-orange-500 text-white border-orange-600' : ''}`}
                  onClick={() => setCategoryFilter(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            <section className="catalog-grid">
              {filteredProducts.map((product) => {
                const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
                return (
                  <article 
                    className="product-card cursor-pointer" 
                    key={product.id}
                    onClick={() => {
                      setSelectedProduct(product);
                      setSelectedVariantSku(product.variants[0]?.sku || "");
                      setModalQty(product.variants[0]?.minOrderQty || 1);
                      setActiveGalleryIndex(0);
                    }}
                  >
                    <div className="relative aspect-square w-full bg-[#FFFBEB] border-b-2 border-orange-100">
                      <Image src={product.imageUrl} alt={product.name} fill className="object-cover" />
                      <span className="absolute top-3 left-3 bg-[#FFFDF9] border border-orange-100 text-xs px-2.5 py-1 rounded-full font-bold text-orange-950 shadow-sm z-10">
                        {product.category}
                      </span>
                    </div>

                    {!isLoggedIn ? (
                      <div className="product-body text-center p-4">
                        <h3 className="m-0 text-md font-bold text-[#331B08]">{product.name}</h3>
                        <span className="text-[11px] text-orange-600 font-bold block mt-2 hover:underline">🐾 Đăng nhập xem giá sỉ & đặt hàng</span>
                      </div>
                    ) : (
                      <div className="product-body p-4 flex flex-col gap-2">
                        <div>
                          <p className="muted m-0 text-xs font-mono font-bold">{product.code}</p>
                          <h3 className="m-0 text-md font-bold text-[#331B08] mt-0.5">{product.name}</h3>
                        </div>
                        <div className="flex items-center justify-between mt-1 border-t border-dashed border-orange-100 pt-2">
                          <span className="tag text-xs">{product.category}</span>
                          <span className="text-xs text-orange-950 font-bold bg-[#FFEEDD] border border-orange-100 rounded-full px-2.5 py-0.5">
                            Còn lại: {totalStock} cái
                          </span>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          </div>
        )}

        {/* --- B. SHOPPING CART TAB (CUSTOMER ONLY) --- */}
        {activeTab === "cart" && mode === "customer" && (
          <section className="grid-dashboard">
            <div className="panel flex flex-col gap-4">
              <div className="section-title">
                <h3 className="text-lg font-bold">🛒 Danh sách hàng sỉ đề xuất</h3>
                <span className="bg-orange-100 text-orange-700 text-xs px-2.5 py-0.5 rounded-full font-bold">
                  {cartItems.reduce((acc, curr) => acc + curr.quantity, 0)} sản phẩm
                </span>
              </div>

              {cartItems.length === 0 ? (
                <div className="text-center py-8 muted text-sm font-semibold">
                  Giỏ hàng sỉ đang trống. Vui lòng quay lại Cửa hàng để thêm sản phẩm sỉ.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1">
                    {cartItems.map((item) => (
                      <div className="p-3 border-2 border-orange-100 rounded-2xl bg-white flex items-center justify-between gap-4" key={item.id}>
                        <div>
                          <strong className="text-sm text-[#331B08] block">{item.productName}</strong>
                          <span className="text-xs muted font-semibold">{item.variantLabel} ({item.variantSku})</span>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1.5 border border-orange-200 rounded-xl p-1 bg-orange-50/25">
                            <button
                              type="button"
                              className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-xs font-bold text-[#78350F] shadow-sm active:scale-90"
                              onClick={() => updateCartQty(item.variantSku, -1)}
                            >
                              -
                            </button>
                            <span className="text-xs font-bold text-[#331B08] min-w-[20px] text-center">{item.quantity}</span>
                            <button
                              type="button"
                              className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-xs font-bold text-[#78350F] shadow-sm active:scale-90"
                              onClick={() => updateCartQty(item.variantSku, 1)}
                            >
                              +
                            </button>
                          </div>
                          
                          <div className="text-right min-w-[100px]">
                            <strong className="text-xs text-[#331B08] block">{formatVnd(item.quantity * item.unitPriceSnapshot)}</strong>
                            <span className="text-[10px] muted font-semibold">{formatVnd(item.unitPriceSnapshot)}/cái</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-dashed border-orange-100 pt-3 flex justify-between items-center">
                    <span className="text-sm font-bold text-[#331B08]">Tổng cộng tạm tính:</span>
                    <strong className="text-lg text-orange-600 font-bold">
                      {formatVnd(cartItems.reduce((sum, item) => sum + item.quantity * item.unitPriceSnapshot, 0))}
                    </strong>
                  </div>
                </div>
              )}
            </div>

            <aside className="flex flex-col gap-4">
              <div className="panel flex flex-col gap-4">
                <div className="section-title">
                  <h3 className="text-lg font-bold">💳 Đề xuất Phương án Thanh toán</h3>
                </div>
                
                <div className="flex flex-col gap-3">
                  <label className="p-3 border-2 border-orange-100 rounded-2xl bg-white flex items-start gap-3 cursor-pointer hover:border-orange-300">
                    <input
                      type="radio"
                      name="payment_intent"
                      className="mt-1 text-orange-500 focus:ring-orange-500"
                      checked={workingOrder.paymentIntent === "deposit_cod"}
                      onChange={() => changePaymentIntent("deposit_cod")}
                    />
                    <div>
                      <strong className="text-xs text-[#331B08] block">Đặt cọc 30% trước</strong>
                      <p className="muted text-[10px] m-0 mt-0.5 leading-relaxed">
                        Thanh toán 30% tiền hàng sau khi chốt giá. 70% còn lại thanh toán COD khi nhận hàng từ đơn vị vận chuyển.
                      </p>
                    </div>
                  </label>

                  <label className="p-3 border-2 border-orange-100 rounded-2xl bg-white flex items-start gap-3 cursor-pointer hover:border-orange-300">
                    <input
                      type="radio"
                      name="payment_intent"
                      className="mt-1 text-orange-500 focus:ring-orange-500"
                      checked={workingOrder.paymentIntent === "pay_full"}
                      onChange={() => changePaymentIntent("pay_full")}
                    />
                    <div>
                      <strong className="text-xs text-[#331B08] block">Thanh toán toàn bộ 100%</strong>
                      <p className="muted text-[10px] m-0 mt-0.5 leading-relaxed">
                        Thanh toán toàn bộ giá trị đơn hàng sau khi chốt báo giá chính thức. Nhận hàng không cần trả thêm phí.
                      </p>
                    </div>
                  </label>

                  <div className="p-3 border border-orange-200 bg-orange-50/20 rounded-xl flex items-start gap-2">
                    <AlertTriangle size={15} className="text-orange-600 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-orange-950 m-0 leading-relaxed font-bold">
                      Mọi sửa đổi về giỏ hàng hoặc phương thức thanh toán đều sẽ sinh ra phiên bản Bản báo giá nháp mới và cần chờ phê duyệt.
                    </p>
                  </div>

                  <button
                    className="primary-button text-xs py-3 w-full justify-center mt-2"
                    type="button"
                    disabled={cartItems.length === 0}
                    onClick={submitCartProposal}
                  >
                    Gửi Đề xuất Đơn hàng sỉ
                  </button>
                </div>
              </div>
            </aside>
          </section>
        )}

        {/* --- C. ORDER TRACKING ROOM TAB --- */}
        {activeTab === "order" && (
          <section className="grid-dashboard">
            <div className="flex flex-col gap-4">
              {/* Timeline đơn hàng */}
              <div className="panel flex flex-col gap-4">
                <div className="section-title">
                  <h3 className="text-lg font-bold">🐾 Tiến độ đơn hàng sỉ</h3>
                  <StatusPill tone="info">
                    {workingOrder.commercialStatus === "submitted" ? "Chờ duyệt giá" :
                     workingOrder.commercialStatus === "quoted" ? "Đã báo giá sỉ" :
                     workingOrder.commercialStatus === "customer_accepted" ? "Chờ thanh toán" :
                     workingOrder.commercialStatus === "locked" ? "Đã khóa đóng gói" : "Hoàn tất giao dịch"}
                  </StatusPill>
                </div>

                <div className="flex items-center justify-between px-4 py-2 bg-orange-50/30 rounded-2xl border border-orange-100 overflow-x-auto">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${workingOrder.commercialStatus !== "submitted" ? "bg-orange-500 text-white" : "bg-orange-100 text-orange-700"}`}>1</span>
                    <span className={workingOrder.commercialStatus === "submitted" ? "text-orange-600 font-bold" : "text-gray-500 font-medium"}>Nháp đề xuất</span>
                  </div>
                  <ChevronRight size={14} className="text-orange-300" />
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${workingOrder.commercialStatus !== "submitted" && workingOrder.commercialStatus !== "quoted" ? "bg-orange-500 text-white" : "bg-orange-100 text-orange-700"}`}>2</span>
                    <span className={workingOrder.commercialStatus === "quoted" ? "text-orange-600 font-bold" : "text-gray-500 font-medium"}>Thẩm định & QR</span>
                  </div>
                  <ChevronRight size={14} className="text-orange-300" />
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${workingOrder.paymentStatus.includes("confirmed") || workingOrder.paymentStatus === "paid" ? "bg-orange-500 text-white" : "bg-orange-100 text-orange-700"}`}>3</span>
                    <span className={workingOrder.paymentStatus.includes("uploaded") ? "text-orange-600 font-bold" : "text-gray-500 font-medium"}>Đối soát tiền</span>
                  </div>
                  <ChevronRight size={14} className="text-orange-300" />
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${workingOrder.fulfillmentStatus === "shipped" ? "bg-orange-500 text-white" : "bg-orange-100 text-orange-700"}`}>4</span>
                    <span className={workingOrder.fulfillmentStatus === "packing" || workingOrder.fulfillmentStatus === "shipped" ? "text-orange-600 font-bold" : "text-gray-500 font-medium"}>Đóng hàng & Giao</span>
                  </div>
                </div>
              </div>

              {/* Chi tiết đơn hàng */}
              <div className="panel p-4 flex flex-col gap-3">
                <h3 className="text-sm font-bold text-[#331B08] border-b border-dashed border-orange-100 pb-2">📦 Sản phẩm sỉ trong đơn hàng</h3>
                
                <table className="variant-table w-full">
                  <thead>
                    <tr>
                      <th>Sản phẩm sỉ</th>
                      <th className="text-center">Số lượng</th>
                      <th className="text-right">Đơn giá sỉ</th>
                      <th className="text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workingOrder.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong className="text-xs text-[#331B08]">{item.productName}</strong>
                          <br />
                          <span className="muted text-[10px]">{item.variantLabel} ({item.variantSku})</span>
                        </td>
                        <td className="text-center text-xs font-bold text-[#331B08]">{item.quantity} cái</td>
                        <td className="text-right text-xs text-[#78350F] font-semibold">{formatVnd(item.unitPriceSnapshot)}</td>
                        <td className="text-right text-xs font-bold text-[#331B08]">{formatVnd(item.quantity * item.unitPriceSnapshot)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="flex flex-col gap-4">
              {/* Báo giá phòng sỉ */}
              <div className="panel flex flex-col gap-4">
                <div className="flex justify-between items-center border-b border-dashed border-orange-100 pb-2">
                  <h3 className="text-lg font-bold">Báo giá lần {quote.version}</h3>
                  <StatusPill tone={quote.status === "accepted" ? "success" : "warning"}>
                    {quote.status === "published" ? "Nhân viên đề xuất" : "Đại lý đã đồng ý"}
                  </StatusPill>
                </div>

                <div className="flex flex-col gap-2.5 text-xs text-[#331B08]">
                  <div className="flex justify-between items-center p-1">
                    <span>Tổng tiền sản phẩm:</span>
                    <strong className="font-semibold">{formatVnd(quote.subtotal)}</strong>
                  </div>
                  
                  {quote.adjustments.map((adj) => (
                    <div className="flex justify-between items-center p-1 text-orange-700 bg-orange-50/50 rounded px-2" key={adj.id}>
                      <span>{adj.label}:</span>
                      <strong className="font-bold">{formatVnd(adj.amount)}</strong>
                    </div>
                  ))}

                  <div className="border-t border-dashed border-orange-100 my-1 pt-2 flex justify-between items-center text-sm font-bold">
                    <span>Tổng giá cuối cùng:</span>
                    <span className="text-lg text-orange-600">{formatVnd(quote.finalTotal)}</span>
                  </div>

                  <div className="flex justify-between items-center p-2 bg-orange-50/20 border border-orange-100 rounded-xl font-bold">
                    <span>Khoản cọc cần thanh toán:</span>
                    <span className="text-orange-700">{formatVnd(quote.depositAmount)}</span>
                  </div>
                </div>

                {!isLoggedIn && (
                  <button className="primary-button text-xs py-3 justify-center w-full" disabled type="button">
                    Đăng nhập để giao dịch
                  </button>
                )}

                {mode === "customer" && quote.status === "published" && (
                  <button
                    className="primary-button text-xs py-3 justify-center w-full"
                    type="button"
                    onClick={acceptQuote}
                  >
                    Đồng ý báo giá này
                  </button>
                )}

                {/* Yêu cầu VietQR tĩnh */}
                {isLoggedIn && workingOrder.paymentRequests.length > 0 && (
                  <div className="p-4 border-2 border-orange-200 bg-white rounded-2xl flex flex-col items-center gap-3 mt-1 shadow-inner">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#78350F] border-b border-dashed border-orange-100 pb-2 w-full justify-center">
                      <QrCode size={16} /> Quét VietQR chuyển khoản nhanh
                    </div>
                    
                    {/* Simulated VietQR payload details */}
                    {(() => {
                      const activeReq = workingOrder.paymentRequests[workingOrder.paymentRequests.length - 1];
                      return (
                        <>
                          <div className="w-40 h-40 bg-orange-50 border-2 border-orange-100 rounded-2xl flex items-center justify-center text-center p-2 text-xs relative overflow-hidden">
                            <span className="text-[10px] text-orange-950 font-bold leading-relaxed">
                              [ VietQR Tĩnh ]
                              <br />
                              Pet Travel
                              <br />
                              <strong className="text-sm text-orange-600 block mt-2">{formatVnd(activeReq.amount)}</strong>
                            </span>
                            <div className="absolute bottom-1 right-1 text-[8px] bg-orange-500 text-white font-mono px-1 rounded">PTW QR</div>
                          </div>
                          
                          <div className="flex flex-col gap-1 w-full text-center">
                            <span className="text-[10px] muted font-bold uppercase">Nội dung ghi chú chuyển khoản:</span>
                            <div className="flex items-center gap-1 justify-center bg-orange-50 border border-orange-100 p-2 rounded-xl">
                              <span className="font-mono text-xs font-bold text-orange-950 select-all">{activeReq.reference}</span>
                            </div>
                          </div>

                          {workingOrder.paymentStatus.includes("requested") && (
                            <button
                              type="button"
                              className="tab-button text-xs py-2 w-full justify-center bg-orange-500 text-white border-orange-600 hover:bg-orange-600"
                              onClick={simulateProofUpload}
                            >
                              <Upload size={14} /> Gửi minh chứng chuyển khoản
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Vận chuyển */}
              {workingOrder.shipment && (
                <div className="panel flex flex-col gap-3">
                  <div className="section-title">
                    <h3 className="text-sm font-bold flex items-center gap-1"><Truck size={15} /> Thông tin Giao nhận sỉ</h3>
                  </div>
                  <div className="flex flex-col gap-2 text-xs text-[#331B08]">
                    <div className="flex justify-between">
                      <span>Đơn vị vận chuyển:</span>
                      <strong>{workingOrder.shipment.carrier}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Mã vận đơn (Tra cứu):</span>
                      <strong className="text-orange-600">{workingOrder.shipment.trackingCode}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Thời gian nhận dự kiến:</span>
                      <strong>{workingOrder.shipment.eta}</strong>
                    </div>
                    <p className="muted text-[10px] m-0 mt-2 bg-orange-50/50 p-2 rounded-xl border border-orange-100 leading-relaxed font-bold">
                      Ghi chú vận chuyển: {workingOrder.shipment.note}
                    </p>
                  </div>
                </div>
              )}
            </aside>
          </section>
        )}

        {/* --- D. ADMIN OPERATIONS TAB (ADMIN ONLY) --- */}
        {activeTab === "admin" && isAdmin && (
          <section className="grid-dashboard">
            <div className="flex flex-col gap-4">
              {/* Thẩm định báo giá */}
              <div className="panel flex flex-col gap-4">
                <div className="section-title">
                  <h3 className="text-lg font-bold">1. Thẩm định Chi phí & Báo giá</h3>
                  <StatusPill tone={isOrderFrozen ? "warning" : "info"}>
                    {isOrderFrozen ? "Đơn đã bị khóa chỉnh sửa" : "Bản nháp báo giá"}
                  </StatusPill>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-orange-950/80">Chiết khấu giảm giá Đại lý (VND)</label>
                    <input
                      type="number"
                      className="text-input text-xs py-2 px-3"
                      disabled={isOrderFrozen}
                      value={adminDiscount}
                      onChange={(e) => setAdminDiscount(parseInt(e.target.value, 10) || 0)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-orange-950/80">Phí ship vận chuyển (VND)</label>
                      <input
                        type="number"
                        className="text-input text-xs py-2 px-3"
                        disabled={isOrderFrozen || shippingFeeOption === "separate_cod"}
                        value={shippingFeeOption === "separate_cod" ? 0 : adminShippingFee}
                        onChange={(e) => setAdminShippingFee(parseInt(e.target.value, 10) || 0)}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-orange-950/80">Hình thức tính phí ship</label>
                      <div className="flex items-center gap-2 mt-2">
                        <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                          <input
                            type="radio"
                            name="ship_opt"
                            disabled={isOrderFrozen}
                            checked={shippingFeeOption === "included"}
                            onChange={() => setShippingFeeOption("included")}
                          />
                          Cộng vào đơn sỉ
                        </label>
                        <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                          <input
                            type="radio"
                            name="ship_opt"
                            disabled={isOrderFrozen}
                            checked={shippingFeeOption === "separate_cod"}
                            onChange={() => {
                              setShippingFeeOption("separate_cod");
                              setAdminShippingFee(0);
                            }}
                          />
                          Khách trả khi nhận
                        </label>
                      </div>
                    </div>
                  </div>

                  {requiresManagerApproval && !isManagerApproved && (
                    <div className="p-3 border-2 border-dashed border-red-200 bg-red-50/20 rounded-2xl flex flex-col gap-2 mt-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={16} />
                        <div>
                          <strong className="text-xs text-red-950 block">Cảnh báo: Vượt hạn mức phê duyệt của Operator!</strong>
                          <p className="text-[10px] text-red-900 m-0 mt-0.5 leading-relaxed font-bold">
                            Mức chiết khấu hiện tại ({percent(adminDiscount / quote.subtotal)}) vượt quá hạn mức tối đa cho phép ({percent(adminPolicy.maxOperatorDiscountRate)}). Cần Quản lý ký số phê duyệt để tiếp tục.
                          </p>
                        </div>
                      </div>
                      <button
                        className="tab-button text-xs py-2 w-max text-red-700 border-red-300 hover:bg-red-50"
                        type="button"
                        onClick={() => {
                          setIsManagerApproved(true);
                          addComment("internal", "Quản lý (Manager) đã kiểm tra và phê duyệt mức chiết khấu sỉ đặc biệt cho đơn này.");
                        }}
                      >
                        <ShieldCheck size={14} /> Ký số Phê duyệt vượt hạn mức
                      </button>
                    </div>
                  )}

                  {isManagerApproved && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-xs text-green-800 font-bold">
                      <CheckCircle2 size={16} className="text-green-600" /> Đơn đã được ký phê duyệt bởi Quản lý!
                    </div>
                  )}

                  <button
                    className="primary-button text-xs py-3 justify-center w-full mt-2"
                    type="button"
                    disabled={isOrderFrozen || (requiresManagerApproval && !isManagerApproved)}
                    onClick={publishNewQuote}
                  >
                    Phát hành Bản báo giá lần {workingOrder.quoteVersions.length + 1}
                  </button>
                </div>
              </div>

              {/* Tạo VietQR chuyển khoản */}
              <div className="panel flex flex-col gap-4">
                <div className="section-title">
                  <h3 className="text-lg font-bold">2. Yêu cầu Thanh toán & VietQR</h3>
                </div>

                <div className="flex flex-col gap-3">
                  {workingOrder.paymentIntent === "deposit_cod" && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-orange-950/80">Số tiền đặt cọc tùy chỉnh (VND) - Bỏ trống nếu lấy 30% mặc định</label>
                      <input
                        type="number"
                        className="text-input text-xs py-2 px-3"
                        disabled={isOrderFrozen || !isQuoteAccepted}
                        placeholder={formatVnd(quote.depositAmount)}
                        value={customDepositInput}
                        onChange={(e) => setCustomDepositInput(e.target.value)}
                      />
                    </div>
                  )}

                  {!isQuoteAccepted && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-semibold leading-relaxed">
                      Chờ đại lý chấp thuận Bản báo giá lần {quote.version} trước khi phát hành VietQR chính thức.
                    </div>
                  )}

                  <button
                    className="tab-button text-xs py-3 justify-center w-full bg-orange-500 text-white border-orange-600 hover:bg-orange-600"
                    type="button"
                    disabled={isOrderFrozen || !isQuoteAccepted}
                    onClick={issuePaymentRequest}
                  >
                    <QrCode size={15} /> Phát hành Yêu cầu & QR tĩnh
                  </button>
                </div>
              </div>
            </div>

            <aside className="flex flex-col gap-4">
              {/* Kế toán đối soát */}
              <div className="panel flex flex-col gap-4">
                <div className="section-title">
                  <h3 className="text-lg font-bold">3. Phòng Kế toán & Đối soát</h3>
                </div>

                <div className="flex flex-col gap-3 text-xs">
                  <div className="p-3 border-2 border-orange-100 rounded-2xl bg-[#FFFDF9] flex flex-col gap-2">
                    <strong className="text-xs text-[#331B08] block">Trạng thái dòng tiền sỉ:</strong>
                    <div className="flex justify-between items-center py-1 border-b border-dashed border-orange-100">
                      <span>Yêu cầu chuyển khoản:</span>
                      <strong>{formatVnd(workingOrder.paymentRequests[workingOrder.paymentRequests.length - 1]?.amount || 0)}</strong>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span>Trạng thái chứng từ:</span>
                      <div>
                        {workingOrder.paymentStatus === "deposit_uploaded" || workingOrder.paymentStatus === "full_uploaded" ? (
                          <span className="status-pill warning text-[9px]">Chờ đối soát biên lai</span>
                        ) : workingOrder.paymentStatus.includes("confirmed") || workingOrder.paymentStatus === "paid" ? (
                          <span className="status-pill success text-[9px]">Đã xác nhận tiền vào</span>
                        ) : (
                          <span className="status-pill info text-[9px]">Chờ đại lý chuyển khoản</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {workingOrder.paymentProofs.length > 0 && (
                    <div className="p-3 border-2 border-orange-100 rounded-2xl bg-[#FFFDF9] flex flex-col gap-3">
                      <div>
                        <strong className="text-xs text-[#331B08] block">Ảnh biên lai đại lý gửi:</strong>
                        <p className="muted text-[10px] m-0 mt-0.5">{workingOrder.paymentProofs[0].fileName}</p>
                      </div>
                      
                      <div className="aspect-video w-full rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center font-bold text-orange-950/70 text-xs">
                        [ HÌNH ẢNH BIÊN LAI ]
                      </div>

                      {workingOrder.paymentProofs[0].status === "pending_admin_confirmation" ? (
                        <button
                          type="button"
                          className="tab-button py-2 w-full justify-center bg-green-500 text-white border-green-600 hover:bg-green-600 font-bold"
                          onClick={confirmDeposit}
                        >
                          Xác nhận Đã nhận đủ tiền sỉ
                        </button>
                      ) : (
                        <div className="p-2.5 bg-green-50 border border-green-200 rounded-xl text-green-800 font-bold text-center">
                          ✓ Giao dịch cọc/tiền đã khóa
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Bàn giao vận chuyển */}
              <div className="panel flex flex-col gap-4">
                <div className="section-title">
                  <h3 className="text-lg font-bold">4. Kho hàng & Vận chuyển</h3>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    className="tab-button text-xs py-3 justify-center w-full bg-blue-600 text-white border-blue-700 hover:bg-blue-700"
                    disabled={workingOrder.fulfillmentStatus === "shipped" || (!workingOrder.paymentStatus.includes("confirmed") && workingOrder.paymentStatus !== "paid")}
                    onClick={attachShipment}
                  >
                    <Truck size={15} /> Bàn giao Đối tác GHN (Mã vận đơn)
                  </button>
                </div>
              </div>
            </aside>
          </section>
        )}

        {/* --- D2. PRODUCT MANAGEMENT TAB (ADMIN ONLY) --- */}
        {activeTab === "admin_products" && isAdmin && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-[#331B08]">🛍️ Quản lý Danh mục Sản phẩm sỉ</h2>
                <p className="muted text-xs">Cập nhật thông tin, giá sỉ và quản lý kho hàng thực tế của đại lý.</p>
              </div>
              <button
                type="button"
                className="primary-button text-xs py-2"
                onClick={() => {
                  setEditingProduct(null);
                  setShowProductForm(true);
                  // Setup empty form
                  setFormCode(`PRO-${Date.now().toString().slice(-4)}`);
                  setFormName("");
                  setFormCategory("Thức ăn");
                  setFormImage("/product-food.svg");
                  setFormTags("Thức ăn, Hạt");
                  setFormVariants([
                    { id: `v_${Date.now()}_1`, sku: `SKU-${Date.now().toString().slice(-3)}-1`, label: "Túi 1.5kg", wholesalePrice: 150000, minOrderQty: 10, stock: 100, supplierId: "sup_1" },
                    { id: `v_${Date.now()}_2`, sku: `SKU-${Date.now().toString().slice(-3)}-2`, label: "Túi 5kg", wholesalePrice: 420000, minOrderQty: 5, stock: 50, supplierId: "sup_2" }
                  ]);
                }}
              >
                + Thêm sản phẩm sỉ
              </button>
            </div>

            <div className="panel p-4 overflow-x-auto">
              <table className="variant-table w-full">
                <thead>
                  <tr>
                    <th>Mã/Ảnh</th>
                    <th>Tên sản phẩm sỉ</th>
                    <th>Phân loại</th>
                    <th>Phân loại & Giá / MOQ / Tồn</th>
                    <th className="text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {allProducts.map((p) => (
                    <tr key={p.id}>
                      <td className="w-16">
                        <div className="relative w-12 h-12 rounded-xl overflow-hidden border bg-orange-50 flex items-center justify-center p-1">
                          <Image src={p.imageUrl} alt={p.name} fill className="object-contain" />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-orange-950 block mt-1 text-center">{p.code}</span>
                      </td>
                      <td>
                        <strong className="text-sm font-bold text-[#331B08]">{p.name}</strong>
                        <span className="block text-[10px] bg-orange-100 text-orange-800 rounded-full px-2 py-0.5 w-max font-bold mt-1">
                          {p.category}
                        </span>
                      </td>
                      <td className="text-xs font-semibold text-[#78350F]">
                        {p.variants.length} phân loại
                      </td>
                      <td>
                        <div className="flex flex-col gap-1.5">
                          {p.variants.map((v) => (
                            <div key={v.id} className="text-xs bg-[#FFFDF9] border border-orange-100 rounded-xl p-1.5 flex justify-between gap-4">
                              <span><strong>{v.label}</strong> ({v.sku})</span>
                              <span className="muted font-bold text-orange-600">
                                {formatVnd(v.wholesalePrice)} <span className="text-[10px] text-gray-500">(MOQ: {v.minOrderQty} · Kho: {v.stock})</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="tab-button text-xs py-1 px-3 border-orange-200 bg-orange-50/50 hover:bg-orange-100"
                            onClick={() => {
                              setEditingProduct(p);
                              setShowProductForm(true);
                              setFormCode(p.code);
                              setFormName(p.name);
                              setFormCategory(p.category);
                              setFormImage(p.imageUrl);
                              setFormTags(p.tags.join(", "));
                              setFormVariants(p.variants.map(v => ({ ...v })));
                            }}
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            className="tab-button text-xs py-1 px-3 text-red-600 border-red-200 bg-red-50/30 hover:bg-red-50"
                            onClick={() => {
                              if (confirm(`Bạn có chắc chắn muốn xóa sản phẩm ${p.name}?`)) {
                                setAllProducts(prev => prev.filter(item => item.id !== p.id));
                              }
                            }}
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- D3. RECONCILIATION & CASH FLOW TAB (ADMIN ONLY) --- */}
        {activeTab === "admin_reconciliation" && isAdmin && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-xl font-bold text-[#331B08]">💸 Đối soát & Sao kê Dòng tiền sỉ</h2>
              <p className="muted text-xs">Đối chiếu biên lai đại lý chuyển khoản với sao kê tài khoản ngân hàng Pet Travel.</p>
            </div>

            {/* Reconciliation KPI cards */}
            <div className="metrics-grid">
              <div className="metric">
                <span className="muted text-sm flex items-center gap-1 font-semibold"><Check size={14} className="text-green-600" /> Thực thu khớp tiền</span>
                <strong className="text-green-700">{formatVnd(workingOrder.paymentStatus === "paid" ? quote.finalTotal : workingOrder.paymentStatus === "deposit_confirmed" ? quote.depositAmount : 0)}</strong>
              </div>
              <div className="metric">
                <span className="muted text-sm flex items-center gap-1 font-semibold"><Clock size={14} className="text-amber-600" /> Tiền chờ kế toán đối soát</span>
                <strong className="text-amber-700">
                  {workingOrder.paymentStatus === "deposit_uploaded" ? formatVnd(quote.depositAmount) : workingOrder.paymentStatus === "full_uploaded" ? formatVnd(quote.finalTotal - quote.depositAmount) : "0 đ"}
                </strong>
              </div>
            </div>

            {/* Transaction Ledger Table */}
            <div className="panel p-4 flex flex-col gap-4 overflow-x-auto">
              <h3 className="text-sm font-bold text-[#331B08] border-b border-dashed border-orange-100 pb-2">📋 Sao kê dòng tiền theo đơn sỉ</h3>
              <table className="variant-table w-full">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Nội dung thanh toán</th>
                    <th>Mã tham chiếu</th>
                    <th>Số tiền</th>
                    <th>Trạng thái đối soát</th>
                    <th className="text-right">Biên lai / Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {workingOrder.paymentRequests.map((req) => {
                    const proof = workingOrder.paymentProofs.find(p => p.paymentRequestId === req.id);
                    return (
                      <tr key={req.id}>
                        <td className="text-xs font-mono text-gray-500">2026-08-08 15:24</td>
                        <td>
                          <span className="text-xs font-bold block text-[#331B08]">
                            {req.purpose === "deposit" ? "Khoản cọc trước 30%" : "Thanh toán phần còn lại COD"}
                          </span>
                          <span className="text-[10px] muted">Nhận chuyển khoản VietQR</span>
                        </td>
                        <td className="text-xs font-mono font-bold text-orange-950">{req.reference}</td>
                        <td className="text-xs font-bold text-[#331B08]">{formatVnd(req.amount)}</td>
                        <td>
                          {proof ? (
                            proof.status === "accepted" ? (
                              <span className="status-pill success text-[10px]">Đã đối soát khớp tiền</span>
                            ) : (
                              <span className="status-pill warning text-[10px]">Chờ kế toán xác nhận</span>
                            )
                          ) : (
                            <span className="status-pill info text-[10px]">Đại lý chưa gửi biên lai</span>
                          )}
                        </td>
                        <td className="text-right">
                          {proof ? (
                            <div className="flex justify-end items-center gap-2">
                              <button
                                type="button"
                                className="tab-button text-[10px] py-1 px-2 border-orange-200 bg-[#FFFDF9]"
                                onClick={() => alert(`Đang mở xem minh chứng: ${proof.fileName}\nMã Ref: ${req.reference}\nSố tiền: ${formatVnd(req.amount)}`)}
                              >
                                Xem ảnh
                              </button>
                              {proof.status !== "accepted" && (
                                <button
                                  type="button"
                                  className="tab-button text-[10px] py-1 px-2 bg-green-500 text-white border-green-600 hover:bg-green-600"
                                  onClick={() => confirmDeposit()}
                                >
                                  Duyệt tiền vào
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] muted font-semibold">Chờ đại lý</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- D4. VAT RED INVOICES TAB (ADMIN ONLY) --- */}
        {activeTab === "admin_invoices" && isAdmin && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-xl font-bold text-[#331B08]">🧾 Quản lý Hóa đơn đỏ (VAT)</h2>
              <p className="muted text-xs">Xuất hóa đơn giá trị gia tăng chính thức cho các đại lý yêu cầu chứng từ.</p>
            </div>

            <div className="panel p-4 flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-dashed border-orange-100 pb-2">
                <h3 className="text-sm font-bold text-[#331B08]">📋 Danh sách yêu cầu hóa đơn đỏ</h3>
                <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5 font-bold">
                  {workingOrder.invoiceRequested ? "1 Yêu cầu mới" : "Không có yêu cầu"}
                </span>
              </div>

              {workingOrder.invoiceRequested ? (
                <div className="border border-orange-100 rounded-2xl p-4 bg-[#FFFDF9] flex flex-col gap-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] muted font-bold">Tên công ty xuất:</span>
                      <strong className="text-xs text-[#331B08]">{workingOrder.customerCompany}</strong>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] muted font-bold">Mã số thuế:</span>
                      <strong className="text-xs text-orange-950 font-mono">MST-031782601</strong>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] muted font-bold">Địa chỉ hóa đơn:</span>
                      <strong className="text-xs text-[#331B08]">Quận 1, Thành phố Hồ Chí Minh</strong>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] muted font-bold">Trạng thái phát hành:</span>
                      <div>
                        {workingOrder.commercialStatus === "locked" ? (
                          <span className="status-pill info text-[9px]">Chờ phát hành (Chờ thanh toán)</span>
                        ) : workingOrder.paymentStatus === "paid" ? (
                          <span className="status-pill success text-[9px]">Sẵn sàng phát hành (Đã thanh toán)</span>
                        ) : (
                          <span className="status-pill warning text-[9px]">Chờ thanh toán chốt tiền</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-dashed border-orange-100 pt-3 flex justify-between items-center">
                    <span className="text-xs text-orange-950 font-bold">Giá trị hóa đơn (gồm VAT 10%): <strong className="text-orange-600">{formatVnd(quote.finalTotal)}</strong></span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="tab-button text-xs py-1.5 px-3 border-orange-200 bg-white"
                        onClick={() => alert("Đang tải xuống bản nháp Hóa đơn đỏ PDF...")}
                      >
                        Tải hóa đơn nháp
                      </button>
                      <button
                        type="button"
                        className="primary-button text-xs py-1.5 px-4"
                        disabled={workingOrder.paymentStatus !== "paid"}
                        onClick={() => alert("Hóa đơn điện tử số điện tử đã được phát hành thành công và gửi tới email của đại lý!")}
                      >
                        Phát hành hóa đơn điện tử
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 muted text-xs font-semibold">
                  Đơn hàng sỉ hiện tại không có yêu cầu xuất hóa đơn đỏ từ đại lý.
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- E. POLICY & SETTINGS TAB --- */}
        {activeTab === "settings" && (
          <section className="grid-dashboard">
            <div className="panel flex flex-col gap-4">
              <div className="section-title">
                <h3 className="text-lg font-bold">🛡️ Phân quyền Nhân sự theo Vai trò</h3>
              </div>
              <div className="flex flex-col gap-3">
                {Object.entries(rolePermissions).map(([role, permissions]) => (
                  <div className="p-4 border-2 border-orange-100 rounded-2xl bg-[#FFFDF9]" key={role}>
                    <strong className="text-sm text-[#331B08] font-bold block">{role}</strong>
                    <p className="muted text-xs m-0 mt-0.5">{permissions.length} quyền vận hành đang hoạt động</p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {permissions.map((p) => (
                        <span className="tag text-[10px] px-2 py-0.5 font-bold" key={p}>{p}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <aside className="panel flex flex-col gap-4">
              <div className="section-title">
                <h3 className="text-lg font-bold">⚙️ Ngưỡng tự động & Hạn mức</h3>
              </div>
              <div className="flex flex-col gap-3 text-xs text-[#331B08]">
                <div className="flex justify-between items-center p-2 border-b border-dashed border-orange-100">
                  <span>Freeship toàn quốc từ:</span>
                  <strong>{formatVnd(adminPolicy.freeShippingThreshold)}</strong>
                </div>
                <div className="flex justify-between items-center p-2 border-b border-dashed border-orange-100">
                  <span>Tỷ lệ đặt cọc mặc định:</span>
                  <strong>{percent(adminPolicy.defaultDepositRate)}</strong>
                </div>
                <div className="flex justify-between items-center p-2 border-b border-dashed border-orange-100">
                  <span>Nhân viên giảm giá tối đa:</span>
                  <strong>{percent(adminPolicy.maxOperatorDiscountRate)}</strong>
                </div>
                <div className="flex justify-between items-center p-2 border-b border-dashed border-orange-100">
                  <span>Hạn mức cần Quản lý duyệt:</span>
                  <strong>{formatVnd(adminPolicy.requireManagerApprovalAbove)}</strong>
                </div>
              </div>
              <div className="p-3 border border-orange-200 bg-orange-50/30 rounded-xl flex items-start gap-2 mt-2">
                <AlertTriangle size={15} className="text-orange-600 mt-0.5 shrink-0" />
                <p className="text-[10px] text-orange-950 m-0 leading-relaxed font-bold">
                  Lưu ý an toàn dòng tiền: Tuyệt đối không cho phép chỉnh sửa trực tiếp số tiền đã được xác nhận tiền về ngân hàng. Mọi thay đổi sai sót phải làm qua bút toán phụ hoặc hoàn tiền.
                </p>
              </div>
            </aside>
          </section>
        )}

      </section>

      {/* --- CUTE PRODUCT DETAIL MODAL --- */}
      {selectedProduct && (
        <div className="fixed inset-0 z-1000 flex items-center justify-center p-4 bg-black/60 backdrop-filter backdrop-blur-sm animate-fade-in" onClick={() => setSelectedProduct(null)}>
          <div 
            className="panel max-w-3xl w-full flex flex-col md:flex-row gap-6 p-6 relative overflow-hidden bg-[#FFFDF9] animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button 
              type="button" 
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold hover:bg-orange-200 transition active:scale-90"
              onClick={() => setSelectedProduct(null)}
            >
              ✕
            </button>

            {/* Left side: Image gallery */}
            <div className="flex flex-col gap-3 md:w-1/2">
              <div className="relative aspect-square w-full rounded-2xl overflow-hidden border-2 border-[#FED7AA] bg-white flex items-center justify-center">
                <Image 
                  src={
                    activeGalleryIndex === 0
                      ? selectedProduct.imageUrl
                      : activeGalleryIndex === 1
                      ? "/product-bowl.svg"
                      : activeGalleryIndex === 2
                      ? "/product-wipes.svg"
                      : "/product-bag.svg"
                  } 
                  alt={selectedProduct.name} 
                  fill 
                  className="object-contain p-4" 
                />
              </div>
              <div className="flex gap-2 justify-center">
                {[selectedProduct.imageUrl, "/product-bowl.svg", "/product-wipes.svg", "/product-bag.svg"].map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`w-12 h-12 rounded-xl overflow-hidden border-2 bg-white p-1 transition ${activeGalleryIndex === idx ? 'border-orange-500 scale-105' : 'border-orange-100 opacity-60'}`}
                    onClick={() => setActiveGalleryIndex(idx)}
                  >
                    <div className="relative w-full h-full">
                      <Image src={img} alt="thumbnail" fill className="object-contain" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right side: Product details */}
            <div className="flex flex-col justify-between md:w-1/2">
              <div className="flex flex-col gap-3">
                <div>
                  <span className="bg-orange-100 text-orange-700 text-xs px-2.5 py-0.5 rounded-full font-bold uppercase">
                    {selectedProduct.category}
                  </span>
                  <h2 className="text-xl font-bold text-[#331B08] mt-2 leading-tight">{selectedProduct.name}</h2>
                  <p className="muted text-xs font-mono font-bold mt-1">Mã sản phẩm: {selectedProduct.code}</p>
                </div>

                <div className="tag-list">
                  {selectedProduct.tags.map((tag) => (
                    <span className="tag text-xs" key={tag}>{tag}</span>
                  ))}
                </div>

                <p className="text-xs text-[#78350F] leading-relaxed">
                  Sản phẩm sỉ chất lượng cao cung cấp chính thức bởi hệ sinh thái phân phối Pet Travel. Đảm bảo các tiêu chuẩn an toàn cho thú cưng, đóng gói bền đẹp và hỗ trợ giao nhận toàn quốc nhanh chóng.
                </p>

                <div className="border-t border-dashed border-orange-100 my-1"></div>

                {/* Pricing and cart controls */}
                {!isLoggedIn ? (
                  <div className="p-4 border-2 border-dashed border-amber-200 bg-amber-50/20 rounded-2xl text-center">
                    <LockKeyhole size={24} className="mx-auto text-amber-500 mb-2" />
                    <strong className="text-xs text-[#78350F] block">Đại lý vui lòng đăng nhập để xem giá sỉ</strong>
                    <button 
                      type="button" 
                      className="tab-button text-xs py-1.5 px-4 mt-3 bg-orange-500 text-white border-orange-600 hover:bg-orange-600"
                      onClick={() => {
                        setSelectedProduct(null);
                        setMode("guest");
                      }}
                    >
                      Đăng nhập Cổng đại lý
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {/* Variants selector */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-orange-950/80">Chọn phân loại sản phẩm:</label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {selectedProduct.variants.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            className={`tab-button min-h-[36px] text-xs ${selectedVariantSku === v.sku ? 'bg-orange-500 text-white border-orange-600' : ''}`}
                            onClick={() => {
                              setSelectedVariantSku(v.sku);
                              setModalQty(v.minOrderQty);
                            }}
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Active variant details */}
                    {(() => {
                      const activeV = selectedProduct.variants.find(v => v.sku === selectedVariantSku);
                      if (!activeV) return null;
                      return (
                        <div className="p-3 bg-[#FFFDF9] border border-orange-100 rounded-2xl flex flex-col gap-1">
                          <div className="flex justify-between items-center text-sm font-bold text-[#331B08]">
                            <span>Đơn giá bán sỉ:</span>
                            <span className="text-orange-600 text-lg font-bold">{formatVnd(activeV.wholesalePrice)}</span>
                          </div>
                          <div className="flex justify-between text-xs text-[#78350F] mt-1 font-semibold">
                            <span>Số lượng mua sỉ tối thiểu (MOQ):</span>
                            <span>{activeV.minOrderQty} cái</span>
                          </div>
                          <div className="flex justify-between text-xs text-[#78350F] font-semibold">
                            <span>Số lượng sẵn có tại kho:</span>
                            <span>{activeV.stock} cái</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Quantity and Add buttons */}
                    {(() => {
                      const activeV = selectedProduct.variants.find(v => v.sku === selectedVariantSku);
                      if (!activeV) return null;
                      return (
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex items-center gap-2 border-2 border-orange-100 rounded-xl bg-white p-1">
                            <button
                              type="button"
                              className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold hover:bg-orange-200 active:scale-90"
                              onClick={() => setModalQty(prev => Math.max(activeV.minOrderQty, prev - 1))}
                            >
                              -
                            </button>
                            <span className="font-bold text-[#331B08] min-w-[24px] text-center">{modalQty}</span>
                            <button
                              type="button"
                              className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold hover:bg-orange-200 active:scale-90"
                              onClick={() => setModalQty(prev => Math.min(activeV.stock, prev + 1))}
                            >
                              +
                            </button>
                          </div>

                          <button
                            type="button"
                            className="primary-button text-xs py-3 flex-1 justify-center flex items-center gap-2"
                            onClick={() => {
                              addToCart(activeV.sku, selectedProduct.code, selectedProduct.name, activeV.label, activeV.wholesalePrice, activeV.supplierId);
                              setSelectedProduct(null);
                            }}
                          >
                            <PackageCheck size={16} /> Thêm vào Giỏ hàng
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- FLOATING CHAT WIDGET --- */}
      {isLoggedIn && (
        <>
          {/* Chat Bubble Button */}
          <button
            type="button"
            className="fixed bottom-6 right-6 z-1000 w-14 h-14 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-2xl hover:bg-orange-600 transition active:scale-95 floating-mascot"
            onClick={() => setIsChatOpen(prev => !prev)}
            aria-label="Thảo luận đơn sỉ"
          >
            {isChatOpen ? <span className="text-xl font-bold">✕</span> : <MessageCircle size={26} className="fill-white/20" />}
          </button>

          {/* Chat Window Popup */}
          {isChatOpen && (
            <div 
              className="fixed bottom-24 right-6 z-1000 w-[380px] max-w-[calc(100vw-32px)] panel shadow-2xl flex flex-col p-4 border-2 border-orange-200 bg-[#FFFDF9] animate-scale-in"
              style={{ borderRadius: "1.75rem" }}
            >
              {/* Chat Header */}
              <div className="flex items-center justify-between border-b border-dashed border-orange-100 pb-3 mb-3">
                <div>
                  <h3 className="m-0 text-sm font-bold text-[#331B08] flex items-center gap-1.5">
                    <MessageSquare size={16} className="text-orange-500" /> Trực tuyến Đơn sỉ
                  </h3>
                  <span className="text-[11px] muted font-mono font-bold">Mã đơn: {workingOrder.number}</span>
                </div>
                <span className="text-[10px] font-bold bg-orange-100 text-orange-800 rounded-full px-2.5 py-0.5">
                  {customerVisibleComments.length} tin nhắn
                </span>
              </div>

              {/* Message List */}
              <div className="flex flex-col gap-2.5 max-h-[260px] overflow-y-auto pr-1 mb-3">
                {customerVisibleComments.map((comment) => {
                  const isMe = (isAdmin && comment.author.includes("Quản trị")) || (!isAdmin && !comment.author.includes("Quản trị"));
                  return (
                    <div
                      className={`flex flex-col max-w-[85%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}
                      key={comment.id}
                    >
                      <span className="text-[9px] muted font-bold mb-0.5 px-1">{comment.author}</span>
                      <div 
                        className={`p-2.5 rounded-2xl border text-xs font-semibold ${
                          isMe 
                            ? (comment.audience === "internal" ? 'bg-blue-600 text-white border-blue-700 rounded-tr-none' : 'bg-orange-50/50 text-white border-orange-600 rounded-tr-none') 
                            : (comment.audience === "internal" ? 'bg-blue-50 text-blue-900 border-blue-200 rounded-tl-none' : 'bg-orange-50/50 text-[#331B08] border-orange-100 rounded-tl-none')
                        }`}
                      >
                        {comment.audience === "internal" && (
                          <span className="block text-[8px] uppercase tracking-wider font-bold mb-1 opacity-70">
                            🔒 Ghi chú Nội bộ Admin
                          </span>
                        )}
                        <p className="m-0 leading-relaxed break-words">{comment.message}</p>
                      </div>
                      <span className="text-[9px] muted font-mono mt-0.5 px-1">
                        {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Chat Input & Controls */}
              <div className="border-t border-dashed border-orange-100 pt-3 flex flex-col gap-2">
                {isAdmin && (
                  <label className="flex items-center gap-1.5 text-[11px] text-[#78350F] font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-orange-200 text-orange-500 focus:ring-orange-500"
                      checked={isInternalComment}
                      onChange={(e) => setIsInternalComment(e.target.checked)}
                    />
                    <span>Gửi dưới dạng Ghi chú Nội bộ Admin</span>
                  </label>
                )}
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="text-input text-xs py-2 px-3 flex-1"
                    placeholder="Nhập nội dung lời nhắn..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (!chatInput.trim()) return;
                        const authorName = isAdmin 
                          ? (isInternalComment ? "Hệ thống / Vận hành" : "Ban Quản trị Pet Travel") 
                          : "Đại lý lấy sỉ";
                        const audienceType = isInternalComment ? "internal" : "customer_visible";
                        
                        setWorkingOrder((prev) => ({
                          ...prev,
                          comments: [
                            ...prev.comments,
                            {
                              id: `comment_${Date.now()}`,
                              author: authorName,
                              message: chatInput.trim(),
                              createdAt: new Date().toISOString(),
                              audience: audienceType
                            }
                          ]
                        }));
                        setChatInput("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="primary-button text-xs py-2 px-4 shrink-0"
                    onClick={() => {
                      if (!chatInput.trim()) return;
                      const authorName = isAdmin 
                        ? (isInternalComment ? "Hệ thống / Vận hành" : "Ban Quản trị Pet Travel") 
                        : "Đại lý lấy sỉ";
                      const audienceType = isInternalComment ? "internal" : "customer_visible";
                      
                      setWorkingOrder((prev) => ({
                        ...prev,
                        comments: [
                          ...prev.comments,
                          {
                            id: `comment_${Date.now()}`,
                            author: authorName,
                            message: chatInput.trim(),
                            createdAt: new Date().toISOString(),
                            audience: audienceType
                          }
                        ]
                      }));
                      setChatInput("");
                    }}
                  >
                    Gửi
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* --- ADD / EDIT PRODUCT FORM MODAL --- */}
      {showProductForm && (
        <div className="fixed inset-0 z-1000 flex items-center justify-center p-4 bg-black/60 backdrop-filter backdrop-blur-sm animate-fade-in" onClick={() => setShowProductForm(false)}>
          <div 
            className="panel max-w-2xl w-full flex flex-col gap-4 p-6 relative overflow-hidden bg-[#FFFDF9] animate-scale-in max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button 
              type="button" 
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold hover:bg-orange-200 transition active:scale-90"
              onClick={() => setShowProductForm(false)}
            >
              ✕
            </button>

            <h3 className="text-lg font-bold text-[#331B08]">{editingProduct ? "✍️ Chỉnh sửa sản phẩm sỉ" : "➕ Thêm sản phẩm sỉ mới"}</h3>
            
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-orange-950/80">Tên sản phẩm:</label>
                  <input type="text" className="text-input text-xs py-2 px-3" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Nhập tên sản phẩm..." />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-orange-950/80">Mã sản phẩm (Code):</label>
                  <input type="text" className="text-input text-xs py-2 px-3" value={formCode} onChange={(e) => setFormCode(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-orange-950/80">Danh mục:</label>
                  <select className="text-input text-xs py-2 px-3 bg-white" value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
                    <option value="Thức ăn">Thức ăn</option>
                    <option value="Đồ chơi">Đồ chơi</option>
                    <option value="Vệ sinh">Vệ sinh</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-orange-950/80">Tags (Ngăn cách bởi dấu phẩy):</label>
                  <input type="text" className="text-input text-xs py-2 px-3" value={formTags} onChange={(e) => setFormTags(e.target.value)} placeholder="Ví dụ: Dành cho mèo, Cát vệ sinh..." />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-orange-950/80">Đường dẫn ảnh:</label>
                <select className="text-input text-xs py-2 px-3 bg-white" value={formImage} onChange={(e) => setFormImage(e.target.value)}>
                  <option value="/product-food.svg">Thức ăn hạt sỉ (/product-food.svg)</option>
                  <option value="/product-bowl.svg">Bát ăn sỉ (/product-bowl.svg)</option>
                  <option value="/product-wipes.svg">Khăn ướt lau thú cưng sỉ (/product-wipes.svg)</option>
                  <option value="/product-bag.svg">Balo vận chuyển sỉ (/product-bag.svg)</option>
                </select>
              </div>

              <div className="border-t border-dashed border-orange-100 my-1"></div>

              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-orange-950">Quản lý phân loại sản phẩm (Variants):</h4>
                <button
                  type="button"
                  className="tab-button text-[10px] py-1 px-2 border-orange-200 bg-orange-50/50"
                  onClick={() => {
                    setFormVariants(prev => [
                      ...prev,
                      {
                        id: `v_${Date.now()}`,
                        sku: `SKU-${Date.now().toString().slice(-3)}`,
                        label: "Phân loại mới",
                        wholesalePrice: 100000,
                        minOrderQty: 10,
                        stock: 100,
                        supplierId: "sup_1"
                      }
                    ]);
                  }}
                >
                  + Thêm phân loại
                </button>
              </div>

              <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto border border-orange-100 rounded-2xl p-2 bg-orange-50/10">
                {formVariants.map((v, index) => (
                  <div key={v.id} className="grid grid-cols-5 gap-2 items-center bg-[#FFFDF9] border border-orange-100 p-2 rounded-xl">
                    <div className="col-span-1">
                      <label className="text-[10px] font-bold text-gray-500">Nhãn:</label>
                      <input 
                        type="text" 
                        className="text-input text-[10px] py-1 px-2 w-full" 
                        value={v.label} 
                        onChange={(e) => {
                          const updated = [...formVariants];
                          updated[index].label = e.target.value;
                          setFormVariants(updated);
                        }} 
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="text-[10px] font-bold text-gray-500">Giá sỉ (VND):</label>
                      <input 
                        type="number" 
                        className="text-input text-[10px] py-1 px-2 w-full" 
                        value={v.wholesalePrice} 
                        onChange={(e) => {
                          const updated = [...formVariants];
                          updated[index].wholesalePrice = parseInt(e.target.value) || 0;
                          setFormVariants(updated);
                        }} 
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="text-[10px] font-bold text-gray-500">MOQ:</label>
                      <input 
                        type="number" 
                        className="text-input text-[10px] py-1 px-2 w-full" 
                        value={v.minOrderQty} 
                        onChange={(e) => {
                          const updated = [...formVariants];
                          updated[index].minOrderQty = parseInt(e.target.value) || 0;
                          setFormVariants(updated);
                        }} 
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="text-[10px] font-bold text-gray-500">Tồn kho:</label>
                      <input 
                        type="number" 
                        className="text-input text-[10px] py-1 px-2 w-full" 
                        value={v.stock} 
                        onChange={(e) => {
                          const updated = [...formVariants];
                          updated[index].stock = parseInt(e.target.value) || 0;
                          setFormVariants(updated);
                        }} 
                      />
                    </div>
                    <div className="col-span-1 text-center">
                      <button
                        type="button"
                        className="text-[10px] font-bold text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded border border-red-100 mt-4"
                        onClick={() => {
                          setFormVariants(prev => prev.filter((_, i) => i !== index));
                        }}
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 justify-end mt-2">
                <button
                  type="button"
                  className="tab-button text-xs py-2 px-4"
                  onClick={() => setShowProductForm(false)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  className="primary-button text-xs py-2 px-6"
                  onClick={() => {
                    if (!formName.trim() || !formCode.trim()) {
                      alert("Vui lòng điền đầy đủ Tên và Mã sản phẩm!");
                      return;
                    }
                    if (editingProduct) {
                      setAllProducts(prev => prev.map(p => 
                        p.id === editingProduct.id 
                          ? {
                              ...p,
                              code: formCode,
                              name: formName,
                              category: formCategory,
                              imageUrl: formImage,
                              tags: formTags.split(",").map(t => t.trim()).filter(Boolean),
                              variants: formVariants
                            }
                          : p
                      ));
                    } else {
                      const newProd: Product = {
                        id: `prod_${Date.now()}`,
                        code: formCode,
                        name: formName,
                        category: formCategory,
                        imageUrl: formImage,
                        brand: "Pet Travel",
                        tags: formTags.split(",").map(t => t.trim()).filter(Boolean),
                        variants: formVariants
                      };
                      setAllProducts(prev => [...prev, newProd]);
                    }
                    setShowProductForm(false);
                  }}
                >
                  Lưu thay đổi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
