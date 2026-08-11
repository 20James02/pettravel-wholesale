"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Lenis from "lenis";
import type {
  AccountingOverview,
  AdminPolicy,
  AdminReportsOverview,
  CustomerOrder,
  JournalEntryDetail,
  OperationsOverview,
  OrderItem,
  PermissionKey,
  Product,
  RoleKey,
  Supplier,
  ProductVariant
} from "@/lib/domain";
import { formatVnd } from "@/lib/money";
import {
  fullNameSchema,
  emailSchema,
  phoneSchema,
  passwordSchema,
  loginPasswordSchema,
  optionalUrlSchema,
  recipientSchema,
  vndAmountSchema
} from "@/lib/validation";
import { getValidationErrorMessage } from "@/lib/validation";

import type { AppMode, TabKey, ApiUser } from "./types";

// Import custom subcomponents
import { Sidebar } from "./components/shared/Sidebar";
import { Topbar } from "./components/shared/Topbar";
import { ChatPopup } from "./components/shared/ChatPopup";
import { Catalog } from "./components/customer/Catalog";
import { Cart } from "./components/customer/Cart";
import { OrderTimeline } from "./components/customer/OrderTimeline";
import { AdminOrders } from "./components/admin/AdminOrders";
import { AdminInventory } from "./components/admin/AdminInventory";
import { AdminAccounting } from "./components/admin/AdminAccounting";
import { AdminReports } from "./components/admin/AdminReports";
import { AdminUsers } from "./components/admin/AdminUsers";

const EMPTY_ORDER: CustomerOrder = {
  id: "",
  number: "",
  customerName: "",
  customerCompany: "",
  customerId: "",
  commercialStatus: "draft",
  paymentStatus: "unrequested",
  fulfillmentStatus: "not_started",
  paymentIntent: "deposit_cod",
  invoiceRequested: false,
  updatedAt: new Date().toISOString(),
  items: [],
  quoteVersions: [],
  paymentRequests: [],
  paymentProofs: [],
  fulfillmentGroups: [],
  comments: []
};

const DEFAULT_POLICY: AdminPolicy = {
  freeShippingThreshold: 5000000,
  defaultDepositRate: 0.3,
  maxOperatorDiscountRate: 0.08,
  requireManagerApprovalAbove: 500000
};

interface ProfileUpdatePayload {
  fullName?: string;
  avatarUrl?: string;
  newPassword?: string;
}

interface OrderMutationResponse {
  order: CustomerOrder;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function PetTravelApp() {
  // --- CORE APPLICATION STATES ---
  const [mode, setMode] = useState<AppMode>("guest");
  const [activeTab, setActiveTab] = useState<TabKey>("catalog");
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<ApiUser | null>(null);

  // Data lists
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allOrders, setAllOrders] = useState<CustomerOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [userList, setUserList] = useState<ApiUser[]>([]);

  // Core working order & selected order states
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [workingOrder, setWorkingOrder] = useState<CustomerOrder>(EMPTY_ORDER);
  const [adminOrderItems, setAdminOrderItems] = useState<CustomerOrder["items"]>([]);
  const [isOrderModified, setIsOrderModified] = useState<boolean>(false);

  // Search & filter states
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("Tất cả");
  const [cartCategoryFilter, setCartCategoryFilter] = useState<string>("Tất cả");
  const [adminCategoryFilter, setAdminCategoryFilter] = useState<string>("Tất cả");
  const [adminSupplierFilter, setAdminSupplierFilter] = useState<string>("Tất cả");

  // Policies
  const [adminPolicy, setAdminPolicy] = useState<AdminPolicy>(DEFAULT_POLICY);
  const [rolePermissions, setRolePermissions] = useState<Record<RoleKey, PermissionKey[]>>({} as Record<RoleKey, PermissionKey[]>);
  const [promotionsPolicy, setPromotionsPolicy] = useState<AdminPolicy & { giftThreshold?: number; giftName?: string }>({
    freeShippingThreshold: 5000000,
    defaultDepositRate: 0.3,
    maxOperatorDiscountRate: 0.08,
    requireManagerApprovalAbove: 500000,
    giftThreshold: 10000000,
    giftName: "Bát ăn inox cao cấp chống trượt"
  });

  // Admin adjustments states (discounts, shipping fee, etc.)
  const [adminDiscount, setAdminDiscount] = useState<number>(0);
  const [adminShippingFee, setAdminShippingFee] = useState<number>(0);
  const [shippingFeeOption, setShippingFeeOption] = useState<"included" | "separate_cod">("included");
  const [customDepositInput, setCustomDepositInput] = useState<string>("");
  const [isManagerApproved, setIsManagerApproved] = useState<boolean>(false);

  // Accounting, reports & operations states
  const [accountingOverview, setAccountingOverview] = useState<AccountingOverview | null>(null);
  const [accountingJournalEntries, setAccountingJournalEntries] = useState<JournalEntryDetail[]>([]);
  const [isAccountingLoading, setIsAccountingLoading] = useState<boolean>(false);
  const [isAccountingJournalLoading, setIsAccountingJournalLoading] = useState<boolean>(false);
  const [accountingError, setAccountingError] = useState<string>("");

  const [reportsOverview, setReportsOverview] = useState<AdminReportsOverview | null>(null);
  const [isReportsLoading, setIsReportsLoading] = useState<boolean>(false);
  const [reportsError, setReportsError] = useState<string>("");

  const [operationsOverview, setOperationsOverview] = useState<OperationsOverview | null>(null);
  const [isOperationsLoading, setIsOperationsLoading] = useState<boolean>(false);
  const [operationsError, setOperationsError] = useState<string>("");

  // Customer Shopping Cart state
  const [cartItems, setCartItems] = useState<CustomerOrder["items"]>([]);

  // Customer info & Profile states
  const [recipientName, setRecipientName] = useState<string>("");
  const [recipientPhone, setRecipientPhone] = useState<string>("");
  const [recipientAddress, setRecipientAddress] = useState<string>("");
  const [profileFullName, setProfileFullName] = useState<string>("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string>("");
  const [profileNewPassword, setProfileNewPassword] = useState<string>("");

  // Modals state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariantSku, setSelectedVariantSku] = useState<string>("");
  const [modalQty, setModalQty] = useState<number>(1);
  const [selectedMainImage, setSelectedMainImage] = useState<string>("");
  const [showCheckoutModal, setShowCheckoutModal] = useState<boolean>(false);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [loginEmail, setLoginEmail] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");

  // Chat/Comment states
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [chatInput, setChatInput] = useState<string>("");
  const [isInternalComment, setIsInternalComment] = useState<boolean>(false);

  // --- REFERENCES ---
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Compute states
  const isLoggedIn = currentUser !== null;
  const isAdmin = currentUser?.isAdmin || false;

  const isAnyModalOpen = Boolean(
    selectedProduct ||
    showCheckoutModal ||
    showLoginModal
  );

  // Lock status helper
  const isOrderFrozen = useMemo(() => {
    if (!workingOrder?.id) return false;
    const isOwner = workingOrder.assignedStaffId === currentUser?.id;
    const isSuperAdmin = currentUser?.role === "super_admin";
    if (workingOrder.assignedStaffId && !isOwner && !isSuperAdmin) {
      return true; // Frozen if locked by another operator
    }
    return ["locked", "completed"].includes(workingOrder.commercialStatus);
  }, [workingOrder, currentUser]);

  const requiresManagerApproval = useMemo(() => {
    const defaultDep = workingOrder.quoteVersions.length > 0 ? workingOrder.quoteVersions[workingOrder.quoteVersions.length - 1].subtotal * adminPolicy.defaultDepositRate : 0;
    const isDiscountOver = adminDiscount > (workingOrder.quoteVersions.length > 0 ? workingOrder.quoteVersions[workingOrder.quoteVersions.length - 1].subtotal * adminPolicy.maxOperatorDiscountRate : 0);
    const isTotalOver = adminDiscount > adminPolicy.requireManagerApprovalAbove;
    return isDiscountOver || isTotalOver;
  }, [adminDiscount, workingOrder.quoteVersions, adminPolicy]);

  // Persist cart to localStorage per user
  const cartStorageKey = currentUser ? `ptw_cart_${currentUser.id}` : null;

  useEffect(() => {
    if (!cartStorageKey) return;
    if (cartItems.length > 0) {
      localStorage.setItem(cartStorageKey, JSON.stringify(cartItems));
    } else {
      localStorage.removeItem(cartStorageKey);
    }
  }, [cartItems, cartStorageKey]);

  // Initialize smooth scroll & load user profile on mount
  useEffect(() => {
    const lenis = new Lenis({ duration: 1.2, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    // Fetch initial user
    async function loadUser() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data.user);
          setMode(data.user.isAdmin ? "admin" : "customer");
          // Restore user's cart from localStorage
          const savedCart = localStorage.getItem(`ptw_cart_${data.user.id}`);
          if (savedCart) {
            try {
              setCartItems(JSON.parse(savedCart));
            } catch { /* silent */ }
          }
        }
      } catch { /* silent */ }
    }
    loadUser();

    return () => {
      lenis.destroy();
    };
  }, []);

  // Sync window overflow on modal open
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.style.overflow = isAnyModalOpen ? "hidden" : "";
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.style.overflow = "";
      }
    };
  }, [isAnyModalOpen]);

  // Auto scroll chat to bottom
  useEffect(() => {
    if (isChatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [workingOrder.comments, isChatOpen]);

  // --- API FETCH HELPERS (useCallback to prevent re-creation) ---
  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/products");
      const data = await res.json();
      setAllProducts(data.products ?? []);
    } catch { /* silent */ }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders");
      if (!res.ok) return;
      const data = await res.json();
      setAllOrders(data.orders ?? []);
      if (data.orders?.length > 0) {
        const firstOrder = data.orders[0];
        if (!selectedOrderId) {
          setSelectedOrderId(firstOrder.id);
          setWorkingOrder(firstOrder);
          setCartItems(firstOrder.items?.map((item: OrderItem) => ({ ...item })) ?? []);
        }
      }
    } catch { /* silent */ }
  }, [selectedOrderId]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories");
      if (!res.ok) return;
      const data = await res.json();
      setAllCategories(data.categories ?? []);
    } catch { /* silent */ }
  }, []);

  const fetchAdminData = useCallback(async () => {
    try {
      const [suppRes, polRes] = await Promise.all([
        fetch("/api/suppliers"),
        fetch("/api/admin/policy")
      ]);
      if (suppRes.ok) {
        const suppData = await suppRes.json();
        setSuppliers(suppData.suppliers ?? []);
      }
      if (polRes.ok) {
        const polData = await polRes.json();
        setAdminPolicy(polData.adminPolicy ?? DEFAULT_POLICY);
        setRolePermissions(polData.rolePermissions ?? {} as Record<RoleKey, PermissionKey[]>);
      }
    } catch { /* silent */ }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUserList(data.users ?? []);
      }
    } catch { /* silent */ }
  }, []);

  const fetchPromotions = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/promotions");
      if (res.ok) {
        const data = await res.json();
        if (data.policy) {
          setPromotionsPolicy(data.policy);
          setAdminPolicy({
            freeShippingThreshold: data.policy.freeShippingThreshold,
            defaultDepositRate: data.policy.defaultDepositRate,
            maxOperatorDiscountRate: data.policy.maxOperatorDiscountRate,
            requireManagerApprovalAbove: data.policy.requireManagerApprovalAbove
          });
        }
      }
    } catch { /* silent */ }
  }, []);

  const fetchAccountingOverview = useCallback(async () => {
    setIsAccountingLoading(true);
    setAccountingError("");
    try {
      const res = await fetch("/api/accounting/overview");
      const data = await res.json();
      if (!res.ok) {
        setAccountingOverview(null);
        setAccountingError(data.error || "Không thể tải dữ liệu kế toán.");
        return;
      }
      setAccountingOverview(data.overview);
    } catch {
      setAccountingError("Lỗi kết nối máy chủ kế toán.");
    } finally {
      setIsAccountingLoading(false);
    }
  }, []);

  const fetchAccountingJournalEntries = useCallback(async () => {
    setIsAccountingJournalLoading(true);
    try {
      const res = await fetch("/api/accounting/journal-entries");
      if (res.ok) {
        const data = await res.json();
        setAccountingJournalEntries(data.entries ?? []);
      }
    } catch { /* silent */ }
    finally {
      setIsAccountingJournalLoading(false);
    }
  }, []);

  const fetchReportsOverview = useCallback(async () => {
    setIsReportsLoading(true);
    setReportsError("");
    try {
      const res = await fetch("/api/admin/reports/overview");
      const data = await res.json();
      if (!res.ok) {
        setReportsOverview(null);
        setReportsError(data.error || "Không thể tải báo cáo.");
        return;
      }
      setReportsOverview(data.overview);
    } catch {
      setReportsError("Lỗi kết nối máy chủ báo cáo.");
    } finally {
      setIsReportsLoading(false);
    }
  }, []);

  const fetchOperationsOverview = useCallback(async () => {
    setIsOperationsLoading(true);
    setOperationsError("");
    try {
      const res = await fetch("/api/admin/operations/overview");
      const data = await res.json();
      if (!res.ok) {
        setOperationsOverview(null);
        setOperationsError(data.error || "Không thể tải dữ liệu kho.");
        return;
      }
      setOperationsOverview(data.overview);
    } catch {
      setOperationsError("Lỗi kết nối máy chủ kho.");
    } finally {
      setIsOperationsLoading(false);
    }
  }, []);

  // Fetch standard public catalog data on start
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProducts();
    fetchCategories();
  }, [fetchProducts, fetchCategories]);

  // Fetch admin-level config data when logged in as admin
  useEffect(() => {
    if (isLoggedIn && isAdmin) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchAdminData();
      fetchOrders();
      fetchUsers();
      fetchPromotions();
      fetchAccountingOverview();
      fetchAccountingJournalEntries();
      fetchReportsOverview();
      fetchOperationsOverview();
    } else if (isLoggedIn && !isAdmin) {
      fetchOrders();
    }
  }, [isLoggedIn, isAdmin, fetchAdminData, fetchOrders, fetchUsers, fetchPromotions, fetchAccountingOverview, fetchAccountingJournalEntries, fetchReportsOverview, fetchOperationsOverview]);

  // Helpers for variant SKU generation
  function buildVariantSku(code: string, label: string, index: number): string {
    const cleanLabel = label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "-")
      .replace(/^-+|-+$/g, "")
      .toUpperCase();
    const cleanCode = code.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    return `${cleanCode}${cleanLabel ? `-${cleanLabel}` : `-${index + 1}`}`;
  }

  function syncVariantSkus(code: string, variants: ProductVariant[]): ProductVariant[] {
    return variants.map((variant, index) => ({
      ...variant,
      sku: buildVariantSku(code, variant.label, index)
    }));
  }

  // Set selected order for processing
  const selectOrder = (orderId: string) => {
    const order = allOrders.find((o) => o.id === orderId);
    if (order) {
      setSelectedOrderId(orderId);
      setWorkingOrder(order);
      setAdminOrderItems(order.items.map((i) => ({ ...i })));
      setIsOrderModified(false);
      // Fill current custom inputs
      const quote = order.quoteVersions[order.quoteVersions.length - 1];
      if (quote) {
        const discountAdjustment = quote.adjustments.find((a) => a.type === "discount");
        const shipAdjustment = quote.adjustments.find((a) => a.type === "shipping_fee");
        setAdminDiscount(discountAdjustment ? Math.abs(discountAdjustment.amount) : 0);
        setAdminShippingFee(shipAdjustment ? shipAdjustment.amount : 0);
        setShippingFeeOption(shipAdjustment && shipAdjustment.amount === 0 ? "separate_cod" : "included");
        setCustomDepositInput(quote.depositAmount ? String(quote.depositAmount) : "");
      }
      setIsManagerApproved(false);
    }
  };

  // Sync mutated order state back to server database
  async function syncOrder(updatedOrder: CustomerOrder) {
    try {
      const res = await fetch(`/api/orders?id=${updatedOrder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedOrder)
      });
      if (res.ok) {
        setWorkingOrder(updatedOrder);
        setAllOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));
      } else {
        alert("Không thể lưu trạng thái đơn hàng vào cơ sở dữ liệu.");
      }
    } catch {
      alert("Lỗi kết nối máy chủ khi lưu đơn.");
    }
  }

  // --- ACTIONS & OPERATION HANDLERS ---

  async function handleCredentialsLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      const preflight = loginPasswordSchema.safeParse(loginPassword);
      if (!preflight.success) {
        alert("Mật khẩu không hợp lệ.");
        setIsLoading(false);
        return;
      }
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailSchema.parse(loginEmail), password: preflight.data })
      });
      const text = await res.text();
      let data: { error?: string; user?: ApiUser } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        alert(`Lỗi máy chủ (${res.status}): Không nhận được phản hồi hợp lệ từ hệ thống.`);
        setIsLoading(false);
        return;
      }
      if (!res.ok) {
        alert(data.error || "Sai tên đăng nhập hoặc mật khẩu.");
        setIsLoading(false);
        return;
      }
      if (!data.user) {
        alert("Du lieu nguoi dung tu may chu khong hop le.");
        setIsLoading(false);
        return;
      }
      setCurrentUser(data.user);
      setMode(data.user.isAdmin ? "admin" : "customer");
      setActiveTab("catalog");
      setShowLoginModal(false);
      setLoginEmail("");
      setLoginPassword("");
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error("Lá»—i káº¿t ná»‘i mÃ¡y chá»§.");
      alert(`Lỗi đăng nhập: ${err.message || "Lỗi kết nối máy chủ."}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    if (currentUser) {
      localStorage.removeItem(`ptw_cart_${currentUser.id}`);
    }
    await fetch("/api/auth/me", { method: "DELETE" });
    setMode("guest");
    setCurrentUser(null);
    setCartItems([]);
    setWorkingOrder(EMPTY_ORDER);
    setSelectedOrderId(null);
    setActiveTab("catalog");
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload: ProfileUpdatePayload = {};
      if (profileFullName.trim()) payload.fullName = fullNameSchema.parse(profileFullName);
      if (profileAvatarUrl.trim()) payload.avatarUrl = optionalUrlSchema.parse(profileAvatarUrl);
      if (profileNewPassword && profileNewPassword.length < 12) {
        alert("Mật khẩu mới phải có ít nhất 12 ký tự.");
        return;
      }
      if (profileNewPassword) payload.newPassword = passwordSchema.parse(profileNewPassword);

      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Lỗi cập nhật.");
        return;
      }
      alert("Cập nhật tài khoản thành công!");
      if (currentUser) {
        setCurrentUser({
          ...currentUser,
          name: profileFullName.trim() || currentUser.name
        });
      }
      setProfileNewPassword("");
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error("KhÃ´ng thá»ƒ cáº­p nháº­t há»“ sÆ¡.");
      alert(`Lỗi cập nhật: ${err.message}`);
    }
  }

  // Adjust order items qty directly in admin panel
  function handleAdminQtyChange(itemId: string, nextQty: number) {
    if (isOrderFrozen) return;
    const cleanQty = Math.max(0, Math.min(10000, nextQty));
    const nextItems = adminOrderItems
      .map((item) => (item.id === itemId ? { ...item, quantity: cleanQty } : item))
      .filter((item) => item.quantity > 0);
    setAdminOrderItems(nextItems);
    setIsOrderModified(true);
  }

  // Publish quote to customer for acceptance
  async function handlePublishQuote() {
    if (!workingOrder?.id) return;
    try {
      const subtotal = adminOrderItems.reduce((sum, item) => sum + item.quantity * item.unitPriceSnapshot, 0);
      const adjustments = [];
      if (adminDiscount > 0) {
        adjustments.push({
          id: `adj_dis_${Date.now()}`,
          type: "discount" as const,
          label: "Chiết khấu giảm giá sỉ",
          amount: -adminDiscount,
          requiresApproval: requiresManagerApproval
        });
      }
      if (adminShippingFee > 0 && shippingFeeOption === "included") {
        adjustments.push({
          id: `adj_ship_${Date.now()}`,
          type: "shipping_fee" as const,
          label: "Phí giao hàng sỉ",
          amount: adminShippingFee,
          requiresApproval: false
        });
      }

      const finalTotal = subtotal - adminDiscount + (shippingFeeOption === "included" ? adminShippingFee : 0);
      const depositRate = promotionsPolicy.defaultDepositRate;
      const depositAmount = customDepositInput.trim() ? Math.round(Number(customDepositInput)) : Math.round(finalTotal * depositRate);
      const codRemaining = finalTotal - depositAmount;

      const nextVersion = workingOrder.quoteVersions.length + 1;
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

      const updatedOrder: CustomerOrder = {
        ...workingOrder,
        commercialStatus: "quoted",
        items: adminOrderItems.map((item) => ({ ...item })),
        quoteVersions: [...workingOrder.quoteVersions.map((q) => ({ ...q, status: "superseded" as const })), newQuote],
        comments: [
          {
            id: `c_pub_${Date.now()}`,
            author: currentUser?.name || "Operator",
            audience: "customer_visible",
            message: `Nhân viên đã thẩm định chi phí sỉ. Bản báo giá số ${nextVersion} đã phát hành: Giá sỉ ${formatVnd(subtotal)}, giảm giá ${formatVnd(adminDiscount)}, phí ship ${formatVnd(shippingFeeOption === "included" ? adminShippingFee : 0)}. Tổng giá trị đơn: ${formatVnd(finalTotal)}. Tiền cọc tối thiểu: ${formatVnd(depositAmount)}.`,
            createdAt: new Date().toISOString()
          },
          ...workingOrder.comments
        ],
        updatedAt: new Date().toISOString()
      };

      await syncOrder(updatedOrder);
      setIsOrderModified(false);
      setIsManagerApproved(false);
      alert("Đã phát hành báo giá chính thức cho đại lý!");
    } catch {
      alert("Không thể phát hành báo giá.");
    }
  }

  // Accept payment/deposit proof and confirm money in bank
  async function confirmDeposit() {
    if (!workingOrder?.id) return;
    const isDeposit = workingOrder.paymentStatus === "deposit_uploaded";
    const currentQuote = workingOrder.quoteVersions[workingOrder.quoteVersions.length - 1];
    if (!currentQuote) return;

    const updatedProofs = workingOrder.paymentProofs.map((p, idx) => (idx === 0 ? { ...p, status: "accepted" as const } : p));
    const nextPaymentStatus = isDeposit ? "deposit_confirmed" : "paid";
    const nextCommercialStatus = isDeposit ? "customer_accepted" : "locked";

    const updatedOrder: CustomerOrder = {
      ...workingOrder,
      commercialStatus: nextCommercialStatus,
      paymentStatus: nextPaymentStatus,
      paymentProofs: updatedProofs,
      comments: [
        {
          id: `c_dep_${Date.now()}`,
          author: currentUser?.name || "Kế toán",
          audience: "customer_visible",
          message: `Kế toán đã đối soát ngân hàng thành công. Xác nhận nhận đủ số tiền: ${formatVnd(isDeposit ? currentQuote.depositAmount : currentQuote.finalTotal - currentQuote.depositAmount)}. Hóa đơn đang chuẩn bị xuất kho.`,
          createdAt: new Date().toISOString()
        },
        ...workingOrder.comments
      ],
      updatedAt: new Date().toISOString()
    };

    await syncOrder(updatedOrder);
    alert("Xác nhận đã khớp tiền trong tài khoản ngân hàng!");
  }

  // Attach GHN shipment details to order
  async function attachShipment() {
    if (!workingOrder?.id) return;
    const timeSuffix = new Date().toISOString().replace(/[^0-9]/g, "").slice(8, 14);
    const trackingCode = `GHN-PTW-${workingOrder.number}-${timeSuffix}`.toUpperCase();

    const updatedOrder: CustomerOrder = {
      ...workingOrder,
      fulfillmentStatus: "shipped",
      shipment: {
        carrier: "Giao Hàng Nhanh (GHN Express)",
        trackingCode,
        shippingFee: workingOrder.quoteVersions[workingOrder.quoteVersions.length - 1]?.adjustments.find(a => a.type === "shipping_fee")?.amount || 0,
        eta: "2-3 ngày làm việc",
        note: "Đã giao cho bưu tá GHN đóng gói, vận chuyển sỉ."
      },
      comments: [
        {
          id: `c_ship_${Date.now()}`,
          author: "Hệ thống",
          audience: "customer_visible",
          message: `Đơn sỉ đã bàn giao đơn vị vận chuyển GHN Express thành công. Mã vận đơn: ${trackingCode}.`,
          createdAt: new Date().toISOString()
        },
        ...workingOrder.comments
      ],
      updatedAt: new Date().toISOString()
    };

    await syncOrder(updatedOrder);
    alert(`Đã bàn giao GHN Express! Mã vận đơn: ${trackingCode}`);
  }

  // Handle warehouse stock reservation actions
  async function handleStockReservationAction(action: string) {
    if (!workingOrder?.id) return;
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const reasonMap: Record<string, string> = {
      reserve_order: "Giữ chỗ kho tự động 72h cho đơn đại lý.",
      release_order: "Nhả giữ hàng thủ công giải phóng tồn kho.",
      expire_order: "Bút toán giữ hàng đã hết hiệu lực 72h.",
      consume_order: "Xuất kho thực tế hoàn tất đơn sỉ."
    };

    try {
      const res = await fetch("/api/admin/operations/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          orderId: workingOrder.id,
          expiresAt,
          reason: reasonMap[action]
        })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Không thể xử lý giữ hàng.");
        return;
      }
      await Promise.all([fetchOperationsOverview(), fetchReportsOverview()]);
      alert(`Đã xử lý giữ hàng: ${data.result?.status || "ok"} (${data.result?.lineCount ?? 0} dòng).`);
    } catch {
      alert("Không thể kết nối máy chủ khi xử lý giữ hàng.");
    }
  }

  // Record accounting journal entries on server
  async function handlePostOrderAccounting(action: "post_all" | "post_confirmed_payments") {
    if (!workingOrder?.id) return;
    try {
      const res = await fetch("/api/admin/accounting/order-posting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: workingOrder.id,
          mode: action,
          vatRateBps: 0,
          requireConsumedStock: action !== "post_confirmed_payments"
        })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Không thể ghi sổ kế toán cho đơn hàng.");
        return;
      }
      await Promise.all([fetchAccountingOverview(), fetchAccountingJournalEntries(), fetchReportsOverview()]);
      alert(`Đã ghi sổ: ${data.result?.createdEntries ?? 0} bút toán mới, ${data.result?.skippedEntries ?? 0} đã tồn tại.`);
    } catch {
      alert("Không thể kết nối máy chủ khi ghi sổ kế toán.");
    }
  }

  // --- SHOPPING CART HANDLERS ---

  function addToCart(variantSku: string, productCode: string, productName: string, variantLabel: string, price: number, supplierId: string, qty: number = 1) {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.variantSku === variantSku);
      if (existing) {
        return prev.map((item) => (item.variantSku === variantSku ? { ...item, quantity: item.quantity + qty } : item));
      }
      return [
        ...prev,
        {
          id: `item_${Date.now()}`,
          productCode,
          productName,
          variantSku,
          variantLabel,
          quantity: qty,
          unitPriceSnapshot: price,
          supplierId
        }
      ];
    });
  }

  function updateCartQty(sku: string, delta: number) {
    setCartItems((prev) =>
      prev
        .map((item) => (item.variantSku === sku ? { ...item, quantity: Math.max(0, Math.min(10000, item.quantity + delta)) } : item))
        .filter((item) => item.quantity > 0)
    );
  }

  function removeCartItem(sku: string) {
    setCartItems((prev) => prev.filter((item) => item.variantSku !== sku));
  }

  async function handleSubmitCartProposal() {
    try {
      if (cartItems.length === 0) throw new Error("Giỏ hàng chưa có sản phẩm.");
      cartItems.forEach((item) => {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 10000) {
          throw new Error(`Số lượng của ${item.productName} phải từ 1 đến 10.000.`);
        }
        vndAmountSchema("Đơn giá").parse(item.unitPriceSnapshot);
      });
    } catch (error) {
      alert(getValidationErrorMessage(error, "Dữ liệu giỏ hàng không hợp lệ."));
      return;
    }

    const subtotal = cartItems.reduce((sum, item) => sum + item.quantity * item.unitPriceSnapshot, 0);
    const isDeposit = workingOrder.paymentIntent === "deposit_cod";
    const initialDeposit = isDeposit ? Math.round(subtotal * adminPolicy.defaultDepositRate) : subtotal;

    if (workingOrder.id !== "") {
      const nextVersion = workingOrder.quoteVersions.length + 1;
      const nextQuote = {
        id: `q_${nextVersion}_${Date.now()}`,
        version: nextVersion,
        status: "published" as const,
        subtotal,
        adjustments: [],
        finalTotal: subtotal,
        depositAmount: initialDeposit,
        codRemaining: isDeposit ? subtotal - initialDeposit : 0,
        shippingFeeOption: "included" as const,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };

      const updatedOrder: CustomerOrder = {
        ...workingOrder,
        commercialStatus: "submitted",
        items: cartItems.map((item) => ({ ...item })),
        quoteVersions: [...workingOrder.quoteVersions.map((q) => ({ ...q, status: "superseded" as const })), nextQuote],
        comments: [
          {
            id: `c_sub_${Date.now()}`,
            author: workingOrder.customerName,
            audience: "customer_visible",
            message: `Đại lý đã gửi danh sách đề xuất cập nhật đơn hàng sỉ mới (lần ${nextVersion}). Vui lòng thẩm định báo giá mới.`,
            createdAt: new Date().toISOString()
          },
          ...workingOrder.comments
        ],
        updatedAt: new Date().toISOString()
      };

      await syncOrder(updatedOrder);
      setActiveTab("order");
    } else {
      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: cartItems.map((item) => ({ ...item })),
            paymentIntent: workingOrder.paymentIntent,
            recipientName,
            recipientPhone,
            recipientAddress
          })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          alert(errData?.error || "Không thể tạo đơn hàng. Vui lòng thử lại.");
          return;
        }
        const data = (await res.json()) as OrderMutationResponse;
        setWorkingOrder(data.order);
        setAllOrders((prev) => [data.order, ...prev]);
        setSelectedOrderId(data.order.id);
        setCartItems(data.order.items.map((item) => ({ ...item })));
        setActiveTab("order");
      } catch {
        alert("Lỗi kết nối. Vui lòng kiểm tra mạng và thử lại.");
      }
    }
  }

  async function handleBuyMore() {
    setCartItems(workingOrder.items.map((item) => ({ ...item })));
    setActiveTab("catalog");
    const updatedOrder: CustomerOrder = {
      ...workingOrder,
      commercialStatus: "draft",
      updatedAt: new Date().toISOString()
    };
    await syncOrder(updatedOrder);
  }

  async function handleConfirmCheckout() {
    if (!recipientName || !recipientPhone || !recipientAddress) {
      alert("Vui lòng điền đầy đủ thông tin giao nhận hàng.");
      return;
    }

    const recipientValidation = recipientSchema.safeParse({ recipientName, recipientPhone, recipientAddress });
    if (!recipientValidation.success) {
      alert(getValidationErrorMessage(recipientValidation.error, "Thông tin giao nhận không hợp lệ."));
      return;
    }

    const activeQuote = workingOrder.quoteVersions[workingOrder.quoteVersions.length - 1];
    if (!activeQuote) return;

    const isDeposit = workingOrder.paymentIntent === "deposit_cod";
    const reqAmount = isDeposit ? activeQuote.depositAmount : activeQuote.finalTotal;

    const timeSuffix = new Date().toISOString().replace(/[^0-9]/g, "").slice(8, 14);
    const reference = `PTW-${workingOrder.number}-Q${activeQuote.version}-${isDeposit ? "DEP" : "FULL"}-${timeSuffix}`.toUpperCase();

    const qrPayload = `PETTRAVEL_WHOLESALE_PAYMENT|account=190356782390|name=PET TRAVEL WHOLESALE|amount=${reqAmount}|reference=${reference}`;

    const newRequest = {
      id: `pay_req_${Date.now()}`,
      quoteVersion: activeQuote.version,
      amount: reqAmount,
      purpose: (isDeposit ? "deposit" : "full") as "deposit" | "full",
      reference,
      qrPayload,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      status: "active" as const
    };

    const updatedRequests = workingOrder.paymentRequests.map((req) =>
      req.status === "active" ? { ...req, status: "superseded" as const } : req
    );

    const updatedOrder: CustomerOrder = {
      ...workingOrder,
      recipientName: recipientValidation.data.recipientName,
      recipientPhone: recipientValidation.data.recipientPhone,
      recipientAddress: recipientValidation.data.recipientAddress,
      commercialStatus: "locked",
      paymentStatus: isDeposit ? "deposit_uploaded" : "full_uploaded",
      paymentRequests: [...updatedRequests, newRequest],
      paymentProofs: [
        {
          id: `proof_${Date.now()}`,
          paymentRequestId: newRequest.id,
          fileName: "bien-lai-chuyen-khoan-dai-ly.jpg",
          uploadedAt: new Date().toISOString(),
          status: "pending_admin_confirmation" as const
        },
        ...workingOrder.paymentProofs
      ],
      comments: [
        {
          id: `c_chk_${Date.now()}`,
          author: "Hệ thống",
          audience: "customer_visible",
          message: `Đại lý đã khóa đơn để thanh toán. Người nhận: ${recipientName} (${recipientPhone}) - ${recipientAddress}. Số tiền chuyển khoản: ${formatVnd(reqAmount)}.`,
          createdAt: new Date().toISOString()
        },
        ...workingOrder.comments
      ],
      updatedAt: new Date().toISOString()
    };

    await syncOrder(updatedOrder);
    setShowCheckoutModal(false);
  }

  // Simulate proof upload (stub)
  async function simulateProofUpload() {
    if (!workingOrder?.id) return;
    const isDeposit = workingOrder.paymentStatus.includes("unrequested") || workingOrder.paymentStatus === "unrequested";
    const nextStatus = isDeposit ? "deposit_uploaded" : "full_uploaded";

    const updatedOrder: CustomerOrder = {
      ...workingOrder,
      paymentStatus: nextStatus,
      comments: [
        {
          id: `c_sim_${Date.now()}`,
          author: workingOrder.customerName,
          audience: "customer_visible",
          message: `Đại lý đã gửi tải lên chứng từ biên lai giao dịch thành công.`,
          createdAt: new Date().toISOString()
        },
        ...workingOrder.comments
      ],
      updatedAt: new Date().toISOString()
    };

    await syncOrder(updatedOrder);
    alert("Đã mô phỏng tải biên lai chuyển khoản sỉ thành công!");
  }

  // Chat message creation
  async function addComment(audience: "customer_visible" | "internal", message: string) {
    if (!workingOrder?.id || !message.trim()) return;

    const newComment = {
      id: `c_msg_${Date.now()}`,
      author: currentUser?.name || "Khách",
      audience,
      message: message.trim(),
      createdAt: new Date().toISOString()
    };

    const updatedOrder: CustomerOrder = {
      ...workingOrder,
      comments: [newComment, ...workingOrder.comments],
      updatedAt: new Date().toISOString()
    };

    await syncOrder(updatedOrder);
  }

  // Filter products for Catalog view
  const filteredProducts = useMemo(() => {
    return allProducts.filter((p) => {
      const matchCat = categoryFilter === "Tất cả" || p.category === categoryFilter;
      const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.code.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [allProducts, categoryFilter, searchQuery]);

  return (
    <main className="app-shell">
      {/* 1. SIDEBAR NAVIGATION */}
      <Sidebar
        isLoggedIn={isLoggedIn}
        activeUser={currentUser}
        activeTab={activeTab}
        mode={mode}
        cartItemsCount={cartItems.length}
        cartTotalVal={cartItems.reduce((sum, item) => sum + item.quantity * item.unitPriceSnapshot, 0)}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        setActiveTab={setActiveTab}
        handleLogout={handleLogout}
        setShowLoginModal={setShowLoginModal}
        fetchUsers={fetchUsers}
        fetchPromotions={fetchPromotions}
        fetchReportsOverview={fetchReportsOverview}
        fetchOperationsOverview={fetchOperationsOverview}
        fetchAccountingOverview={fetchAccountingOverview}
        fetchAccountingJournalEntries={fetchAccountingJournalEntries}
      />

      {/* 2. MAIN APPLICATION CONTENT */}
      <section className="main-area">
        {/* Top bar header */}
        <Topbar
          isLoggedIn={isLoggedIn}
          activeUser={currentUser}
          isAdmin={isAdmin}
          mode={mode}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          cartTotalVal={cartItems.reduce((sum, item) => sum + item.quantity * item.unitPriceSnapshot, 0)}
          setIsSidebarOpen={setIsSidebarOpen}
          setShowLoginModal={setShowLoginModal}
          setActiveTab={setActiveTab}
        />

        {/* --- PAGE TABS ROUTING --- */}

        {/* CUSTOMER TABS */}
        {activeTab === "catalog" && (
          <Catalog
            products={allProducts}
            availableCategories={allCategories}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            searchQuery={searchQuery}
            isLoggedIn={isLoggedIn}
            onSelectProduct={(product) => {
              setSelectedProduct(product);
              setSelectedVariantSku(product.variants[0]?.sku || "");
              setModalQty(1);
              setSelectedMainImage("");
            }}
          />
        )}

        {activeTab === "cart" && mode === "customer" && (
          <Cart
            cartItems={cartItems}
            allProducts={allProducts}
            availableCategories={allCategories}
            cartCategoryFilter={cartCategoryFilter}
            setCartCategoryFilter={setCartCategoryFilter}
            cartTotalVal={cartItems.reduce((sum, item) => sum + item.quantity * item.unitPriceSnapshot, 0)}
            workingOrder={workingOrder}
            changePaymentIntent={(intent) => {
              setWorkingOrder((prev) => ({
                ...prev,
                paymentIntent: intent
              }));
            }}
            updateCartQty={updateCartQty}
            removeCartItem={removeCartItem}
            onSubmitCartProposal={handleSubmitCartProposal}
            showCheckoutModal={showCheckoutModal}
            setShowCheckoutModal={setShowCheckoutModal}
            recipientName={recipientName}
            setRecipientName={setRecipientName}
            recipientPhone={recipientPhone}
            setRecipientPhone={setRecipientPhone}
            recipientAddress={recipientAddress}
            setRecipientAddress={setRecipientAddress}
            onConfirmCheckout={handleConfirmCheckout}
          />
        )}

        {activeTab === "order" && (
          <OrderTimeline
            isLoggedIn={isLoggedIn}
            mode={mode}
            workingOrder={workingOrder}
            currentUser={currentUser}
            onPayNowClick={() => {
              setRecipientName(currentUser?.name || "");
              setRecipientPhone("");
              setRecipientAddress(workingOrder.recipientAddress || "");
              setShowCheckoutModal(true);
            }}
            onBuyMore={handleBuyMore}
            onUploadProof={simulateProofUpload}
          />
        )}

        {activeTab === "profile" && isLoggedIn && !isAdmin && (
          <div className="flex flex-col gap-6 animate-fade-in w-full text-xs">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Profile setup form */}
              <div className="panel flex flex-col gap-4 bg-white border border-orange-100 rounded-3xl p-6">
                <h3 className="text-lg font-bold text-[#331B08] flex items-center gap-2 font-['Varela_Round']">
                  Thông tin cá nhân & Bảo mật
                </h3>
                <p className="muted text-xs font-semibold">Cập nhật họ tên đối tác, ảnh đại diện và thay đổi mật khẩu đăng nhập cổng sỉ.</p>

                <form onSubmit={handleUpdateProfile} className="flex flex-col gap-4 mt-2">
                  <div className="flex items-center gap-4 py-2 border-b border-orange-100/50">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-orange-50 border-2 border-orange-200 flex items-center justify-center text-xl font-bold text-orange-600 shrink-0">
                      {profileAvatarUrl ? (
                        <img src={profileAvatarUrl} alt="Avatar" className="object-cover w-full h-full" />
                      ) : (
                        currentUser?.name?.charAt(0) || "U"
                      )}
                    </div>
                    <div className="flex flex-col gap-1 w-full font-semibold">
                      <label className="text-[10px] font-bold text-orange-950/70 uppercase">URL ảnh đại diện</label>
                      <input
                        type="url"
                        className="text-input text-xs py-1.5 px-3 w-full"
                        placeholder="https://..."
                        value={profileAvatarUrl}
                        onChange={(e) => setProfileAvatarUrl(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 font-semibold">
                    <label className="text-[10px] font-bold text-orange-950/80 uppercase">Họ và Tên</label>
                    <input
                      type="text"
                      className="text-input text-sm py-2 px-3"
                      value={profileFullName}
                      onChange={(e) => setProfileFullName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 font-semibold">
                    <label className="text-[10px] font-bold text-orange-950/80 uppercase">Mật khẩu mới (Bỏ trống nếu không đổi)</label>
                    <input
                      type="password"
                      className="text-input text-sm py-2 px-3"
                      placeholder="••••••••"
                      value={profileNewPassword}
                      onChange={(e) => setProfileNewPassword(e.target.value)}
                      minLength={12}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 text-xs text-[#331B08]/60 font-medium">
                    <div className="flex justify-between">
                      <span>Email sỉ:</span>
                      <strong className="text-orange-950 font-bold">{currentUser?.email}</strong>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span>Tổ chức đại lý:</span>
                      <strong className="text-orange-950 font-bold">{currentUser?.company}</strong>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="primary-button text-xs py-3 w-full justify-center font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-xl cursor-pointer"
                  >
                    Cập nhật tài khoản
                  </button>
                </form>
              </div>

              {/* Order list history */}
              <div className="panel lg:col-span-2 flex flex-col gap-4 bg-white border border-orange-100 rounded-3xl p-6">
                <h3 className="text-lg font-bold text-[#331B08] flex items-center gap-2 font-['Varela_Round']">
                  Lịch sử Đơn sỉ & Vận chuyển
                </h3>
                <p className="muted text-xs font-semibold">Theo dõi tiến độ duyệt giá, tình trạng cọc VietQR, hóa đơn VAT đỏ và mã vận đơn thực tế của các đơn sỉ.</p>

                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b-2 border-orange-100 text-[10px] font-extrabold uppercase text-[#78350F] tracking-wider">
                        <th className="py-2.5">Mã đơn</th>
                        <th>Ngày tạo</th>
                        <th>Trạng thái duyệt</th>
                        <th>Thanh toán</th>
                        <th className="text-right">Tổng đơn</th>
                        <th className="text-center">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-orange-50/50">
                      {allOrders.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-xs text-gray-500 font-medium">
                            Chưa có đơn sỉ nào được tạo. Quay lại Cửa hàng để lên đơn!
                          </td>
                        </tr>
                      ) : (
                        allOrders.map((ord) => {
                          const quote = ord.quoteVersions[ord.quoteVersions.length - 1] ?? { finalTotal: 0 };
                          return (
                            <tr key={ord.id} className="text-xs hover:bg-orange-50/20">
                              <td className="py-3 font-extrabold text-[#331B08]">{ord.number}</td>
                              <td className="text-gray-500 font-medium">{new Date(ord.updatedAt).toLocaleDateString("vi-VN")}</td>
                              <td>
                                <span
                                  className={`status-pill text-[9px] ${
                                    ord.commercialStatus === "locked"
                                      ? "success"
                                      : ord.commercialStatus === "quoted"
                                        ? "info"
                                        : "warning"
                                  }`}
                                >
                                  {ord.commercialStatus === "submitted"
                                    ? "Chờ duyệt"
                                    : ord.commercialStatus === "quoted"
                                      ? "Đã báo giá"
                                      : ord.commercialStatus === "customer_accepted"
                                        ? "Chờ cọc"
                                        : ord.commercialStatus === "locked"
                                          ? "Đang giao"
                                          : "Hoàn tất"}
                                </span>
                              </td>
                              <td>
                                <span className={`status-pill text-[9px] ${ord.paymentStatus === "paid" ? "success" : "warning"}`}>
                                  {ord.paymentStatus === "paid"
                                    ? "Đã thanh toán"
                                    : ord.paymentStatus === "deposit_confirmed"
                                      ? "Đã cọc 30%"
                                      : ord.paymentStatus.includes("uploaded")
                                        ? "Chờ xác nhận"
                                        : "Chưa cọc"}
                                </span>
                              </td>
                              <td className="text-right font-extrabold text-orange-950">{formatVnd(quote.finalTotal)}</td>
                              <td className="text-center">
                                <button
                                  type="button"
                                  className="text-[10px] font-bold py-1 px-3 bg-orange-100 hover:bg-orange-200 text-orange-850 rounded-lg cursor-pointer transition border border-orange-200"
                                  onClick={() => {
                                    setSelectedOrderId(ord.id);
                                    setWorkingOrder(ord);
                                    setCartItems(ord.items.map((item) => ({ ...item })));
                                    setActiveTab("order");
                                  }}
                                >
                                  Chi tiết & Chat
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ADMIN TABS */}
        {activeTab === "admin" && isAdmin && (
          <AdminOrders
            allOrders={allOrders}
            workingOrder={workingOrder}
            currentUser={currentUser}
            suppliers={suppliers}
            allProducts={allProducts}
            allCategories={allCategories}
            adminDiscount={adminDiscount}
            setAdminDiscount={setAdminDiscount}
            adminShippingFee={adminShippingFee}
            setAdminShippingFee={setAdminShippingFee}
            shippingFeeOption={shippingFeeOption}
            setShippingFeeOption={setShippingFeeOption}
            customDepositInput={customDepositInput}
            setCustomDepositInput={setCustomDepositInput}
            isManagerApproved={isManagerApproved}
            setIsManagerApproved={setIsManagerApproved}
            adminCategoryFilter={adminCategoryFilter}
            setAdminCategoryFilter={setAdminCategoryFilter}
            adminSupplierFilter={adminSupplierFilter}
            setAdminSupplierFilter={setAdminSupplierFilter}
            isOrderModified={isOrderModified}
            isOrderFrozen={isOrderFrozen}
            requiresManagerApproval={requiresManagerApproval}
            selectOrder={selectOrder}
            setSelectedOrderId={setSelectedOrderId}
            setWorkingOrder={setWorkingOrder}
            handleAdminQtyChange={handleAdminQtyChange}
            handlePublishQuote={handlePublishQuote}
            confirmDeposit={confirmDeposit}
            attachShipment={attachShipment}
            handleStockReservationAction={handleStockReservationAction}
            handlePostOrderAccounting={handlePostOrderAccounting}
            addComment={addComment}
          />
        )}

        {["admin_products", "admin_categories", "admin_suppliers", "admin_operations"].includes(activeTab) && isAdmin && (
          <AdminInventory
            activeTab={activeTab}
            isAdmin={isAdmin}
            allProducts={allProducts}
            suppliers={suppliers}
            allCategories={allCategories}
            operationsOverview={operationsOverview}
            isOperationsLoading={isOperationsLoading}
            fetchProducts={fetchProducts}
            fetchSuppliers={fetchAdminData}
            fetchCategories={fetchCategories}
            fetchOperationsOverview={fetchOperationsOverview}
            syncVariantSkus={syncVariantSkus}
          />
        )}

        {["admin_accounting", "admin_invoices", "settings", "admin_promotions"].includes(activeTab) && isAdmin && (
          <AdminAccounting
            activeTab={activeTab}
            isAdmin={isAdmin}
            workingOrder={workingOrder}
            accountingOverview={accountingOverview}
            accountingJournalEntries={accountingJournalEntries}
            isAccountingLoading={isAccountingLoading}
            isAccountingJournalLoading={isAccountingJournalLoading}
            accountingError={accountingError}
            promotionsPolicy={promotionsPolicy}
            setPromotionsPolicy={setPromotionsPolicy}
            fetchAccountingOverview={fetchAccountingOverview}
            fetchAccountingJournalEntries={fetchAccountingJournalEntries}
            fetchPromotions={fetchPromotions}
            rolePermissions={rolePermissions}
            adminPolicy={{
              freeShippingThreshold: promotionsPolicy.freeShippingThreshold,
              defaultDepositRate: promotionsPolicy.defaultDepositRate,
              maxOperatorDiscountRate: promotionsPolicy.maxOperatorDiscountRate,
              requireManagerApprovalAbove: promotionsPolicy.requireManagerApprovalAbove
            }}
          />
        )}

        {activeTab === "admin_reports" && isAdmin && (
          <AdminReports
            isAdmin={isAdmin}
            reportsOverview={reportsOverview}
            isReportsLoading={isReportsLoading}
            reportsError={reportsError}
            fetchReportsOverview={fetchReportsOverview}
          />
        )}

        {activeTab === "admin_users" && isAdmin && (
          <AdminUsers isAdmin={isAdmin} userList={userList} fetchUsers={fetchUsers} />
        )}
      </section>

      {/* 3. CHAT POPUP WITH OPERATOR / CUSTOMER */}
      {isLoggedIn && workingOrder.id && (
        <ChatPopup
          isLoggedIn={isLoggedIn}
          isAdmin={isAdmin}
          workingOrder={workingOrder}
          comments={workingOrder.comments}
          isChatOpen={isChatOpen}
          setIsChatOpen={setIsChatOpen}
          chatInput={chatInput}
          setChatInput={setChatInput}
          isInternalComment={isInternalComment}
          setIsInternalComment={setIsInternalComment}
          onSendComment={(msg, isInt) => addComment(isInt ? "internal" : "customer_visible", msg)}
        />
      )}

      {/* 4. PUBLIC CUTE PRODUCT DETAIL DIALOG */}
      {selectedProduct && (() => {
        const productImages = selectedProduct.images && selectedProduct.images.length > 0 ? selectedProduct.images : [selectedProduct.imageUrl || "/product-food.svg"];
        const variantImages = selectedProduct.variants.map((v) => v.imageUrl).filter((url): url is string => Boolean(url && url.trim().length > 0));
        const productGallery = Array.from(new Set([...productImages, ...variantImages]));
        const currentMainImage = selectedMainImage && productGallery.includes(selectedMainImage) ? selectedMainImage : productGallery[0] || selectedProduct.imageUrl || "/product-food.svg";

        return (
          <div
            className="fixed inset-0 z-1000 overflow-y-auto bg-black/60 backdrop-filter backdrop-blur-sm animate-fade-in flex items-start justify-center p-4 sm:p-6"
            onClick={() => {
              setSelectedProduct(null);
              setSelectedMainImage("");
            }}
          >
            <div
              className="panel max-w-3xl w-full flex flex-col md:flex-row gap-6 p-6 relative bg-[#FFFDF9] animate-scale-in my-4 sm:my-8"
              onClick={(e) => e.stopPropagation()}
              style={{ borderRadius: "1.75rem" }}
            >
              <button
                type="button"
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold hover:bg-orange-200 transition active:scale-90 cursor-pointer"
                onClick={() => {
                  setSelectedProduct(null);
                  setSelectedMainImage("");
                }}
              >
                ✕
              </button>

              <div className="md:w-1/2 flex flex-col gap-3">
                <div className="relative aspect-square w-full rounded-2xl overflow-hidden border border-orange-100 bg-[#FFFBEB] flex items-center justify-center p-4">
                  <img src={currentMainImage} alt={selectedProduct.name} className="w-full h-full object-contain" />
                </div>
                {productGallery.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {productGallery.map((imgUrl, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`w-12 h-12 rounded-xl overflow-hidden border bg-white p-1 shrink-0 cursor-pointer ${
                          currentMainImage === imgUrl ? "border-orange-500 ring-2 ring-orange-200" : "border-orange-100"
                        }`}
                        onClick={() => setSelectedMainImage(imgUrl)}
                      >
                        <img src={imgUrl} alt="" className="w-full h-full object-contain" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="md:w-1/2 flex flex-col justify-between text-xs gap-4">
                <div className="flex flex-col gap-2">
                  <div>
                    <span className="bg-orange-100 text-orange-850 px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase">
                      {selectedProduct.category}
                    </span>
                    <h3 className="text-base font-bold text-[#331B08] mt-1.5 font-['Varela_Round'] leading-snug">
                      {selectedProduct.name}
                    </h3>
                    <p className="font-mono text-[9px] muted m-0 mt-0.5 font-bold">MÃ SẢN PHẨM: {selectedProduct.code}</p>
                  </div>

                  <p className="text-gray-600 m-0 leading-relaxed font-semibold">
                    {selectedProduct.description || "Chưa có mô tả chi tiết cho sản phẩm sỉ này."}
                  </p>

                  <div className="flex flex-col gap-2 border-t border-dashed border-orange-100 pt-3">
                    <label className="text-[10px] font-bold text-orange-950/80 uppercase">Chọn phân loại hàng sỉ:</label>
                    <select
                      className="text-input py-2 px-3 bg-white border border-orange-200 font-bold"
                      value={selectedVariantSku}
                      onChange={(e) => setSelectedVariantSku(e.target.value)}
                    >
                      {selectedProduct.variants.map((v) => (
                        <option key={v.sku} value={v.sku}>
                          {v.label} - {formatVnd(v.wholesalePrice)} / MOQ: {v.minOrderQty} (Kho: {v.stock})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-3.5 border-t border-dashed border-orange-100 pt-3.5 mt-auto">
                  {(() => {
                    const activeVariant = selectedProduct.variants.find((v) => v.sku === selectedVariantSku) || selectedProduct.variants[0];
                    if (!activeVariant) return null;

                    const moq = activeVariant.minOrderQty;
                    const stock = activeVariant.stock;

                    return (
                      <>
                        <div className="flex justify-between items-center text-[#331B08]">
                          <span className="font-bold">Đơn giá bán sỉ:</span>
                          <span className="text-base font-extrabold text-orange-600">{formatVnd(activeVariant.wholesalePrice)}</span>
                        </div>

                        {isLoggedIn && mode === "customer" && (
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-orange-950 shrink-0">Số lượng:</span>
                            <div className="flex items-center gap-1 border border-orange-200 rounded-xl p-0.5 bg-orange-50/25 max-w-[110px]">
                              <button
                                type="button"
                                className="w-6 h-6 rounded-full bg-white flex items-center justify-center font-bold text-[#78350F] shadow-sm active:scale-90 cursor-pointer disabled:opacity-40"
                                onClick={() => setModalQty((q) => Math.max(moq, q - 1))}
                              >
                                -
                              </button>
                              <input
                                type="number"
                                className="w-9 text-center font-bold bg-transparent border-0 focus:ring-0 p-0"
                                value={modalQty}
                                onChange={(e) => setModalQty(Math.max(moq, parseInt(e.target.value) || moq))}
                              />
                              <button
                                type="button"
                                className="w-6 h-6 rounded-full bg-white flex items-center justify-center font-bold text-[#78350F] shadow-sm active:scale-90 cursor-pointer disabled:opacity-40"
                                onClick={() => setModalQty((q) => q + 1)}
                              >
                                +
                              </button>
                            </div>
                            <span className="text-[10px] muted font-bold">
                              (MOQ sỉ: {moq} · Kho: {stock})
                            </span>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="tab-button font-bold text-xs py-2.5 px-4 flex-1 justify-center rounded-xl cursor-pointer"
                            onClick={() => {
                              setSelectedProduct(null);
                              setSelectedMainImage("");
                            }}
                          >
                            Quay lại
                          </button>
                          {isLoggedIn && mode === "customer" && (
                            <button
                              type="button"
                              className="primary-button font-bold text-xs py-2.5 px-6 flex-1 justify-center bg-orange-500 text-white rounded-xl cursor-pointer"
                              disabled={stock <= 0}
                              onClick={() => {
                                addToCart(
                                  activeVariant.sku,
                                  selectedProduct.code,
                                  selectedProduct.name,
                                  activeVariant.label,
                                  activeVariant.wholesalePrice,
                                  activeVariant.supplierId || "sup_pettravel",
                                  modalQty
                                );
                                setSelectedProduct(null);
                                setSelectedMainImage("");
                                setActiveTab("cart");
                              }}
                            >
                              🛒 Thêm vào đơn sỉ
                            </button>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 5. CUTE CREDENTIALS LOGIN DIALOG */}
      {showLoginModal && (
        <div
          className="fixed inset-0 z-1000 overflow-y-auto bg-black/60 backdrop-filter backdrop-blur-sm animate-fade-in flex items-start justify-center p-4 sm:p-6"
          onClick={() => setShowLoginModal(false)}
        >
          <div
            className="panel max-w-sm w-full flex flex-col gap-4 p-6 relative bg-[#FFFDF9] animate-scale-in my-4 sm:my-8"
            onClick={(e) => e.stopPropagation()}
            style={{ borderRadius: "1.75rem" }}
          >
            <button
              type="button"
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold hover:bg-orange-200 transition active:scale-90 cursor-pointer"
              onClick={() => setShowLoginModal(false)}
            >
              ✕
            </button>

            <div className="text-center">
              <span className="text-3xl">🐾</span>
              <h3 className="text-lg font-bold text-[#331B08] mt-2 font-['Varela_Round']">Đăng nhập Đại lý sỉ</h3>
              <p className="muted text-xs font-semibold">Vui lòng nhập tài khoản đại lý đã được Pet Travel cấp.</p>
            </div>

            <form onSubmit={handleCredentialsLogin} className="flex flex-col gap-3 mt-2 text-xs">
              <div className="flex flex-col gap-1.5 font-semibold">
                <label className="text-xs font-bold text-orange-950/80">Địa chỉ Email sỉ</label>
                <input
                  type="email"
                  className="text-input text-sm py-2 px-3"
                  placeholder="ten@doanhnghiep.vn"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5 font-semibold">
                <label className="text-xs font-bold text-orange-950/80">Mật khẩu</label>
                <input
                  type="password"
                  className="text-input text-sm py-2 px-3"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="primary-button text-sm py-3 justify-center font-bold bg-orange-500 hover:bg-orange-600 text-white cursor-pointer mt-2 rounded-xl"
                disabled={isLoading}
              >
                {isLoading ? "Đang đăng nhập..." : "Đăng nhập Cổng sỉ"}
              </button>
            </form>

          </div>
        </div>
      )}
    </main>
  );
}
