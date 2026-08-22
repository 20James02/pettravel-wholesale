"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import type {
  AccountingOverview,
  AdminPolicy,
  AdminReportsOverview,
  CustomerOrder,
  FulfillmentStatus,
  JournalEntryDetail,
  OperationsOverview,
  OrderItem,
  PermissionKey,
  Product,
  RoleKey,
  Shipment,
  Supplier,
  ProductVariant
} from "@/lib/domain";
import { formatVnd } from "@/lib/money";

import type { AppMode, TabKey, ApiUser } from "./types";
import { TAB_ROUTE_MAP, ROUTE_TAB_MAP, resolvePostLoginTab } from "./types";
import { entityStore } from "@/lib/cache/entity-store";
import {
  catalogCacheKey,
  resolveCatalogAccessScope,
  type CatalogAccessScope
} from "@/lib/cache/catalog-access";
import { scheduleIdlePrediction } from "@/lib/prefetch/prefetch-engine";
import {
  cartStorageKeyForUser,
  legacyCartStorageKeyForUser,
  restoreCartItems
} from "@/lib/cart/cart-state";
import { animateProductToCart } from "@/lib/motion/cart-fly-motion";

// Import custom subcomponents
import { Topbar } from "./components/shared/Topbar";
import { Catalog } from "./components/customer/Catalog";
import { BottomSheet } from "./components/ui/BottomSheet";
import { ToastProvider } from "./components/ui/Toast";
import { AnnouncementBanner } from "./components/shared/AnnouncementBanner";
import { Eye, EyeOff, Lock, Sparkles, Check, PackagePlus } from "lucide-react";


function DeferredPanelLoading() {
  return (
    <div className="panel min-h-40 animate-pulse p-6 text-sm font-semibold text-slate-500" role="status">
      Đang tải dữ liệu cần thiết…
    </div>
  );
}

const Cart = dynamic(() => import("./components/customer/Cart").then((module) => module.Cart), {
  loading: DeferredPanelLoading
});
const OrderTimeline = dynamic(
  () => import("./components/customer/OrderTimeline").then((module) => module.OrderTimeline),
  { loading: DeferredPanelLoading }
);
const AdminOrders = dynamic(
  () => import("./components/admin/AdminOrders").then((module) => module.AdminOrders),
  { loading: DeferredPanelLoading }
);
const AdminInventory = dynamic(
  () => import("./components/admin/AdminInventory").then((module) => module.AdminInventory),
  { loading: DeferredPanelLoading }
);
const AdminAccounting = dynamic(
  () => import("./components/admin/AdminAccounting").then((module) => module.AdminAccounting),
  { loading: DeferredPanelLoading }
);
const AdminReports = dynamic(
  () => import("./components/admin/AdminReports").then((module) => module.AdminReports),
  { loading: DeferredPanelLoading }
);
const AdminUsers = dynamic(
  () => import("./components/admin/AdminUsers").then((module) => module.AdminUsers),
  { loading: DeferredPanelLoading }
);
const AdminHeader = dynamic(
  () => import("./components/admin/AdminHeader").then((module) => module.AdminHeader),
  { loading: DeferredPanelLoading }
);
const ChatPopup = dynamic(
  () => import("./components/shared/ChatPopup").then((module) => module.ChatPopup)
);
const ProductGallery = dynamic(
  () => import("./components/product/ProductGallery").then((module) => module.ProductGallery),
  { loading: DeferredPanelLoading }
);
const B2BPartnerModal = dynamic(
  () => import("./components/shared/B2BPartnerModal").then((module) => module.B2BPartnerModal)
);


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

interface PetTravelAppProps {
  initialTab?: TabKey;
}

export function PetTravelApp({ initialTab }: PetTravelAppProps = {}) {
  // --- CORE APPLICATION STATES ---
  const [mode, setMode] = useState<AppMode>("guest");
  const [activeTab, setActiveTabState] = useState<TabKey>(() => {
    if (initialTab === "catalog") return initialTab;
    return "catalog";
  });

  const setActiveTab = useCallback((newTab: TabKey | ((prev: TabKey) => TabKey)) => {
    setActiveTabState((current) => {
      const resolved = typeof newTab === "function" ? newTab(current) : newTab;
      if (typeof window !== "undefined") {
        const targetRoute = TAB_ROUTE_MAP[resolved] || "/";
        if (window.location.pathname !== targetRoute) {
          window.history.pushState(null, "", targetRoute);
        }
      }
      scheduleIdlePrediction(resolved);
      return resolved;
    });
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const mappedTab = ROUTE_TAB_MAP[path] || "catalog";
      setActiveTabState(mappedTab);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isProductsLoading, setIsProductsLoading] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<ApiUser | null>(null);
  const [isSessionResolved, setIsSessionResolved] = useState<boolean>(false);

  // Data lists
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allOrders, setAllOrders] = useState<CustomerOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [userList, setUserList] = useState<ApiUser[]>([]);
  const [showPartnerModal, setShowPartnerModal] = useState<boolean>(false);

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
  const [cartPaymentIntent, setCartPaymentIntent] = useState<"deposit_cod" | "pay_full">("deposit_cod");

  // Customer info & Profile states
  const [recipientName, setRecipientName] = useState<string>("");
  const [recipientPhone, setRecipientPhone] = useState<string>("");
  const [recipientAddress, setRecipientAddress] = useState<string>("");
  const [customerTaxCode, setCustomerTaxCode] = useState<string>("");
  const [customerNote, setCustomerNote] = useState<string>("");
  const [profileFullName, setProfileFullName] = useState<string>("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string>("");
  const [profileNewPassword, setProfileNewPassword] = useState<string>("");

  // Modals state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariantSku, setSelectedVariantSku] = useState<string>("");
  const [modalQty, setModalQty] = useState<number>(1);
  const [showCheckoutModal, setShowCheckoutModal] = useState<boolean>(false);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [pendingPostLoginTab, setPendingPostLoginTab] = useState<TabKey>(initialTab || "catalog");
  const [loginEmail, setLoginEmail] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);





  // Chat/Comment states
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [chatInput, setChatInput] = useState<string>("");
  const [isInternalComment, setIsInternalComment] = useState<boolean>(false);

  // --- REFERENCES ---
  const chatEndRef = useRef<HTMLDivElement>(null);
  const productFlySourceRef = useRef<HTMLDivElement>(null);

  // Compute states
  const isLoggedIn = currentUser !== null;
  const isAdmin = currentUser?.isAdmin || false;
  const catalogAccessScope = resolveCatalogAccessScope(currentUser);
  const catalogAccessScopeRef = useRef<CatalogAccessScope>(catalogAccessScope);
  catalogAccessScopeRef.current = catalogAccessScope;

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
    const isDiscountOver = adminDiscount > (workingOrder.quoteVersions.length > 0 ? workingOrder.quoteVersions[workingOrder.quoteVersions.length - 1].subtotal * adminPolicy.maxOperatorDiscountRate : 0);
    const isTotalOver = adminDiscount > adminPolicy.requireManagerApprovalAbove;
    return isDiscountOver || isTotalOver;
  }, [adminDiscount, workingOrder.quoteVersions, adminPolicy]);

  // Persist cart to localStorage per user
  const cartStorageKey = currentUser ? cartStorageKeyForUser(currentUser.id) : null;

  useEffect(() => {
    if (!cartStorageKey) return;
    if (cartItems.length > 0) {
      localStorage.setItem(cartStorageKey, JSON.stringify(cartItems));
    } else {
      localStorage.removeItem(cartStorageKey);
    }
  }, [cartItems, cartStorageKey]);

  // Initialize smooth scroll without pinning Lenis in the initial guest bundle.
  useEffect(() => {
    let cancelled = false;
    let animationFrameId: number | undefined;
    let lenis: InstanceType<typeof import("lenis").default> | undefined;

    async function initializeSmoothScroll() {
      const { default: Lenis } = await import("lenis");
      if (cancelled) return;
      lenis = new Lenis({ duration: 1.2, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
      function raf(time: number) {
        if (cancelled || !lenis) return;
        lenis.raf(time);
        animationFrameId = requestAnimationFrame(raf);
      }
      animationFrameId = requestAnimationFrame(raf);
    }
    void initializeSmoothScroll();

    // Fetch initial user
    async function loadUser() {
      try {
        const savedTheme = localStorage.getItem("ptw_admin_theme");
        if (savedTheme === "dark" || savedTheme === "light") {
          setTheme(savedTheme);
        }
      } catch { /* silent */ }

      let sessionFound = false;
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            sessionFound = true;
            setCurrentUser(data.user);
            setMode(data.user.isAdmin ? "admin" : "customer");
            const requestedTab = initialTab || (
              typeof window !== "undefined" ? ROUTE_TAB_MAP[window.location.pathname] : undefined
            );
            setActiveTab(resolvePostLoginTab(requestedTab, Boolean(data.user.isAdmin)));
            // Restore user's cart from localStorage
            const savedCart = localStorage.getItem(cartStorageKeyForUser(data.user.id));
            localStorage.removeItem(legacyCartStorageKeyForUser(data.user.id));
            setCartItems(restoreCartItems(savedCart));
          }
        }
      } catch { /* silent */ }
      if (!sessionFound && initialTab && initialTab !== "catalog") {
        setPendingPostLoginTab(initialTab);
        setActiveTab("catalog");
        setShowLoginModal(true);
      }
      if (!cancelled) setIsSessionResolved(true);
    }
    loadUser();

    return () => {
      cancelled = true;
      if (animationFrameId !== undefined) cancelAnimationFrame(animationFrameId);
      lenis?.destroy();
    };
  }, [initialTab, setActiveTab]);

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

  // --- API FETCH HELPERS (useCallback + SWR entityStore to prevent re-creation and avoid blocking spinners) ---
  const fetchProducts = useCallback(async () => {
    const requestedScope = catalogAccessScope;
    try {
      const { data } = await entityStore.swrFetch(catalogCacheKey(requestedScope), async () => {
        const res = await fetch("/api/products");
        if (!res.ok) throw new Error();
        const json = (await res.json()) as { products?: Product[]; role?: CatalogAccessScope };
        if (json.role !== requestedScope) {
          throw new Error("Catalog access scope does not match the active session.");
        }
        const list = (json.products ?? []) as Product[];
        if (catalogAccessScopeRef.current === requestedScope) {
          entityStore.setProducts(list);
        }
        return list;
      }, (fresh) => {
        if (catalogAccessScopeRef.current === requestedScope) {
          setAllProducts(fresh);
        }
      });
      if (catalogAccessScopeRef.current === requestedScope) {
        setAllProducts(data);
      }
    } catch { /* silent */ } finally {
      if (catalogAccessScopeRef.current === requestedScope) {
        setIsProductsLoading(false);
      }
    }
  }, [catalogAccessScope]);

  const fetchOrders = useCallback(async () => {
    try {
      const { data } = await entityStore.swrFetch("orders", async () => {
        const res = await fetch("/api/orders");
        if (!res.ok) throw new Error();
        const json = await res.json();
        const list = (json.orders ?? []) as CustomerOrder[];
        entityStore.setOrders(list);
        return list;
      }, (fresh) => {
        setAllOrders(fresh);
      });
      setAllOrders(data);
      if (data.length > 0) {
        const targetOrder = (selectedOrderId ? data.find((o) => o.id === selectedOrderId) : null) || data[0];
        if (!selectedOrderId || !data.some((o) => o.id === selectedOrderId)) {
          setSelectedOrderId(targetOrder.id);
          setWorkingOrder(targetOrder);
          setAdminOrderItems(targetOrder.items?.map((item: OrderItem) => ({ ...item })) ?? []);
        } else {
          setWorkingOrder(targetOrder);
        }
      }
    } catch { /* silent */ }
  }, [selectedOrderId]);

  const lastRevisionRef = useRef<string>("");

  useEffect(() => {
    if (!currentUser) return;
    const events = new EventSource("/api/orders/events");
    const handleSnapshot = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload?.type === "order.delta" && payload?.orderId && payload?.patch) {
          entityStore.patchOrder(payload.orderId, payload.patch);
          setAllOrders(entityStore.getAllOrders());
        } else if (payload?.revision && payload.revision !== lastRevisionRef.current) {
          lastRevisionRef.current = payload.revision;
          entityStore.invalidate("orders");
          void fetchOrders();
        }
      } catch {
        void fetchOrders();
      }
    };
    events.addEventListener("orders.snapshot", handleSnapshot);
    let lastFallbackFetchAt = 0;
    events.onerror = () => {
      const now = Date.now();
      if (document.visibilityState === "visible" && now - lastFallbackFetchAt >= 30_000) {
        lastFallbackFetchAt = now;
        entityStore.invalidate("orders");
        void fetchOrders();
      }
    };

    return () => {
      events.removeEventListener("orders.snapshot", handleSnapshot);
      events.onerror = null;
      events.close();
    };
  }, [currentUser, fetchOrders]);

  const fetchCategories = useCallback(async () => {
    try {
      const { data } = await entityStore.swrFetch("categories", async () => {
        const res = await fetch("/api/categories");
        if (!res.ok) throw new Error();
        const json = await res.json();
        return (json.categories ?? []) as string[];
      }, (fresh) => {
        setAllCategories(fresh);
      });
      setAllCategories(data);
    } catch { /* silent */ }
  }, []);

  const fetchAdminData = useCallback(async () => {
    try {
      const { data } = await entityStore.swrFetch("admin_data", async () => {
        const [suppRes, polRes] = await Promise.all([
          fetch("/api/suppliers"),
          fetch("/api/admin/policy")
        ]);
        const suppData = suppRes.ok ? await suppRes.json() : {};
        const polData = polRes.ok ? await polRes.json() : {};
        return {
          suppliers: (suppData.suppliers ?? []) as Supplier[],
          adminPolicy: (polData.adminPolicy ?? DEFAULT_POLICY) as AdminPolicy,
          rolePermissions: (polData.rolePermissions ?? {} as Record<RoleKey, PermissionKey[]>)
        };
      }, (fresh) => {
        setSuppliers(fresh.suppliers);
        setAdminPolicy(fresh.adminPolicy);
        setRolePermissions(fresh.rolePermissions);
      });
      setSuppliers(data.suppliers);
      setAdminPolicy(data.adminPolicy);
      setRolePermissions(data.rolePermissions);
    } catch { /* silent */ }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const { data } = await entityStore.swrFetch("users", async () => {
        const res = await fetch("/api/admin/users");
        if (!res.ok) throw new Error();
        const json = await res.json();
        const list = (json.users ?? []) as ApiUser[];
        entityStore.setUsers(list);
        return list;
      }, (fresh) => {
        setUserList(fresh);
      });
      setUserList(data);
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
      const res = await fetch("/api/admin/accounting/journal-entries");
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

  // Categories are public and do not depend on session resolution.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCategories();
  }, [fetchCategories]);

  // Fetch catalog only after auth is resolved. The access-scoped cache key makes
  // login/logout transitions fetch the correct price projection immediately.
  useEffect(() => {
    if (!isSessionResolved) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsProductsLoading(true);
    void fetchProducts();
  }, [isSessionResolved, fetchProducts]);

  // On-demand lazy loading router per active tab
  useEffect(() => {
    if (!isLoggedIn) return;

    if (!isAdmin) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchOrders();
      return;
    }

    const currentTab = activeTab;
    if (loadedTabs.has(currentTab)) return;

    // Load only data for the current active tab
    if (currentTab === "admin_reports") {
      fetchReportsOverview();
      fetchOrders();
      fetchProducts();
    } else if (currentTab === "admin") {
      fetchOrders();
      fetchProducts();
      fetchCategories();
    } else if (currentTab === "admin_accounting") {
      fetchAccountingOverview();
      fetchAccountingJournalEntries();
    } else if (
      currentTab === "admin_products" ||
      currentTab === "admin_suppliers" ||
      currentTab === "admin_categories" ||
      currentTab === "admin_operations"
    ) {
      fetchProducts();
      fetchCategories();
      fetchAdminData();
      fetchOperationsOverview();
    } else if (currentTab === "admin_promotions" || currentTab === "settings") {
      fetchPromotions();
      fetchAdminData();
    } else if (currentTab === "admin_users") {
      fetchUsers();
    }

    setLoadedTabs((prev) => new Set([...prev, currentTab]));
  }, [
    activeTab,
    isLoggedIn,
    isAdmin,
    loadedTabs,
    fetchReportsOverview,
    fetchOrders,
    fetchProducts,
    fetchCategories,
    fetchAccountingOverview,
    fetchAccountingJournalEntries,
    fetchOperationsOverview,
    fetchPromotions,
    fetchAdminData,
    fetchUsers
  ]);

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
  async function syncOrder(updatedOrder: CustomerOrder): Promise<boolean> {
    try {
      const payload = currentUser?.isAdmin
        ? updatedOrder
        : (() => {
            const ord = updatedOrder as Partial<CustomerOrder>;
            const minimal: Record<string, unknown> = { id: ord.id };
            if (ord.commercialStatus) minimal.commercialStatus = ord.commercialStatus;
            if (ord.acceptedQuoteId) minimal.acceptedQuoteId = ord.acceptedQuoteId;
            if (ord.acceptedQuoteVersion !== undefined) minimal.acceptedQuoteVersion = ord.acceptedQuoteVersion;
            if (ord.paymentIntent) minimal.paymentIntent = ord.paymentIntent;
            if (ord.invoiceRequested !== undefined) minimal.invoiceRequested = ord.invoiceRequested;
            if (ord.recipientName !== undefined) minimal.recipientName = ord.recipientName;
            if (ord.recipientPhone !== undefined) minimal.recipientPhone = ord.recipientPhone;
            if (ord.recipientAddress !== undefined) minimal.recipientAddress = ord.recipientAddress;
            if (ord.customerTaxCode !== undefined) minimal.customerTaxCode = ord.customerTaxCode;
            if (ord.customerNote !== undefined) minimal.customerNote = ord.customerNote;
            const existingCommentIds = new Set(workingOrder.comments.map((comment) => comment.id));
            const newComments = ord.comments?.filter((comment) => !existingCommentIds.has(comment.id)) ?? [];
            if (newComments.length > 0) minimal.comments = newComments;
            const existingProofIds = new Set(workingOrder.paymentProofs.map((proof) => proof.id));
            const newProofs = ord.paymentProofs?.filter((proof) => !existingProofIds.has(proof.id)) ?? [];
            if (newProofs.length > 0) minimal.paymentProofs = newProofs;
            if (ord.updatedAt) minimal.expectedUpdatedAt = ord.updatedAt;
            return minimal;
          })();

      const res = await fetch(`/api/orders?id=${updatedOrder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = (await res.json()) as { order: CustomerOrder };
        setWorkingOrder(data.order);
        setAdminOrderItems(data.order.items || []);
        setAllOrders((prev) => prev.map((o) => (o.id === data.order.id ? data.order : o)));
        return true;
      } else {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        alert(errData.error || "Không thể lưu trạng thái đơn hàng vào cơ sở dữ liệu.");
        return false;
      }
    } catch {
      alert("Lỗi kết nối máy chủ khi lưu đơn.");
      return false;
    }
  }

  // --- REAL BUSINESS METRICS (Calculated for Admin Header indicators) ---
  const realPendingApprovalsCount = useMemo(() => {
    return allOrders.filter((o) => o.commercialStatus === "submitted" || o.commercialStatus === "admin_review").length;
  }, [allOrders]);

  const realLowStockCount = useMemo(() => {
    return allProducts.reduce((sum, p) => sum + p.variants.filter((v) => v.stock < 10).length, 0);
  }, [allProducts]);

  // --- ACTIONS & OPERATION HANDLERS ---

  const handleThemeChange = (newTheme: "light" | "dark") => {
    setTheme(newTheme);
    try {
      localStorage.setItem("ptw_admin_theme", newTheme);
    } catch { /* silent */ }
  };

  async function handleCredentialsLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { loginIdentifierSchema, loginPasswordSchema } = await import("@/lib/validation");
      const preflight = loginPasswordSchema.safeParse(loginPassword);
      if (!preflight.success) {
        alert("Mật khẩu không hợp lệ (tối thiểu 8 ký tự).");
        setIsLoading(false);
        return;
      }
      const identifierParsed = loginIdentifierSchema.safeParse(loginEmail);
      if (!identifierParsed.success) {
        alert("Vui lòng nhập email hoặc số điện thoại hợp lệ.");
        setIsLoading(false);
        return;
      }
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifierParsed.data, password: preflight.data })
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
      const savedCart = localStorage.getItem(cartStorageKeyForUser(data.user.id));
      localStorage.removeItem(legacyCartStorageKeyForUser(data.user.id));
      setCartItems(restoreCartItems(savedCart));
      setActiveTab(resolvePostLoginTab(pendingPostLoginTab, Boolean(data.user.isAdmin)));
      setPendingPostLoginTab("catalog");
      setLoadedTabs(new Set());
      setShowLoginModal(false);
      setLoginEmail("");
      setLoginPassword("");
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error("Lỗi kết nối máy chủ.");
      alert(`Lỗi đăng nhập: ${err.message || "Lỗi kết nối máy chủ."}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    try {
      const response = await fetch("/api/auth/me", { method: "DELETE" });
      if (!response.ok) {
        alert("Không thể kết thúc phiên đăng nhập. Vui lòng thử lại.");
        return;
      }
    } catch {
      alert("Mất kết nối khi đăng xuất. Phiên đăng nhập vẫn được giữ an toàn.");
      return;
    }
    if (currentUser) {
      localStorage.removeItem(cartStorageKeyForUser(currentUser.id));
      localStorage.removeItem(legacyCartStorageKeyForUser(currentUser.id));
    }
    setMode("guest");
    setCurrentUser(null);
    setCartItems([]);
    setWorkingOrder(EMPTY_ORDER);
    setSelectedOrderId(null);
    setLoadedTabs(new Set());
    setPendingPostLoginTab("catalog");
    setActiveTab("catalog");
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { fullNameSchema, optionalUrlSchema, passwordSchema } = await import("@/lib/validation");
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
    setWorkingOrder((prev) => ({ ...prev, items: nextItems }));
    setIsOrderModified(true);
  }

  // Publish quote to customer for acceptance
  async function handlePublishQuote(customNote?: string): Promise<boolean> {
    if (!workingOrder?.id) return false;
    try {
      const itemsToQuote = adminOrderItems.length > 0 ? adminOrderItems : (workingOrder.items || []);
      const subtotal = itemsToQuote.reduce((sum, item) => sum + item.quantity * item.unitPriceSnapshot, 0);
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

      const newComments = [...workingOrder.comments];
      if (customNote && customNote.trim()) {
        newComments.unshift({
          id: `c_pub_note_${Date.now()}`,
          author: currentUser?.name || "Admin",
          audience: "customer_visible",
          message: customNote.trim(),
          createdAt: new Date().toISOString()
        });
      }
      newComments.unshift({
        id: `c_pub_${Date.now()}`,
        author: currentUser?.name || "Operator",
        audience: "customer_visible",
        message: `Nhân viên đã thẩm định chi phí sỉ. Bản báo giá số ${nextVersion} đã phát hành: Giá sỉ ${formatVnd(subtotal)}, giảm giá ${formatVnd(adminDiscount)}, phí ship ${formatVnd(shippingFeeOption === "included" ? adminShippingFee : 0)}. Tổng giá trị đơn: ${formatVnd(finalTotal)}. Tiền cọc tối thiểu: ${formatVnd(depositAmount)}.`,
        createdAt: new Date().toISOString()
      });

      const updatedOrder: CustomerOrder = {
        ...workingOrder,
        commercialStatus: "quoted",
        customerNote: customNote?.trim() || workingOrder.customerNote || "",
        items: itemsToQuote.map((item) => ({ ...item })),
        quoteVersions: [...workingOrder.quoteVersions.map((q) => ({ ...q, status: "superseded" as const })), newQuote],
        comments: newComments,
        updatedAt: new Date().toISOString()
      };

      const success = await syncOrder(updatedOrder);
      if (success) {
        setIsOrderModified(false);
        setIsManagerApproved(false);
        alert("Đã phát hành báo giá chính thức cho đại lý!");
      }
      return success;
    } catch {
      alert("Không thể phát hành báo giá.");
      return false;
    }
  }

  // Accept payment/deposit proof and confirm money in bank
  async function confirmDeposit() {
    if (!workingOrder?.id) return;
    const pendingProof = workingOrder.paymentProofs.find(
      (proof) =>
        proof.status === "pending_admin_confirmation" &&
        workingOrder.paymentRequests.some(
          (request) => request.id === proof.paymentRequestId && request.status === "uploaded"
        )
    );
    const paymentRequest = workingOrder.paymentRequests.find((request) => request.id === pendingProof?.paymentRequestId);
    if (!pendingProof || !paymentRequest) {
      alert("Không có minh chứng hợp lệ gắn với yêu cầu thanh toán đang chờ đối soát.");
      return;
    }
    if (!window.confirm(`Xác nhận đã kiểm tra tài khoản ngân hàng và nhận đủ ${formatVnd(paymentRequest.amount)}?`)) {
      return;
    }

    const isDeposit = paymentRequest.purpose === "deposit";
    const updatedProofs = workingOrder.paymentProofs.map((proof) =>
      proof.id === pendingProof.id ? { ...proof, status: "accepted" as const } : proof
    );
    const updatedRequests = workingOrder.paymentRequests.map((request) =>
      request.id === paymentRequest.id ? { ...request, status: "confirmed" as const } : request
    );
    const nextPaymentStatus = isDeposit ? "deposit_confirmed" : "paid";

    const updatedOrder: CustomerOrder = {
      ...workingOrder,
      paymentStatus: nextPaymentStatus,
      paymentProofs: updatedProofs,
      paymentRequests: updatedRequests,
      comments: [
        {
          id: `c_dep_${Date.now()}`,
          author: currentUser?.name || "Kế toán",
          audience: "customer_visible",
          message: `Kế toán đã đối soát ngân hàng thành công. Xác nhận nhận đủ số tiền: ${formatVnd(paymentRequest.amount)}. Đơn hàng đang được chuyển sang bước xử lý tiếp theo.`,
          createdAt: new Date().toISOString()
        },
        ...workingOrder.comments
      ],
      updatedAt: new Date().toISOString()
    };

    if (await syncOrder(updatedOrder)) {
      const ledgerPosted = await handlePostOrderAccounting("post_confirmed_payments", false);
      alert(
        ledgerPosted
          ? "Đã xác nhận giao dịch và ghi nhận khoản thu vào sổ kế toán."
          : "Đã xác nhận giao dịch, nhưng chưa ghi được sổ kế toán. Vui lòng xử lý lại tại màn hình Kế toán."
      );
    }
  }

  async function rejectPaymentProof() {
    if (!workingOrder?.id) return;
    const pendingProof = workingOrder.paymentProofs.find(
      (proof) =>
        proof.status === "pending_admin_confirmation" &&
        workingOrder.paymentRequests.some(
          (request) => request.id === proof.paymentRequestId && request.status === "uploaded"
        )
    );
    const paymentRequest = workingOrder.paymentRequests.find((request) => request.id === pendingProof?.paymentRequestId);
    if (!pendingProof || !paymentRequest) {
      alert("Không có minh chứng hợp lệ đang chờ duyệt.");
      return;
    }
    if (!window.confirm("Từ chối minh chứng này? Khách hàng sẽ được yêu cầu tải lại chứng từ hợp lệ.")) {
      return;
    }

    const requestStillValid = new Date(paymentRequest.expiresAt).getTime() > Date.now();
    const nextPaymentStatus = paymentRequest.purpose === "deposit"
      ? "deposit_requested"
      : paymentRequest.purpose === "remaining"
        ? "cod_remaining"
        : "full_requested";
    const updatedOrder: CustomerOrder = {
      ...workingOrder,
      paymentStatus: nextPaymentStatus,
      paymentProofs: workingOrder.paymentProofs.map((proof) =>
        proof.id === pendingProof.id ? { ...proof, status: "rejected" as const } : proof
      ),
      paymentRequests: workingOrder.paymentRequests.map((request) =>
        request.id === paymentRequest.id
          ? { ...request, status: requestStillValid ? "active" as const : "superseded" as const }
          : request
      ),
      comments: [
        {
          id: `c_reject_payment_${Date.now()}`,
          author: currentUser?.name || "Kế toán",
          audience: "customer_visible",
          message: requestStillValid
            ? "Minh chứng thanh toán chưa đạt yêu cầu đối soát. Vui lòng kiểm tra và tải lại chứng từ đúng giao dịch."
            : "Minh chứng thanh toán chưa đạt yêu cầu và mã thanh toán đã hết hạn. Bộ phận vận hành sẽ phát hành yêu cầu mới.",
          createdAt: new Date().toISOString()
        },
        ...workingOrder.comments
      ],
      updatedAt: new Date().toISOString()
    };
    if (await syncOrder(updatedOrder)) {
      alert(requestStillValid ? "Đã từ chối minh chứng; khách hàng có thể tải lại." : "Đã từ chối minh chứng; cần phát hành yêu cầu mới.");
    }
  }

  async function reissuePaymentRequest() {
    if (!workingOrder?.id) return;
    if (!window.confirm("Phát hành mã thanh toán mới và vô hiệu hóa các mã cũ đã hết hạn?")) return;
    try {
      const response = await fetch("/api/orders/payment-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: workingOrder.id })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; paymentRequest?: { reissued?: boolean } };
      if (!response.ok) {
        alert(payload.error || "Không thể phát hành lại yêu cầu thanh toán.");
        return;
      }
      entityStore.invalidate("orders");
      await fetchOrders();
      alert(payload.paymentRequest?.reissued === false
        ? "Yêu cầu thanh toán hiện tại vẫn còn hiệu lực."
        : "Đã phát hành yêu cầu thanh toán mới và đồng bộ cho khách hàng.");
    } catch {
      alert("Lỗi kết nối khi phát hành lại yêu cầu thanh toán.");
    }
  }

  async function advanceFulfillment(
    nextStatus: FulfillmentStatus,
    shipmentInput?: Pick<Shipment, "carrier" | "trackingCode" | "eta">
  ) {
    if (!workingOrder?.id) return;
    if (nextStatus === "shipped" && (!shipmentInput?.carrier.trim() || !shipmentInput.trackingCode.trim())) {
      alert("Cần nhập đơn vị vận chuyển và mã vận đơn thực tế trước khi xuất kho.");
      return;
    }

    const statusLabels: Record<FulfillmentStatus, string> = {
      not_started: "Chưa xử lý",
      supplier_checking: "Đang kiểm hàng nhà cung cấp",
      supplier_confirmed: "Nhà cung cấp đã xác nhận đủ hàng",
      packing: "Đang đóng gói",
      ready_to_ship: "Sẵn sàng bàn giao vận chuyển",
      shipped: "Đã xuất kho và bàn giao vận chuyển",
      delivered: "Khách đã nhận hàng"
    };
    const currentQuote = workingOrder.quoteVersions[workingOrder.quoteVersions.length - 1];
    const shippingFee = currentQuote?.adjustments.find((adjustment) => adjustment.type === "shipping_fee")?.amount || 0;
    const shipment: Shipment | undefined = shipmentInput
      ? {
          carrier: shipmentInput.carrier.trim(),
          trackingCode: shipmentInput.trackingCode.trim(),
          shippingFee,
          eta: shipmentInput.eta.trim(),
          note: "Thông tin vận chuyển do nhân viên phụ trách xác nhận từ hãng vận chuyển."
        }
      : workingOrder.shipment;

    const updatedOrder: CustomerOrder = {
      ...workingOrder,
      fulfillmentStatus: nextStatus,
      fulfillmentGroups: workingOrder.fulfillmentGroups.map((group) => ({
        ...group,
        status: nextStatus,
        internalNote: `${statusLabels[nextStatus]} bởi ${currentUser?.name || "nhân viên"}.`
      })),
      shipment,
      comments: [
        {
          id: `c_ship_${Date.now()}`,
          author: "Hệ thống",
          audience: "customer_visible",
          message: nextStatus === "shipped" && shipment
            ? `${statusLabels[nextStatus]}. Đơn vị: ${shipment.carrier}. Mã vận đơn: ${shipment.trackingCode}.`
            : `Cập nhật xử lý đơn hàng: ${statusLabels[nextStatus]}.`,
          createdAt: new Date().toISOString()
        },
        ...workingOrder.comments
      ],
      updatedAt: new Date().toISOString()
    };

    if (await syncOrder(updatedOrder)) {
      await Promise.all([fetchOperationsOverview(), fetchReportsOverview()]);
      alert(`Đã chuyển đơn sang: ${statusLabels[nextStatus]}.`);
    }
  }

  // Record accounting journal entries on server
  async function handlePostOrderAccounting(
    action: "post_all" | "post_confirmed_payments",
    notify = true
  ): Promise<boolean> {
    if (!workingOrder?.id) return false;
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
        if (notify) alert(data.error || "Không thể ghi sổ kế toán cho đơn hàng.");
        return false;
      }
      await Promise.all([fetchAccountingOverview(), fetchAccountingJournalEntries(), fetchReportsOverview()]);
      if (notify) {
        alert(`Đã ghi sổ: ${data.result?.createdEntries ?? 0} bút toán mới, ${data.result?.skippedEntries ?? 0} đã tồn tại.`);
      }
      return true;
    } catch {
      if (notify) alert("Không thể kết nối máy chủ khi ghi sổ kế toán.");
      return false;
    }
  }

  // --- SHOPPING CART HANDLERS ---

  function addToCart(
    variantSku: string,
    productCode: string,
    productName: string,
    variantLabel: string,
    price: number,
    supplierId: string,
    qty: number = 1,
    variantImage?: string
  ) {
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
          variantImage,
          quantity: qty,
          unitPriceSnapshot: price,
          supplierId
        }
      ];
    });
  }

  function handleAddSelectedProductToCart(activeVariant: ProductVariant) {
    if (!selectedProduct) return;

    const variantImage = activeVariant.imageUrl || selectedProduct.imageUrl;
    addToCart(
      activeVariant.sku,
      selectedProduct.code,
      selectedProduct.name,
      activeVariant.label,
      activeVariant.wholesalePrice ?? 0,
      activeVariant.supplierId || "sup_pettravel",
      modalQty,
      variantImage
    );
    void animateProductToCart({
      sourceElement: productFlySourceRef.current,
      imageUrl: variantImage
    });
    setSelectedProduct(null);
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
      const { vndAmountSchema } = await import("@/lib/validation");
      if (cartItems.length === 0) throw new Error("Giỏ hàng chưa có sản phẩm.");
      cartItems.forEach((item) => {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 10000) {
          throw new Error(`Số lượng của ${item.productName} phải từ 1 đến 10.000.`);
        }
        vndAmountSchema("Đơn giá").parse(item.unitPriceSnapshot);
      });
      if (!recipientName.trim() || !recipientPhone.trim() || !recipientAddress.trim()) {
        setShowCheckoutModal(true);
        return;
      }
    } catch (error) {
      const { getValidationErrorMessage } = await import("@/lib/validation");
      alert(getValidationErrorMessage(error, "Dữ liệu giỏ hàng không hợp lệ."));
      return;
    }

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartItems.map((item) => ({ ...item })),
          paymentIntent: cartPaymentIntent,
          recipientName: recipientName.trim(),
          recipientPhone: recipientPhone.trim(),
          recipientAddress: recipientAddress.trim(),
          customerTaxCode: customerTaxCode.trim(),
          customerNote: customerNote.trim()
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
      setCartItems([]);
      setCartPaymentIntent("deposit_cod");
      setShowCheckoutModal(false);
      setActiveTab("order");
    } catch {
      alert("Lỗi kết nối. Vui lòng kiểm tra mạng và thử lại.");
    }
  }

  async function handleCustomerAcceptQuote(): Promise<boolean> {
    if (!workingOrder?.id) return false;
    const activeQuote = workingOrder.quoteVersions[workingOrder.quoteVersions.length - 1];
    if (!activeQuote) return false;

    try {
      const updatedOrder: CustomerOrder = {
        ...workingOrder,
        commercialStatus: "customer_accepted",
        acceptedQuoteId: activeQuote.id,
        acceptedQuoteVersion: activeQuote.version,
        comments: [
          {
            id: `c_acc_${Date.now()}`,
            author: workingOrder.customerName,
            audience: "customer_visible",
            message: `Đại lý đã đồng ý bản báo giá số ${activeQuote.version} (Tổng tiền: ${formatVnd(activeQuote.finalTotal)}). Hệ thống đang phát hành yêu cầu thanh toán chính thức.`,
            createdAt: new Date().toISOString()
          },
          ...workingOrder.comments
        ],
        updatedAt: new Date().toISOString()
      };

      const accepted = await syncOrder(updatedOrder);
      if (accepted) {
        alert("Đã chấp thuận báo giá! Yêu cầu thanh toán VietQR chính thức đã được phát hành.");
      }
      return accepted;
    } catch {
      alert("Lỗi kết nối khi chấp thuận báo giá.");
      return false;
    }
  }

  function handlePayNowClick() {
    const paymentPanel = document.getElementById("payment-request-panel");
    if (!paymentPanel) {
      alert("Yêu cầu thanh toán chưa sẵn sàng hoặc đã hết hạn. Vui lòng chờ bộ phận vận hành phát hành mã mới.");
      return;
    }
    paymentPanel.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handleCustomerRequestChange(reason: string) {
    if (!workingOrder?.id) return;
    const updatedOrder: CustomerOrder = {
      ...workingOrder,
      commercialStatus: "admin_review",
      customerNote: reason,
      comments: [
        {
          id: `c_req_chg_${Date.now()}`,
          author: workingOrder.customerName,
          audience: "customer_visible",
          message: `Đại lý yêu cầu điều chỉnh đơn hàng: "${reason}". Đơn đã được chuyển về thẩm định lại.`,
          createdAt: new Date().toISOString()
        },
        ...workingOrder.comments
      ],
      updatedAt: new Date().toISOString()
    };

    await syncOrder(updatedOrder);
    alert("Đã gửi yêu cầu điều chỉnh thành công! Nhân viên Pet Travel sẽ kiểm tra và xuất lại báo giá mới.");
  }

  async function handleUpdateRecipientInfo(info: {
    recipientName: string;
    recipientPhone: string;
    recipientAddress: string;
    customerTaxCode: string;
    customerNote: string;
  }) {
    if (!workingOrder?.id) return;
    const updatedOrder: CustomerOrder = {
      ...workingOrder,
      recipientName: info.recipientName,
      recipientPhone: info.recipientPhone,
      recipientAddress: info.recipientAddress,
      customerTaxCode: info.customerTaxCode,
      customerNote: info.customerNote,
      comments: [
        {
          id: `c_upd_ship_${Date.now()}`,
          author: workingOrder.customerName,
          audience: "customer_visible",
          message: `Đại lý đã cập nhật lại địa chỉ nhận hàng: ${info.recipientName} (${info.recipientPhone}) - ${info.recipientAddress}.`,
          createdAt: new Date().toISOString()
        },
        ...workingOrder.comments
      ],
      updatedAt: new Date().toISOString()
    };

    const ok = await syncOrder(updatedOrder);
    if (ok) {
      setRecipientName(info.recipientName);
      setRecipientPhone(info.recipientPhone);
      setRecipientAddress(info.recipientAddress);
      setCustomerTaxCode(info.customerTaxCode);
      setCustomerNote(info.customerNote);
      alert("Đã cập nhật thông tin giao nhận thành công!");
    }
  }

  async function handleConfirmCheckout() {
    if (!recipientName || !recipientPhone || !recipientAddress) {
      alert("Vui lòng điền đầy đủ thông tin giao nhận hàng.");
      return;
    }

    const { getValidationErrorMessage, recipientSchema } = await import("@/lib/validation");
    const recipientValidation = recipientSchema.safeParse({ recipientName, recipientPhone, recipientAddress });
    if (!recipientValidation.success) {
      alert(getValidationErrorMessage(recipientValidation.error, "Thông tin giao nhận không hợp lệ."));
      return;
    }

    if (workingOrder.id === "") {
      await handleSubmitCartProposal();
      return;
    }

    const activeQuote = workingOrder.quoteVersions[workingOrder.quoteVersions.length - 1];
    if (!activeQuote) return;

    const updatedOrder: CustomerOrder = {
      ...workingOrder,
      recipientName: recipientValidation.data.recipientName,
      recipientPhone: recipientValidation.data.recipientPhone,
      recipientAddress: recipientValidation.data.recipientAddress,
      customerTaxCode: customerTaxCode.trim(),
      customerNote: customerNote.trim(),
      commercialStatus: "customer_accepted",
      acceptedQuoteId: activeQuote.id,
      acceptedQuoteVersion: activeQuote.version,
      comments: [
        {
          id: `c_chk_${Date.now()}`,
          author: "Hệ thống",
          audience: "customer_visible",
          message: `Đại lý đã xác nhận báo giá và thông tin nhận hàng: ${recipientName} (${recipientPhone}) - ${recipientAddress}.`,
          createdAt: new Date().toISOString()
        },
        ...workingOrder.comments
      ],
      updatedAt: new Date().toISOString()
    };

    const accepted = await syncOrder(updatedOrder);
    if (accepted) setShowCheckoutModal(false);
  }

  async function uploadPaymentProof(file: File) {
    if (!workingOrder?.id) return;
    const request = [...workingOrder.paymentRequests]
      .reverse()
      .find((item) => item.status === "active" && new Date(item.expiresAt).getTime() > Date.now());
    if (!request) {
      alert("Không tìm thấy yêu cầu thanh toán đang hoạt động.");
      return;
    }

    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
    if (!allowedTypes.has(file.type) || file.size <= 0 || file.size > 10 * 1024 * 1024) {
      alert("Chỉ chấp nhận JPG, PNG, WebP hoặc PDF không quá 10MB.");
      return;
    }

    const presignResponse = await fetch("/api/uploads/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: workingOrder.id,
        fileName: file.name,
        contentType: file.type,
        fileSizeBytes: file.size,
        purpose: "payment-proof"
      })
    });
    if (!presignResponse.ok) {
      alert("Không thể chuẩn bị vùng lưu minh chứng.");
      return;
    }
    const upload = (await presignResponse.json()) as { key: string; uploadUrl: string };
    const uploadResponse = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file
    });
    if (!uploadResponse.ok) {
      alert("Tải minh chứng lên thất bại. Vui lòng thử lại.");
      return;
    }

    const nextStatus = request.purpose === "deposit" ? "deposit_uploaded" : "full_uploaded";

    const updatedOrder: CustomerOrder = {
      ...workingOrder,
      paymentStatus: nextStatus,
      paymentRequests: workingOrder.paymentRequests.map((item) =>
        item.id === request.id ? { ...item, status: "uploaded" as const } : item
      ),
      paymentProofs: [
        {
          id: `proof_${crypto.randomUUID()}`,
          paymentRequestId: request.id,
          fileName: file.name,
          storageKey: upload.key,
          contentType: file.type,
          fileSizeBytes: file.size,
          uploadedAt: new Date().toISOString(),
          status: "pending_admin_confirmation" as const
        },
        ...workingOrder.paymentProofs
      ],
      comments: [
        {
          id: `c_proof_${Date.now()}`,
          author: workingOrder.customerName,
          audience: "customer_visible",
          message: "Đại lý đã tải minh chứng chuyển khoản. Kế toán đang chờ đối soát.",
          createdAt: new Date().toISOString()
        },
        ...workingOrder.comments
      ],
      updatedAt: new Date().toISOString()
    };

    await syncOrder(updatedOrder);
    alert("Đã tải minh chứng chuyển khoản. Kế toán sẽ đối soát trước khi xác nhận.");
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

  return (
    <ToastProvider>
      <main className="app-shell">
        {/* Top Announcement Banner for Customer mode */}
        {!(isAdmin && (activeTab.startsWith("admin") || activeTab === "settings")) && (
          <AnnouncementBanner onOpenPartnerModal={() => setShowPartnerModal(true)} />
        )}

        {/* MAIN APPLICATION CONTENT */}
        <section className={`main-area ${
          isAdmin && (activeTab.startsWith("admin") || activeTab === "settings")
            ? `admin-theme-container ${theme === "dark" ? "admin-dark bg-[#0e1120] text-white" : "admin-light bg-[#f4f6fb] text-[#111827]"} p-3 sm:p-5 lg:p-6`
            : ""
        }`}>
          {/* Top bar header: Finnova Admin Header vs Customer Dynamic Liquid Glass Capsule Nav */}
          {isAdmin && (activeTab.startsWith("admin") || activeTab === "settings") ? (
            <AdminHeader
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              currentUser={currentUser}
              totalOrdersCount={allOrders.length}
              pendingApprovalsCount={realPendingApprovalsCount}
              lowStockCount={realLowStockCount}
              onLogout={handleLogout}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              theme={theme}
              setTheme={handleThemeChange}
              onBackClick={() => setActiveTab("catalog")}
            />
          ) : (
            <Topbar
              isLoggedIn={isLoggedIn}
              activeUser={currentUser}
              isAdmin={isAdmin}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onRequireLogin={(tab) => {
                setPendingPostLoginTab(tab);
                setShowLoginModal(true);
              }}
              cartItemsCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
            />
          )}

          {/* --- PAGE TABS ROUTING --- */}

          {/* CUSTOMER TABS */}
          {activeTab === "catalog" && (
            <Catalog
              products={allProducts}
              availableCategories={allCategories}
              categoryFilter={categoryFilter}
              setCategoryFilter={setCategoryFilter}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              isLoggedIn={isLoggedIn}
              isLoading={isProductsLoading}
              onOpenPartnerModal={() => setShowPartnerModal(true)}
              onSelectProduct={(product) => {
                setSelectedProduct(product);
                const firstVariant = product.variants[0];
                setSelectedVariantSku(firstVariant?.sku || "");
                setModalQty(firstVariant?.minOrderQty || 1);
              }}
            />
          )}

          {!isLoggedIn && activeTab !== "catalog" && (
            <section className="panel mx-auto max-w-xl p-8 text-center" role="status">
              <h2 className="m-0 text-xl font-black text-slate-900">Vui lòng đăng nhập để tiếp tục</h2>
              <p className="mt-2 text-sm text-slate-600">
                Giỏ hàng, hồ sơ và tiến độ đơn chỉ hiển thị cho tài khoản đại lý đã được cấp quyền.
              </p>
              <button
                type="button"
                className="primary-button mt-4 min-h-11 justify-center"
                onClick={() => {
                  setPendingPostLoginTab(activeTab);
                  setShowLoginModal(true);
                }}
              >
                Đăng nhập cổng sỉ
              </button>
            </section>
          )}

        {activeTab === "cart" && mode === "customer" && (
          <Cart
            cartItems={cartItems}
            allProducts={allProducts}
            availableCategories={allCategories}
            cartCategoryFilter={cartCategoryFilter}
            setCartCategoryFilter={setCartCategoryFilter}
            cartTotalVal={cartItems.reduce((sum, item) => sum + item.quantity * item.unitPriceSnapshot, 0)}
            paymentIntent={cartPaymentIntent}
            changePaymentIntent={setCartPaymentIntent}
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
            customerTaxCode={customerTaxCode}
            setCustomerTaxCode={setCustomerTaxCode}
            customerNote={customerNote}
            setCustomerNote={setCustomerNote}
            onConfirmCheckout={handleConfirmCheckout}
          />
        )}

        {activeTab === "order" && (
          <OrderTimeline
            isLoggedIn={isLoggedIn}
            mode={mode}
            workingOrder={workingOrder}
            allProducts={allProducts}
            onPayNowClick={handlePayNowClick}
            onUploadProof={uploadPaymentProof}
            onAcceptQuote={handleCustomerAcceptQuote}
            onRequestOrderChange={handleCustomerRequestChange}
            onUpdateRecipientInfo={handleUpdateRecipientInfo}
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
                    <div className="relative w-16 h-16 rounded-full overflow-hidden bg-orange-50 border-2 border-orange-200 flex items-center justify-center text-xl font-bold text-orange-600 shrink-0">
                      {profileAvatarUrl ? (
                        <Image src={profileAvatarUrl} alt="Avatar" fill sizes="64px" className="object-cover" />
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
                                    : ord.paymentStatus === "cod_remaining"
                                      ? "Chờ thanh toán COD"
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
            key={workingOrder.id}
            allOrders={allOrders}
            workingOrder={workingOrder}
            currentUser={currentUser}
            currentUserPermissions={currentUser ? rolePermissions[currentUser.role] ?? [] : []}
            userList={userList}
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
            syncOrder={syncOrder}
            handleAdminQtyChange={handleAdminQtyChange}
            handlePublishQuote={handlePublishQuote}
            confirmDeposit={confirmDeposit}
            rejectPaymentProof={rejectPaymentProof}
            reissuePaymentRequest={reissuePaymentRequest}
            advanceFulfillment={advanceFulfillment}
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
            overviewError={operationsError}
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
            allOrders={allOrders}
            allProducts={allProducts}
            setActiveTab={setActiveTab}
            theme={theme}
          />
        )}

        {activeTab === "admin_users" && isAdmin && (
          <AdminUsers isAdmin={isAdmin} currentUser={currentUser} userList={userList} fetchUsers={fetchUsers} />
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

      {/* 4. MODERN MOBILE-FIRST PRODUCT DETAIL BOTTOMSHEET */}
      {selectedProduct && (() => {
        const activeVariant = selectedProduct.variants.find((v) => v.sku === selectedVariantSku) || selectedProduct.variants[0];
        const moq = activeVariant ? activeVariant.minOrderQty : 1;
        const stock = activeVariant ? activeVariant.stock : 0;
        const wholesalePrice = activeVariant?.wholesalePrice ?? 0;

        return (
          <BottomSheet
            isOpen={Boolean(selectedProduct)}
            onClose={() => {
              setSelectedProduct(null);
            }}
            title={
              <div className="flex items-center gap-2">
                <span className="bg-orange-100 text-orange-900 px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase font-mono">
                  {selectedProduct.category}
                </span>
                <span className="text-xs text-gray-400 font-mono font-bold">MÃ: {selectedProduct.code}</span>
              </div>
            }
            maxWidth="max-w-3xl"
          >
            <div className="flex flex-col gap-5">
              {/* Upper 2-column section: Gallery (left) + Variant selection & CTA (right) */}
              <div className="flex flex-col md:flex-row gap-5">
                {/* Product Gallery with Multi-Image, Swipe & Variant Sync */}
                <div ref={productFlySourceRef} className="md:w-1/2">
                  <ProductGallery product={selectedProduct} activeVariant={activeVariant} />
                </div>

                {/* Product Details & Variant Selection */}
                <div className="md:w-1/2 flex flex-col justify-between text-xs gap-4">
                  <div className="flex flex-col gap-3">
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-[#331B08] font-['Varela_Round'] leading-snug m-0">
                        {selectedProduct.name}
                      </h2>
                    </div>

                    {/* Interactive Variant Pills */}
                    <div className="flex flex-col gap-2 border-t border-dashed border-orange-100 pt-3">
                      <label className="text-[11px] font-bold text-orange-950/80 uppercase tracking-wider flex items-center gap-1">
                        <Sparkles size={12} className="text-orange-500" /> Chọn phân loại sỉ:
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[180px] overflow-y-auto pr-1 overscroll-contain">
                        {selectedProduct.variants.map((v) => {
                          const isSelected = v.sku === (activeVariant?.sku ?? "");
                          return (
                            <button
                              key={v.sku}
                              type="button"
                              className={`p-2.5 rounded-xl border-2 text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                                isSelected
                                  ? "border-orange-500 bg-orange-50/70 shadow-sm"
                                  : "border-orange-100 bg-white hover:border-orange-200"
                              }`}
                              onClick={() => {
                                setSelectedVariantSku(v.sku);
                                setModalQty(v.minOrderQty || 1);
                              }}
                            >
                              {v.imageUrl && (
                                <div className="relative w-9 h-9 rounded-lg overflow-hidden border border-orange-100 bg-white shrink-0 shadow-inner">
                                  <Image src={v.imageUrl} alt={v.label} fill sizes="36px" className="object-contain p-0.5" />
                                </div>
                              )}
                              <div className="flex flex-col flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-xs text-[#331B08] truncate">{v.label}</span>
                                  {isSelected && <Check size={14} className="text-orange-600 shrink-0" />}
                                </div>
                                <div className="flex items-baseline justify-between gap-1 mt-0.5">
                                  <span className="text-xs font-bold text-orange-600 font-mono">
                                    {isLoggedIn && typeof v.wholesalePrice === "number" && v.wholesalePrice > 0 ? formatVnd(v.wholesalePrice) : "🔒 Giá sỉ"}
                                  </span>
                                  <span className="text-[9px] text-gray-500 font-semibold font-mono">
                                    Kho: {v.stock}
                                  </span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Price & Quantity Stepper */}
                    <div className="flex flex-col gap-3 bg-[#FFFDF9] p-3 rounded-2xl border border-orange-100">
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-gray-600 font-bold">Đơn giá bán sỉ:</span>
                        {isLoggedIn && wholesalePrice > 0 ? (
                          <span className="text-lg font-extrabold text-orange-600 font-mono">{formatVnd(wholesalePrice)}</span>
                        ) : (
                          <span className="text-xs font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                            <Lock size={12} /> Đăng nhập để xem giá sỉ
                          </span>
                        )}
                      </div>

                      {isLoggedIn && mode === "customer" && activeVariant && (
                        <div className="flex items-center justify-between gap-3 border-t border-dashed border-orange-100 pt-2">
                          <span className="text-xs font-bold text-orange-950">Số lượng đặt sỉ:</span>
                          <div className="flex items-center gap-1.5 border border-orange-200 rounded-xl p-1 bg-white shadow-sm">
                            <button
                              type="button"
                              className="w-8 h-8 rounded-lg bg-orange-50 hover:bg-orange-100 flex items-center justify-center font-bold text-orange-900 shadow-sm active:scale-90 cursor-pointer disabled:opacity-40"
                              onClick={() => setModalQty((q) => Math.max(moq, q - 1))}
                              disabled={modalQty <= moq}
                              aria-label="Giảm 1"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              className="w-12 text-center font-extrabold text-sm text-[#331B08] bg-transparent border-0 focus:ring-0 p-0 font-mono"
                              value={modalQty}
                              min={moq}
                              onChange={(e) => setModalQty(Math.max(moq, parseInt(e.target.value) || moq))}
                            />
                            <button
                              type="button"
                              className="w-8 h-8 rounded-lg bg-orange-50 hover:bg-orange-100 flex items-center justify-center font-bold text-orange-900 shadow-sm active:scale-90 cursor-pointer"
                              onClick={() => setModalQty((q) => q + 1)}
                              aria-label="Tăng 1"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar with Instant Total Price */}
                  <div className="flex flex-col gap-2.5 border-t border-orange-100 pt-3 mt-auto">
                    {isLoggedIn && mode === "customer" && activeVariant && (
                      <div className="flex justify-between items-center px-1">
                        <span className="text-xs text-gray-500 font-bold">Thành tiền tạm tính:</span>
                        <strong className="text-base font-extrabold text-orange-600 font-mono">
                          {formatVnd(modalQty * wholesalePrice)}
                        </strong>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="tab-button font-bold text-xs py-3 px-4 flex-1 justify-center rounded-xl cursor-pointer"
                        onClick={() => {
                          setSelectedProduct(null);
                        }}
                      >
                        Đóng
                      </button>

                      {!isLoggedIn ? (
                        <button
                          type="button"
                          className="primary-button font-bold text-xs py-3 px-6 flex-[2] justify-center bg-orange-500 hover:bg-orange-600 text-white rounded-xl cursor-pointer shadow-lg flex items-center gap-1.5"
                          onClick={() => {
                            setSelectedProduct(null);
                            setPendingPostLoginTab("catalog");
                            setShowLoginModal(true);
                          }}
                        >
                          <Lock size={15} />
                          <span>Đăng nhập để đặt sỉ</span>
                        </button>
                      ) : (
                        activeVariant && (
                          <button
                            type="button"
                            className="primary-button font-bold text-xs py-3 px-6 flex-[2] justify-center bg-orange-500 hover:bg-orange-600 text-white rounded-xl cursor-pointer shadow-lg flex items-center gap-1.5"
                            disabled={stock <= 0 || wholesalePrice <= 0}
                            onClick={() => handleAddSelectedProductToCart(activeVariant)}
                          >
                            <PackagePlus size={16} />
                            <span>Thêm vào đơn sỉ</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Lower Section: Product Description & Specifications Placed Underneath */}
              <div className="border-t-2 border-dashed border-orange-100 pt-4 mt-1 flex flex-col gap-3">
                <h3 className="text-xs font-bold text-orange-950 uppercase tracking-wider flex items-center gap-1.5 font-['Varela_Round']">
                  <Sparkles size={14} className="text-orange-500" /> Mô tả chi tiết & Thông số sản phẩm
                </h3>
                <div className="bg-[#FFFDF9] p-4 rounded-2xl border border-orange-100/80 text-xs text-gray-700 leading-relaxed font-medium whitespace-pre-line shadow-inner">
                  {selectedProduct.description || "Sản phẩm thú cưng chất lượng cao từ Pet Travel Wholesale. Đạt tiêu chuẩn chất lượng an toàn, thích hợp phân phối sỉ tại các pet shop và phòng khám trên toàn quốc."}
                </div>

                {(selectedProduct.dimensions || selectedProduct.weight || selectedProduct.brand || (selectedProduct.tags && selectedProduct.tags.length > 0)) && (
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    {selectedProduct.brand && (
                      <span className="bg-orange-50 border border-orange-200 text-orange-900 px-3 py-1 rounded-xl font-semibold">
                        🏷️ Thương hiệu: <strong>{selectedProduct.brand}</strong>
                      </span>
                    )}
                    {selectedProduct.dimensions && (
                      <span className="bg-orange-50 border border-orange-200 text-orange-900 px-3 py-1 rounded-xl font-semibold">
                        📐 Kích thước: <strong>{selectedProduct.dimensions}</strong>
                      </span>
                    )}
                    {selectedProduct.weight && (
                      <span className="bg-orange-50 border border-orange-200 text-orange-900 px-3 py-1 rounded-xl font-semibold">
                        ⚖️ Khối lượng: <strong>{selectedProduct.weight}g</strong>
                      </span>
                    )}
                    {selectedProduct.tags && selectedProduct.tags.map((tag) => (
                      <span key={tag} className="bg-white border border-orange-100 text-gray-600 px-2.5 py-1 rounded-xl">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </BottomSheet>
        );
      })()}

      {/* 5. CUTE CREDENTIALS LOGIN BOTTOMSHEET */}
      <BottomSheet
        isOpen={showLoginModal}
        onClose={() => {
          setShowLoginModal(false);
          setPendingPostLoginTab("catalog");
        }}
        title="🐾 Đăng nhập Cổng Đại lý sỉ"
        subtitle="Vui lòng nhập tài khoản đại lý đã được Pet Travel cấp để xem giá sỉ và đặt hàng."
        maxWidth="max-w-sm"
      >
        <form onSubmit={handleCredentialsLogin} className="flex flex-col gap-3.5 mt-1 text-xs">
          <div className="flex flex-col gap-1.5 font-semibold">
            <label className="text-xs font-bold text-orange-950/90">Email hoặc Số điện thoại</label>
            <input
              type="text"
              className="text-input text-sm py-2.5 px-3 rounded-xl border-orange-200"
              placeholder="Email hoặc số điện thoại (0987...)"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5 font-semibold">
            <label className="text-xs font-bold text-orange-950/90">Mật khẩu</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className="text-input text-sm py-2.5 pl-3 pr-10 rounded-xl border-orange-200 w-full"
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 transition"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="primary-button text-sm py-3.5 justify-center font-bold bg-orange-500 hover:bg-orange-600 text-white cursor-pointer mt-2 rounded-xl shadow-lg flex items-center gap-1.5"
            disabled={isLoading}
          >
            <Lock size={15} />
            <span>{isLoading ? "Đang xác thực..." : "Đăng nhập Cổng sỉ"}</span>
          </button>
        </form>
      </BottomSheet>

      {/* 6. B2B WHOLESALE & CO-MARKETING PARTNER MODAL */}
      {showPartnerModal && (
        <B2BPartnerModal
          isOpen={showPartnerModal}
          onClose={() => setShowPartnerModal(false)}
        />
      )}
    </main>
    </ToastProvider>
  );
}
