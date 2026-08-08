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
  WalletCards
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
  UserAccount
} from "@/lib/domain";
import { formatVnd, percent } from "@/lib/money";

type AppMode = "guest" | "customer" | "admin";
type TabKey = "catalog" | "order" | "admin" | "settings";

interface PetTravelAppProps {
  users: UserAccount[];
  products: Product[];
  suppliers: Supplier[];
  order: CustomerOrder;
  rolePermissions: Record<RoleKey, PermissionKey[]>;
  adminPolicy: AdminPolicy;
}

const tabItems: Array<{ key: TabKey; label: string; icon: ComponentType<{ size?: number }> }> = [
  { key: "catalog", label: "San pham", icon: Boxes },
  { key: "order", label: "Phong don hang", icon: MessageSquare },
  { key: "admin", label: "Admin check don", icon: SplitSquareVertical },
  { key: "settings", label: "Role & rule", icon: Settings }
];

const paymentIntentLabels: Record<PaymentIntent, string> = {
  deposit_cod: "Coc truoc, COD phan con lai",
  pay_full: "Thanh toan toan bo sau duyet"
};

function StatusPill({
  tone = "success",
  children
}: {
  tone?: "success" | "warning" | "info";
  children: ReactNode;
}) {
  const className = tone === "success" ? "status-pill" : `status-pill ${tone}`;
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
  const [mode, setMode] = useState<AppMode>("admin");
  const [activeTab, setActiveTab] = useState<TabKey>("catalog");
  const [workingOrder, setWorkingOrder] = useState<CustomerOrder>(order);

  // Initialize Lenis smooth scroll
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

  // Admin adjustments state
  const [adminDiscount, setAdminDiscount] = useState<number>(320000); // initial mock discount
  const [adminShippingFee, setAdminShippingFee] = useState<number>(90000); // initial mock shipping
  const [shippingFeeOption, setShippingFeeOption] = useState<"included" | "separate_cod">("included");
  const [customDepositInput, setCustomDepositInput] = useState<string>("");
  const [isQuoteAccepted, setIsQuoteAccepted] = useState<boolean>(true); // default true for initial mock requested order
  const [isManagerApproved, setIsManagerApproved] = useState<boolean>(false);

  const requiresManagerApproval = (adminDiscount / (quote.subtotal || 1) > adminPolicy.maxOperatorDiscountRate) || (adminDiscount > adminPolicy.requireManagerApprovalAbove);
  const isOrderFrozen = workingOrder.paymentStatus.includes("uploaded") || workingOrder.paymentStatus.includes("confirmed") || workingOrder.paymentStatus === "paid";

  const supplierById = useMemo(
    () => Object.fromEntries(suppliers.map((supplier) => [supplier.id, supplier])),
    [suppliers]
  );

  function visibleSupplierName(supplierId: string) {
    if (isAdmin) return supplierById[supplierId]?.name ?? "Nha cung cap chua ro";
    return "Pet Travel";
  }

  function addComment(audience: "customer_visible" | "internal", message: string) {
    setWorkingOrder((current) => ({
      ...current,
      comments: [
        {
          id: `c_${Date.now()}`,
          author: isAdmin ? "Admin Pet Travel" : current.customerName,
          audience,
          message,
          createdAt: new Date().toISOString()
        },
        ...current.comments
      ],
      updatedAt: new Date().toISOString()
    }));
  }

  // 1. Customer proposes payment intent (Proposal change - resets active payment request)
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
        ? `Khách đề xuất phương án thanh toán mới: Đặt cọc ${percent(adminPolicy.defaultDepositRate)} + COD phần còn lại. Báo giá cũ hết hiệu lực, chờ Admin duyệt.`
        : "Khách đề xuất phương án thanh toán mới: Thanh toán toàn bộ sau khi duyệt. Báo giá cũ hết hiệu lực, chờ Admin duyệt."
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
          label: "Chiết khấu đại lý đặc biệt",
          amount: -adminDiscount,
          requiresApproval: false
        });
      }
      if (shippingFeeOption === "included" && adminShippingFee > 0) {
        adjustments.push({
          id: `adj_ship_${Date.now()}`,
          type: "shipping_fee" as const,
          label: "Phí vận chuyển tạm tính",
          amount: adminShippingFee,
          requiresApproval: false
        });
      }

      const totalAdjustments = adjustments.reduce((sum, adj) => sum + adj.amount, 0);
      const finalTotal = subtotal + totalAdjustments;

      // Auto-calculate deposit/cod based on selection
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

      // Invalidate existing payment requests (superseded)
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
    addComment("customer_visible", `Admin phát hành báo giá chính thức v${workingOrder.quoteVersions.length + 1}. Vui lòng kiểm tra và chấp thuận.`);
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
    addComment("customer_visible", `Khách đã chấp thuận báo giá chính thức v${quote.version}. Chờ Admin phát hành yêu cầu thanh toán.`);
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

      // Supersede older requests
      const updatedRequests = current.paymentRequests.map((req) =>
        req.status === "active" ? { ...req, status: "superseded" as const } : req
      );

      // Auto update COD remaining in the active quote if custom deposit is inputted
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

    addComment("customer_visible", `Admin phát hành yêu cầu thanh toán ${workingOrder.paymentIntent === "deposit_cod" ? "Đặt cọc" : "Toàn bộ"}. Mã QR thanh toán tĩnh đã được khởi tạo.`);
  }

  // 5. Customer uploads proof of payment (Reconciliation Request)
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
            fileName: "xac-nhan-chuyen-khoan-stable.jpg",
            uploadedAt: new Date().toISOString(),
            status: "pending_admin_confirmation" as const
          },
          ...current.paymentProofs
        ],
        updatedAt: new Date().toISOString()
      };
    });
    addComment("customer_visible", "Khách đã tải lên minh chứng chuyển khoản. Đơn hàng chuyển sang trạng thái chờ đối soát (Đóng băng chỉnh sửa).");
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
    addComment("customer_visible", "Kế toán đã xác nhận tiền về tài khoản ngân hàng. Đơn hàng chính thức khóa và chuyển sang bộ phận kho đóng gói.");
  }

  function attachShipment() {
    setWorkingOrder((current) => ({
      ...current,
      fulfillmentStatus: "shipped",
      shipment: {
        carrier: "GHN",
        trackingCode: "GHN982601448",
        shippingFee: 90000,
        eta: "2026-08-10",
        note: "Giao gio hanh chinh, thu COD phan con lai neu co."
      },
      updatedAt: new Date().toISOString()
    }));
    addComment("customer_visible", "Don da gan ma van don GHN982601448 va thong tin phi ship.");
  }

  const customerVisibleComments = workingOrder.comments.filter((comment) => {
    return isAdmin || comment.audience === "customer_visible";
  });

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="flex items-center gap-3">
          <div className="brand-mark">PT</div>
          <div>
            <h1 className="text-lg font-bold">Pet Travel WholeSale</h1>
            <p className="muted text-sm">B2B order cockpit</p>
          </div>
        </div>

        <div className="mode-switch" aria-label="Che do xem demo">
          <button type="button" data-active={mode === "guest"} onClick={() => setMode("guest")}>
            Guest
          </button>
          <button type="button" data-active={mode === "customer"} onClick={() => setMode("customer")}>
            User
          </button>
          <button type="button" data-active={mode === "admin"} onClick={() => setMode("admin")}>
            Admin
          </button>
        </div>

        <div className="panel shadow-none">
          <div className="flex items-start gap-3">
            {isLoggedIn ? <UserRound size={22} /> : <LockKeyhole size={22} />}
            <div>
              <p className="m-0 font-semibold">{isLoggedIn ? activeUser?.name : "Chua dang nhap"}</p>
              <p className="muted m-0 text-sm">
                {isLoggedIn ? `${activeUser?.company} · ${activeUser?.role}` : "Gia si duoc khoa den khi dang nhap"}
              </p>
            </div>
          </div>
        </div>

        <nav className="tabs" aria-label="Dieu huong chinh">
          {tabItems.map((tab) => {
            const Icon = tab.icon;
            const disabled = tab.key === "admin" && !isAdmin;
            return (
              <button
                className="tab-button"
                type="button"
                key={tab.key}
                data-active={activeTab === tab.key}
                disabled={disabled}
                onClick={() => setActiveTab(tab.key)}
              >
                <Icon size={17} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto text-sm muted">
          <p className="m-0">Realtime room: SSE ready</p>
          <p className="m-0">Upload: R2 presigned URL</p>
          <p className="m-0">DB target: Supabase Postgres</p>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div>
            <p className="muted m-0 text-sm">Workspace / Pet Travel</p>
            <h2 className="text-2xl font-bold">Ban si do thu cung, check don theo thoi gian thuc</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="ghost-button" type="button">
              <Search size={17} />
              Tim SKU, don, khach
            </button>
            <button className="icon-button" aria-label="Thong bao" type="button">
              <Bell size={18} />
            </button>
          </div>
        </header>

        <div className="metrics-grid">
          <div className="metric">
            <span className="muted text-sm">Tong tien chot</span>
            <strong>{formatVnd(quote.finalTotal)}</strong>
          </div>
          <div className="metric">
            <span className="muted text-sm">Tien coc</span>
            <strong>{formatVnd(quote.depositAmount)}</strong>
          </div>
          <div className="metric">
            <span className="muted text-sm">Supplier group</span>
            <strong>{workingOrder.fulfillmentGroups.length}</strong>
          </div>
          <div className="metric">
            <span className="muted text-sm">Invoice</span>
            <strong>{workingOrder.invoiceRequested ? "Co" : "Khong"}</strong>
          </div>
        </div>

        {activeTab === "catalog" && (
          <section className="catalog-grid">
            {products.map((product) => (
              <article className="product-card" key={product.id}>
                <Image src={product.imageUrl} alt={product.name} width={640} height={360} />
                <div className="product-body">
                  <div>
                    <p className="muted m-0 text-sm">{product.code} · {product.category}</p>
                    <h3 className="m-0 text-lg font-bold">{product.name}</h3>
                  </div>
                  <div className="tag-list">
                    {product.tags.map((tag) => (
                      <span className="tag" key={tag}>{tag}</span>
                    ))}
                  </div>
                  <table className="variant-table">
                    <thead>
                      <tr>
                        <th>Phan loai</th>
                        <th>NCC</th>
                        <th>Gia si</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.variants.map((variant) => (
                        <tr key={variant.id}>
                          <td>
                            <strong>{variant.sku}</strong>
                            <br />
                            <span className="muted">{variant.label}</span>
                          </td>
                          <td>{visibleSupplierName(variant.supplierId)}</td>
                          <td>
                            {isLoggedIn ? (
                              <>
                                <strong>{formatVnd(variant.wholesalePrice)}</strong>
                                <br />
                                <span className="muted">MOQ {variant.minOrderQty} · Ton {variant.stock}</span>
                              </>
                            ) : (
                              <StatusPill tone="warning">
                                <LockKeyhole size={13} />
                                Can dang nhap
                              </StatusPill>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button className="primary-button" type="button" disabled={!isLoggedIn}>
                    <PackageCheck size={17} />
                    Them vao don si
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}

        {activeTab === "order" && (
          <section className="grid-dashboard">
            <div>
              <div className="order-strip">
                <div>
                  <p className="muted m-0 text-sm">{workingOrder.number}</p>
                  <h2 className="m-0 text-xl font-bold">{workingOrder.customerCompany}</h2>
                </div>
                <StatusPill tone="info">{paymentIntentLabels[workingOrder.paymentIntent]}</StatusPill>
              </div>

              {workingOrder.commercialStatus === "submitted" && (
                <div className="panel warning">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="text-amber-500" size={24} />
                    <div>
                      <h4 className="font-bold text-lg m-0">Đơn hàng đang chờ duyệt</h4>
                      <p className="muted m-0 mt-1">Lựa chọn thanh toán là đề xuất. Hệ thống chưa phát sinh nghĩa vụ thanh toán cho đến khi Admin kiểm tra tồn kho, nhà cung cấp và phát hành báo giá chính thức.</p>
                    </div>
                  </div>
                </div>
              )}

              {workingOrder.commercialStatus === "quoted" && !isQuoteAccepted && (
                <div className="panel warning">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <FileCheck2 className="text-amber-500" size={24} />
                      <div>
                        <h4 className="font-bold text-lg m-0">Yêu cầu chấp thuận Báo giá v{quote.version}</h4>
                        <p className="muted m-0 mt-1">Đã có sự điều chỉnh chi phí (phí vận chuyển, chiết khấu hoặc đơn giá) từ phía hệ thống. Vui lòng chấp thuận báo giá mới để tiếp tục.</p>
                      </div>
                    </div>
                    {!isAdmin && (
                      <button className="primary-button" type="button" onClick={acceptQuote}>
                        Chấp thuận Báo giá
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="panel">
                <div className="section-title">
                  <h3 className="text-lg font-bold">Vòng đời đơn hàng</h3>
                  <StatusPill tone={workingOrder.paymentStatus.includes("confirmed") || workingOrder.paymentStatus === "paid" ? "success" : "warning"}>
                    {workingOrder.paymentStatus}
                  </StatusPill>
                </div>
                <div className="timeline">
                  <div className="timeline-item">
                    <div className="timeline-dot"><FileText size={15} /></div>
                    <div>
                      <strong>1. Khách đặt đơn & Đề xuất phương án</strong>
                      <p className="muted m-0">Đề xuất: {paymentIntentLabels[workingOrder.paymentIntent]}</p>
                    </div>
                  </div>
                  <div className="timeline-item">
                    <div className="timeline-dot"><FileCheck2 size={15} /></div>
                    <div>
                      <strong>2. Admin duyệt & Khách chấp thuận báo giá</strong>
                      <p className="muted m-0">Báo giá hiện tại: v{quote.version} ({isQuoteAccepted ? "Đã chấp thuận" : "Chờ chấp thuận"})</p>
                    </div>
                  </div>
                  <div className="timeline-item">
                    <div className="timeline-dot"><QrCode size={15} /></div>
                    <div>
                      <strong>3. QR yêu cầu thanh toán</strong>
                      <p className="muted m-0">Sử dụng QR tĩnh có mã tham chiếu độc lập và thời hạn sử dụng.</p>
                    </div>
                  </div>
                  <div className="timeline-item">
                    <div className="timeline-dot"><Upload size={15} /></div>
                    <div>
                      <strong>4. Tải chứng từ đối soát</strong>
                      <p className="muted m-0">Chứng từ tải lên chuyển đơn sang trạng thái chờ đối soát, cấm sửa đổi.</p>
                    </div>
                  </div>
                </div>

                {!isAdmin && (
                  <div className="split-actions">
                    <button 
                      className="ghost-button" 
                      type="button" 
                      onClick={() => changePaymentIntent("deposit_cod")}
                      disabled={workingOrder.paymentStatus.includes("uploaded") || workingOrder.paymentStatus.includes("confirmed") || workingOrder.paymentStatus === "paid"}
                    >
                      <WalletCards size={17} />
                      Đổi sang cọc + COD
                    </button>
                    <button 
                      className="ghost-button" 
                      type="button" 
                      onClick={() => changePaymentIntent("pay_full")}
                      disabled={workingOrder.paymentStatus.includes("uploaded") || workingOrder.paymentStatus.includes("confirmed") || workingOrder.paymentStatus === "paid"}
                    >
                      <CreditCard size={17} />
                      Đổi sang thanh toán 100%
                    </button>
                    <button 
                      className="primary-button" 
                      type="button" 
                      onClick={simulateProofUpload}
                      disabled={!isQuoteAccepted || workingOrder.paymentRequests.length === 0 || workingOrder.paymentRequests[workingOrder.paymentRequests.length - 1].status !== "active"}
                    >
                      <Upload size={17} />
                      Tải chứng từ chuyển khoản
                    </button>
                  </div>
                )}
              </div>
            </div>

            <aside className="panel">
              <div className="section-title">
                <h3 className="text-lg font-bold">Thanh toán</h3>
                <StatusPill tone="warning">
                  {workingOrder.paymentStatus === "unrequested" ? "Chờ duyệt" : "Cần thanh toán"}
                </StatusPill>
              </div>

              {workingOrder.commercialStatus === "submitted" ? (
                <div className="p-4 text-center border rounded-lg muted text-sm bg-neutral-900/50">
                  <LockKeyhole className="mx-auto mb-2 opacity-50" size={32} />
                  Chờ Admin duyệt đơn để phát hành mã thanh toán QR.
                </div>
              ) : !isQuoteAccepted ? (
                <div className="p-4 text-center border rounded-lg text-amber-500 text-sm bg-amber-500/10 border-amber-500/20">
                  <AlertTriangle className="mx-auto mb-2" size={32} />
                  Vui lòng chấp thuận Báo giá v{quote.version} để kích hoạt chức năng thanh toán.
                </div>
              ) : workingOrder.paymentRequests.length === 0 || workingOrder.paymentRequests[workingOrder.paymentRequests.length - 1].status !== "active" ? (
                <div className="p-4 text-center border rounded-lg muted text-sm bg-neutral-900/50">
                  <QrCode className="mx-auto mb-2 opacity-50" size={32} />
                  Chờ Admin phát hành mã QR thanh toán cho Báo giá v{quote.version}.
                </div>
              ) : (
                <>
                  <div className="qr-box animate-pulse" aria-label="Ma QR thanh toan">
                    <span>{formatVnd(workingOrder.paymentRequests[workingOrder.paymentRequests.length - 1].amount)}</span>
                  </div>
                  <p className="muted text-sm m-0 mt-3 font-semibold">
                    Nội dung chuyển khoản (Mã QR tĩnh):
                  </p>
                  <div className="p-2 bg-black/40 rounded border border-neutral-800 text-xs font-mono select-all break-all my-2">
                    {workingOrder.paymentRequests[workingOrder.paymentRequests.length - 1].reference}
                  </div>
                  <p className="muted text-xs">
                    * QR này có hiệu lực cho đến khi Báo giá bị thay đổi hoặc hết hạn. Vui lòng chuyển đúng số tiền và điền đúng mã tham chiếu phía trên.
                  </p>
                </>
              )}

              <div className="split-actions mt-4">
                <button className="ghost-button" type="button">
                  <ReceiptText size={17} />
                  Yêu cầu xuất HĐ đỏ
                </button>
                <button className="ghost-button" type="button">
                  <FileCheck2 size={17} />
                  Báo giá v{quote.version}
                </button>
              </div>
            </aside>
          </section>
        )}

        {activeTab === "admin" && isAdmin && (
          <section className="grid-dashboard">
            <div className="flex flex-col gap-4">
              {/* Cấu hình báo giá và chiết khấu */}
              <div className="panel">
                <div className="section-title">
                  <h3 className="text-lg font-bold">1. Thẩm định Báo giá (Admin Review)</h3>
                  <StatusPill tone={isOrderFrozen ? "warning" : "info"}>
                    {isOrderFrozen ? "Locked/Frozen" : "Đang chỉnh sửa"}
                  </StatusPill>
                </div>

                <div className="flex flex-col gap-4 mt-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-semibold muted">Chiết khấu giảm giá (VND)</label>
                    <input
                      type="number"
                      className="text-input"
                      value={adminDiscount}
                      disabled={isOrderFrozen}
                      onChange={(e) => {
                        setAdminDiscount(Number(e.target.value));
                        setIsManagerApproved(false); // Reset approval on change
                      }}
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-semibold muted">Phí vận chuyển (VND)</label>
                    <input
                      type="number"
                      className="text-input"
                      value={adminShippingFee}
                      disabled={isOrderFrozen || shippingFeeOption === "separate_cod"}
                      onChange={(e) => setAdminShippingFee(Number(e.target.value))}
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-semibold muted">Phương án vận chuyển</label>
                    <div className="flex items-center gap-4 mt-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="shipping_opt"
                          checked={shippingFeeOption === "included"}
                          disabled={isOrderFrozen}
                          onChange={() => setShippingFeeOption("included")}
                        />
                        Đã bao gồm trong báo giá
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="shipping_opt"
                          checked={shippingFeeOption === "separate_cod"}
                          disabled={isOrderFrozen}
                          onChange={() => {
                            setShippingFeeOption("separate_cod");
                            setAdminShippingFee(0);
                          }}
                        />
                        Khách thanh toán COD riêng
                      </label>
                    </div>
                  </div>

                  {requiresManagerApproval && (
                    <div className="p-3 border rounded border-amber-500/20 bg-amber-500/10 text-amber-500 text-sm flex flex-col gap-2">
                      <div className="flex items-center gap-2 font-bold">
                        <AlertTriangle size={16} />
                        Chiết khấu vượt hạn mức của Operator ({percent(adminPolicy.maxOperatorDiscountRate)} / {formatVnd(adminPolicy.requireManagerApprovalAbove)})
                      </div>
                      <p className="m-0 text-xs">Yêu cầu tài khoản Admin cấp cao phê duyệt trước khi phát hành báo giá này.</p>
                      {!isManagerApproved && (
                        <button
                          type="button"
                          className="ghost-button border-amber-500/30 text-amber-500 hover:bg-amber-500/20 w-fit py-1 px-3 mt-1"
                          onClick={() => setIsManagerApproved(true)}
                        >
                          Duyệt với tư cách Manager
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-2">
                    <button
                      className="primary-button"
                      type="button"
                      disabled={isOrderFrozen || (requiresManagerApproval && !isManagerApproved)}
                      onClick={publishNewQuote}
                    >
                      <FileCheck2 size={17} />
                      Phát hành báo giá v{workingOrder.quoteVersions.length + 1}
                    </button>
                  </div>
                </div>
              </div>

              {/* Chi tiết đơn hàng */}
              <div className="panel">
                <div className="section-title">
                  <h3 className="text-lg font-bold">Chi tiết sản phẩm</h3>
                  <StatusPill>{workingOrder.commercialStatus}</StatusPill>
                </div>
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>SL</th>
                      <th>Giá snapshot</th>
                      <th>Supplier nội bộ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workingOrder.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.variantSku}</strong>
                          <br />
                          <span className="muted">{item.productName} · {item.variantLabel}</span>
                        </td>
                        <td>{item.quantity}</td>
                        <td>{formatVnd(item.unitPriceSnapshot)}</td>
                        <td>{visibleSupplierName(item.supplierId)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {/* Phát hành yêu cầu thanh toán (QR) */}
              <div className="panel">
                <div className="section-title">
                  <h3 className="text-lg font-bold">2. Yêu cầu thanh toán (QR)</h3>
                  {isQuoteAccepted ? (
                    <StatusPill tone="success">Đã chấp thuận</StatusPill>
                  ) : (
                    <StatusPill tone="warning">Chờ khách chấp thuận</StatusPill>
                  )}
                </div>

                <div className="flex flex-col gap-4 mt-3">
                  <p className="muted text-sm m-0">
                    Khách hàng đề xuất phương án: <strong>{paymentIntentLabels[workingOrder.paymentIntent]}</strong>.
                  </p>

                  {workingOrder.paymentIntent === "deposit_cod" && (
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-semibold muted">Số tiền đặt cọc tùy chỉnh (VND)</label>
                      <input
                        type="number"
                        className="text-input"
                        placeholder={formatVnd(quote.depositAmount)}
                        value={customDepositInput}
                        disabled={!isQuoteAccepted || isOrderFrozen}
                        onChange={(e) => setCustomDepositInput(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      className="primary-button"
                      type="button"
                      disabled={!isQuoteAccepted || isOrderFrozen}
                      onClick={issuePaymentRequest}
                    >
                      <QrCode size={17} />
                      Phát hành Yêu cầu & QR tĩnh
                    </button>
                  </div>
                </div>
              </div>

              {/* Đối soát và xác nhận tiền */}
              <div className="panel">
                <div className="section-title">
                  <h3 className="text-lg font-bold">3. Đối soát Chứng từ (Accountant)</h3>
                  <StatusPill tone={workingOrder.paymentStatus.includes("confirmed") || workingOrder.paymentStatus === "paid" ? "success" : "warning"}>
                    {workingOrder.paymentStatus}
                  </StatusPill>
                </div>

                <div className="flex flex-col gap-3 mt-3">
                  {workingOrder.paymentProofs.length > 0 ? (
                    <div className="p-3 border rounded border-neutral-800 bg-neutral-900/50 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-sm">
                        <strong>Tệp minh chứng:</strong>
                        <span className="font-semibold text-amber-500">{workingOrder.paymentProofs[0].fileName}</span>
                      </div>
                      <div className="text-xs muted">
                        Tải lên lúc: {new Date(workingOrder.paymentProofs[0].uploadedAt).toLocaleTimeString()}
                      </div>
                      {workingOrder.paymentProofs[0].status === "pending_admin_confirmation" ? (
                        <div className="flex gap-2 mt-2">
                          <button
                            className="primary-button bg-emerald-600 hover:bg-emerald-700 border-none text-white w-full"
                            type="button"
                            onClick={confirmDeposit}
                          >
                            <CheckCircle2 size={17} />
                            Xác nhận đã nhận đủ tiền
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-emerald-500 text-sm font-bold mt-2">
                          <CheckCircle2 size={17} />
                          Đã khớp tiền. Đơn hàng đã được khóa.
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="muted text-sm m-0">Chưa có chứng từ nào được tải lên từ khách hàng.</p>
                  )}

                  <div className="flex gap-2 mt-2">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={attachShipment}
                      disabled={workingOrder.fulfillmentStatus === "shipped" || !workingOrder.paymentStatus.includes("confirmed") && workingOrder.paymentStatus !== "paid"}
                    >
                      <Truck size={17} />
                      Gán vận đơn GHN
                    </button>
                  </div>
                </div>
              </div>

              {/* Tách theo nhà cung cấp */}
              <div className="panel">
                <div className="section-title">
                  <h3 className="text-lg font-bold">Chia tách Supplier</h3>
                  <StatusPill tone="info">{workingOrder.fulfillmentStatus}</StatusPill>
                </div>
                {workingOrder.fulfillmentGroups.map((group) => (
                  <div className="supplier-row" key={group.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <strong>{group.supplierName}</strong>
                        <p className="muted m-0 text-sm">{group.itemIds.length} line item · {group.status}</p>
                      </div>
                      <Building2 size={18} />
                    </div>
                    <p className="m-0 mt-2 text-sm">{group.internalNote}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === "settings" && (
          <section className="grid-dashboard">
            <div className="panel">
              <div className="section-title">
                <h3 className="text-lg font-bold">Role, rule, chinh sach</h3>
                <StatusPill tone="info">Deny by default</StatusPill>
              </div>
              {Object.entries(rolePermissions).map(([role, permissions]) => (
                <div className="rule-row" key={role}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <strong>{role}</strong>
                      <p className="muted m-0 text-sm">{permissions.length} quyen dang bat</p>
                    </div>
                    <ShieldCheck size={18} />
                  </div>
                  <div className="tag-list mt-3">
                    {permissions.map((permission) => (
                      <span className="tag" key={permission}>{permission}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <aside className="panel">
              <div className="section-title">
                <h3 className="text-lg font-bold">Nguong tu dong</h3>
                <Settings size={18} />
              </div>
              <div className="rule-row">
                <strong>Freeship tu</strong>
                <p className="muted m-0">{formatVnd(adminPolicy.freeShippingThreshold)}</p>
              </div>
              <div className="rule-row">
                <strong>Ti le coc mac dinh</strong>
                <p className="muted m-0">{percent(adminPolicy.defaultDepositRate)}</p>
              </div>
              <div className="rule-row">
                <strong>Operator giam toi da</strong>
                <p className="muted m-0">{percent(adminPolicy.maxOperatorDiscountRate)}</p>
              </div>
              <div className="rule-row">
                <strong>Can duyet neu uu dai vuot</strong>
                <p className="muted m-0">{formatVnd(adminPolicy.requireManagerApprovalAbove)}</p>
              </div>
              <div className="comment-box internal">
                <strong><AlertTriangle size={15} /> Luu y an toan</strong>
                <p className="m-0 text-sm">
                  Khong cho sua tien da xac nhan. Neu sai, tao ledger hoan tien hoac payment request bo sung.
                </p>
              </div>
            </aside>
          </section>
        )}

        <section className="panel mt-4">
          <div className="section-title">
            <h3 className="text-lg font-bold">Comment 2 chieu tren don</h3>
            <div className="flex items-center gap-2 muted text-sm">
              <Users size={16} />
              {customerVisibleComments.length} comment dang hien
            </div>
          </div>
          {customerVisibleComments.map((comment) => (
            <div
              className={comment.audience === "internal" ? "comment-box internal" : "comment-box"}
              key={comment.id}
            >
              <strong>{comment.author}</strong>
              <p className="m-0 text-sm">{comment.message}</p>
              <p className="muted m-0 text-xs">{comment.audience === "internal" ? "Noi bo Admin" : "Khach thay duoc"}</p>
            </div>
          ))}
          <div className="split-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={() => addComment("customer_visible", "Tin nhan moi da duoc gui trong order room.")}
            >
              <MessageSquare size={17} />
              Gui comment cho khach
            </button>
            {isAdmin && (
              <button
                className="ghost-button"
                type="button"
                onClick={() => addComment("internal", "Note noi bo moi cho doi van hanh.")}
              >
                <LockKeyhole size={17} />
                Them note noi bo
              </button>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
