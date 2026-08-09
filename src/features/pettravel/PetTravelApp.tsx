"use client";

import Image from "next/image";
import {
  AlertTriangle,
  Bell,
  Boxes,
  Building2,
  CheckCircle2,
  LockKeyhole,
  MessageSquare,
  MessageCircle,
  PackageCheck,
  Percent,
  QrCode,
  ReceiptText,
  Search,
  MapPin,
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
  Check,
  Clock
} from "lucide-react";
import { type ReactNode, useMemo, useState, useEffect, useCallback } from "react";
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
  ProductVariant
} from "@/lib/domain";
import { formatVnd, percent } from "@/lib/money";
import {
  categoryNameSchema,
  emailSchema,
  fullNameSchema,
  getValidationErrorMessage,
  loginPasswordSchema,
  optionalUrlSchema,
  passwordSchema,
  phoneSchema,
  productSchema,
  recipientSchema,
  shortTextSchema,
  supplierSchema,
  promotionsPolicySchema,
  vndAmountSchema
} from "@/lib/validation";

type AppMode = "guest" | "customer" | "admin";
type TabKey = "catalog" | "cart" | "order" | "admin" | "admin_products" | "admin_reconciliation" | "admin_invoices" | "settings" | "admin_suppliers" | "admin_categories" | "admin_users" | "profile" | "admin_promotions";

interface ApiUser {
  id: string;
  name: string;
  company: string;
  email: string;
  role: RoleKey;
  isAdmin: boolean;
}

const EMPTY_ORDER: CustomerOrder = {
  id: "", number: "", customerName: "", customerCompany: "", customerId: "",
  commercialStatus: "draft", paymentStatus: "unrequested", fulfillmentStatus: "not_started",
  paymentIntent: "deposit_cod", invoiceRequested: false, updatedAt: new Date().toISOString(),
  items: [], quoteVersions: [], paymentRequests: [], paymentProofs: [], fulfillmentGroups: [], comments: []
};

const DEFAULT_POLICY: AdminPolicy = {
  freeShippingThreshold: 5000000, defaultDepositRate: 0.3,
  maxOperatorDiscountRate: 0.08, requireManagerApprovalAbove: 500000
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

interface AdminUserRow {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  avatarUrl: string;
  role: string;
  company: string;
  createdAt: string;
}

interface PromotionsPolicyState extends AdminPolicy {
  giftThreshold?: number;
  giftName?: string;
}

interface ProfileUpdatePayload {
  fullName?: string;
  avatarUrl?: string;
  newPassword?: string;
}

interface OrderMutationResponse {
  order: CustomerOrder;
}

function latestQuote(order: CustomerOrder) {
  if (order.quoteVersions.length === 0) {
    return { id: "", version: 0, status: "draft" as const, subtotal: 0, adjustments: [], finalTotal: 0, depositAmount: 0, codRemaining: 0, expiresAt: "" };
  }
  return order.quoteVersions[order.quoteVersions.length - 1];
}

export function PetTravelApp() {
  const [mode, setMode] = useState<AppMode>("guest");
  const [activeTab, setActiveTab] = useState<TabKey>("catalog");
  const [workingOrder, setWorkingOrder] = useState<CustomerOrder>(EMPTY_ORDER);

  // Auth & data state
  const [currentUser, setCurrentUser] = useState<ApiUser | null>(null);
  const [allOrders, setAllOrders] = useState<CustomerOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [adminPolicy, setAdminPolicy] = useState<AdminPolicy>(DEFAULT_POLICY);
  const [rolePermissions, setRolePermissions] = useState<Record<RoleKey, PermissionKey[]>>({} as Record<RoleKey, PermissionKey[]>);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Admin details & edit state
  const [adminOrderItems, setAdminOrderItems] = useState<CustomerOrder["items"]>([]);
  const [isOrderModified, setIsOrderModified] = useState<boolean>(false);
  const [adminCategoryFilter, setAdminCategoryFilter] = useState<string>("Tất cả");
  const [adminSupplierFilter, setAdminSupplierFilter] = useState<string>("Tất cả");

  // Cart & Checkout new state
  const [cartCategoryFilter, setCartCategoryFilter] = useState<string>("Tất cả");
  const [showCheckoutModal, setShowCheckoutModal] = useState<boolean>(false);
  const [recipientName, setRecipientName] = useState<string>("");
  const [recipientPhone, setRecipientPhone] = useState<string>("");
  const [recipientAddress, setRecipientAddress] = useState<string>("");

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

  // Auth & Profile states
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [loginEmail, setLoginEmail] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");
  const [profileFullName, setProfileFullName] = useState<string>("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string>("");
  const [profileNewPassword, setProfileNewPassword] = useState<string>("");

  // Admin User management states
  const [userList, setUserList] = useState<AdminUserRow[]>([]);
  const [createFullName, setCreateFullName] = useState<string>("");
  const [createEmail, setCreateEmail] = useState<string>("");
  const [createPhone, setCreatePhone] = useState<string>("");
  const [createPassword, setCreatePassword] = useState<string>("");
  const [createRole, setCreateRole] = useState<string>("customer_owner");
  const [createCompany, setCreateCompany] = useState<string>("");

  // Admin Promotions settings states
  const [promotionsPolicy, setPromotionsPolicy] = useState<PromotionsPolicyState>({
    freeShippingThreshold: 5000000,
    defaultDepositRate: 0.3,
    maxOperatorDiscountRate: 0.08,
    requireManagerApprovalAbove: 500000,
    giftThreshold: 10000000,
    giftName: "Bát ăn inox cao cấp chống trượt"
  });

  // Dynamic Categories state
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState<string>("");
  const [editingCategoryOld, setEditingCategoryOld] = useState<string | null>(null);
  const [editingCategoryNew, setEditingCategoryNew] = useState<string>("");

  // Dynamic Suppliers management state
  const [showSupplierForm, setShowSupplierForm] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supCode, setSupCode] = useState<string>("");
  const [supName, setSupName] = useState<string>("");
  const [supLeadTime, setSupLeadTime] = useState<number>(3);
  const [supAdminOnly, setSupAdminOnly] = useState<boolean>(true);

  // Product Management states
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [showProductForm, setShowProductForm] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formName, setFormName] = useState<string>("");
  const [formCode, setFormCode] = useState<string>("");
  const [formCategory, setFormCategory] = useState<string>("");
  const [formProductSupplier, setFormProductSupplier] = useState<string>("");
  const [formImage, setFormImage] = useState<string>("/product-food.svg");
  const [formImages, setFormImages] = useState<string[]>([]);
  const [newImageUrlInput, setNewImageUrlInput] = useState<string>("");
  const [formDimensions, setFormDimensions] = useState<string>("");
  const [formWeight, setFormWeight] = useState<number>(0);
  const [formDescription, setFormDescription] = useState<string>("");
  const [formTags, setFormTags] = useState<string>("");
  const [formVariants, setFormVariants] = useState<ProductVariant[]>([]);

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

  function updateFormCode(nextCode: string) {
    setFormCode(nextCode);
    setFormVariants((prev) => syncVariantSkus(nextCode, prev));
  }

  // Cart state
  const [cartItems, setCartItems] = useState<Array<{
    id: string; productCode: string; productName: string;
    variantSku: string; variantLabel: string; quantity: number;
    unitPriceSnapshot: number; supplierId: string;
  }>>([]);

  const cartTotalVal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.quantity * item.unitPriceSnapshot, 0);
  }, [cartItems]);

  const groupedCartItems = useMemo(() => {
    const groups: Record<string, {
      productCode: string;
      productName: string;
      productImage: string;
      category: string;
      brand: string;
      items: typeof cartItems;
    }> = {};

    cartItems.forEach((item) => {
      const parent = allProducts.find((p) => p.code === item.productCode);
      const category = parent?.category ?? "Tất cả";
      const brand = parent?.brand ?? "";
      const image = parent?.imageUrl ?? "/product-food.svg";

      if (!groups[item.productCode]) {
        groups[item.productCode] = {
          productCode: item.productCode,
          productName: item.productName,
          productImage: image,
          category,
          brand,
          items: []
        };
      }
      groups[item.productCode].items.push(item);
    });

    return Object.values(groups).filter((group) => {
      return cartCategoryFilter === "Tất cả" || group.category === cartCategoryFilter;
    });
  }, [cartItems, allProducts, cartCategoryFilter]);

  // Admin adjustments state
  const [adminDiscount, setAdminDiscount] = useState<number>(0);
  const [adminShippingFee, setAdminShippingFee] = useState<number>(0);
  const [shippingFeeOption, setShippingFeeOption] = useState<"included" | "separate_cod">("included");
  const [customDepositInput, setCustomDepositInput] = useState<string>("");
  const [isManagerApproved, setIsManagerApproved] = useState<boolean>(false);

  // ── API fetch helpers ──────────────────────────────────────
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
      // Auto-select first order for customer, or keep selected for admin
      if (data.orders?.length > 0) {
        const firstOrder = data.orders[0];
        if (!selectedOrderId) {
          setSelectedOrderId(firstOrder.id);
          setWorkingOrder(firstOrder);
          setCartItems(firstOrder.items?.map((item: CustomerOrder["items"][number]) => ({ ...item })) ?? []);
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

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    try {
      const category = categoryNameSchema.parse(newCategoryName);
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Không thể thêm danh mục.");
        return;
      }
      if (res.ok) {
        setNewCategoryName("");
        await fetchCategories();
      }
    } catch (error) {
      alert(getValidationErrorMessage(error, "Tên danh mục không hợp lệ."));
    }
  }

  async function handleEditCategory(oldCat: string, newCat: string) {
    try {
      const oldCategory = categoryNameSchema.parse(oldCat);
      const newCategory = categoryNameSchema.parse(newCat);
      const res = await fetch("/api/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldCategory, newCategory })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Không thể sửa danh mục.");
        return;
      }
      if (res.ok) {
        setEditingCategoryOld(null);
        await fetchCategories();
      }
    } catch (error) {
      alert(getValidationErrorMessage(error, "Tên danh mục không hợp lệ."));
    }
  }

  async function handleDeleteCategory(cat: string) {
    if (confirm(`Bạn có chắc muốn xóa danh mục "${cat}"? Các sản phẩm thuộc danh mục này có thể cần cập nhật lại.`)) {
      try {
        const res = await fetch(`/api/categories?category=${encodeURIComponent(cat)}`, {
          method: "DELETE"
        });
        if (res.ok) {
          await fetchCategories();
        }
      } catch { /* silent */ }
    }
  }

  async function handleSaveSupplier(e: React.FormEvent) {
    e.preventDefault();
    if (!supCode.trim() || !supName.trim()) {
      alert("Vui lòng nhập đầy đủ Mã và Tên nhà cung cấp!");
      return;
    }
    const supplierData: Supplier = {
      id: editingSupplier?.id || `sup_${Date.now()}`,
      code: supCode.trim(),
      name: supName.trim(),
      leadTimeDays: Number(supLeadTime) || 3,
      adminOnly: supAdminOnly
    };
    try {
      const validatedSupplier = supplierSchema.parse(supplierData) as Supplier;
      const res = await fetch("/api/suppliers", {
        method: editingSupplier ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validatedSupplier)
      });
      if (res.ok) {
        setShowSupplierForm(false);
        setEditingSupplier(null);
        setSupCode("");
        setSupName("");
        setSupLeadTime(3);
        setSupAdminOnly(true);
        
        // Re-fetch suppliers
        const suppRes = await fetch("/api/suppliers");
        if (suppRes.ok) {
          const suppData = await suppRes.json();
          setSuppliers(suppData.suppliers ?? []);
        }
      } else {
        const data = await res.json();
        alert(data.error || "Không thể lưu nhà cung cấp.");
      }
    } catch (error) {
      alert(getValidationErrorMessage(error, "Dữ liệu nhà cung cấp không hợp lệ."));
    }
  }

  async function handleDeleteSupplier(id: string, name: string) {
    if (confirm(`Bạn có chắc muốn xóa nhà cung cấp "${name}"?`)) {
      try {
        const res = await fetch(`/api/suppliers?id=${id}`, {
          method: "DELETE"
        });
        if (res.ok) {
          const suppRes = await fetch("/api/suppliers");
          if (suppRes.ok) {
            const suppData = await suppRes.json();
            setSuppliers(suppData.suppliers ?? []);
          }
        }
      } catch { /* silent */ }
    }
  }

  const handleAddImage = () => {
    try {
      const imageUrl = optionalUrlSchema.parse(newImageUrlInput);
      if (!imageUrl) return;
      if (!formImages.includes(imageUrl)) {
        const updated = [...formImages, imageUrl];
        setFormImages(updated);
        if (!formImage || formImages.length === 0) {
          setFormImage(imageUrl);
        }
      }
      setNewImageUrlInput("");
    } catch (error) {
      alert(getValidationErrorMessage(error, "Đường dẫn ảnh không hợp lệ."));
    }
  };

  /** Login via credentials (email + password) */
  async function handleCredentialsLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) {
      alert("Vui lòng nhập đầy đủ Email và Mật khẩu!");
      return;
    }
    setIsLoading(true);
    try {
      const email = emailSchema.parse(loginEmail);
      const password = loginPasswordSchema.parse(loginPassword);
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Đăng nhập thất bại.");
        return;
      }
      setCurrentUser(data.user);
      const targetMode = data.user.isAdmin ? "admin" : "customer";
      setMode(targetMode);
      setActiveTab(targetMode === "admin" ? "admin" : "catalog");
      setShowLoginModal(false);
      setLoginEmail("");
      setLoginPassword("");

      await fetchProducts();
      await fetchOrders();
      await fetchCategories();
      if (targetMode === "admin") {
        await fetchAdminData();
        await fetchUsers();
        await fetchPromotions();
      } else {
        setProfileFullName(data.user.name);
      }
    } catch {
      alert("Lỗi kết nối đăng nhập.");
    } finally {
      setIsLoading(false);
    }
  }

  /** Admin creates User or Admin account */
  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!createFullName.trim() || !createEmail.trim() || !createPhone.trim() || !createPassword) {
      alert("Vui lòng điền đầy đủ các thông tin bắt buộc!");
      return;
    }
    if (createPassword.length < 12) {
      alert("Mật khẩu ban đầu phải có ít nhất 12 ký tự. Ví dụ: Hanni@0601PT");
      return;
    }
    try {
      const payload = {
        fullName: fullNameSchema.parse(createFullName),
        email: emailSchema.parse(createEmail),
        phone: phoneSchema.parse(createPhone),
        password: passwordSchema.parse(createPassword),
        role: createRole,
        company: createRole === "customer_owner" ? shortTextSchema("Tên tổ chức", 2, 160).parse(createCompany) : undefined
      };
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Lỗi tạo tài khoản.");
        return;
      }
      alert(data.message || "Tạo tài khoản thành công!");
      setCreateFullName("");
      setCreateEmail("");
      setCreatePhone("");
      setCreatePassword("");
      setCreateCompany("");
      await fetchUsers();
    } catch {
      alert("Lỗi kết nối.");
    }
  }

  /** Update profile name, avatar and password */
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
        alert(data.error || "Lỗi cập nhật hồ sơ.");
        return;
      }
      alert(data.message || "Cập nhật hồ sơ thành công!");
      setProfileNewPassword("");
      if (currentUser) {
        setCurrentUser({
          ...currentUser,
          name: profileFullName.trim() || currentUser.name
        });
      }
    } catch {
      alert("Lỗi kết nối.");
    }
  }

  /** Admin saves promotions config */
  async function handleSavePromotions(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/promotions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(promotionsPolicySchema.parse(promotionsPolicy))
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Không thể lưu cấu hình.");
        return;
      }
      alert("Lưu cấu hình ưu đãi thành công!");
      await fetchPromotions();
    } catch {
      alert("Lỗi kết nối.");
    }
  }



  /** Logout: clear cookie + reset state */
  async function handleLogout() {
    await fetch("/api/auth/me", { method: "DELETE" });
    setMode("guest");
    setCurrentUser(null);
    setAllOrders([]);
    setWorkingOrder(EMPTY_ORDER);
    setCartItems([]);
    setAllProducts([]);
    setSuppliers([]);
    setSelectedOrderId(null);
  }

  /** Admin selects a specific order to work on */
  function selectOrder(orderId: string) {
    const order = allOrders.find((o) => o.id === orderId);
    if (!order) return;
    setSelectedOrderId(orderId);
    setWorkingOrder(order);
    setCartItems(order.items.map((item) => ({ ...item })));
    setAdminOrderItems(order.items.map((item) => ({ ...item })));
    setIsOrderModified(false);
    
    const q = order.quoteVersions[order.quoteVersions.length - 1];
    if (q) {
      const disc = q.adjustments.find((a) => a.type === "discount");
      const ship = q.adjustments.find((a) => a.type === "shipping_fee");
      setAdminDiscount(disc ? Math.abs(disc.amount) : 0);
      setAdminShippingFee(ship ? ship.amount : 0);
    } else {
      setAdminDiscount(0);
      setAdminShippingFee(0);
    }
  }

  /** Sync updated order state to server database and local state */
  async function syncOrder(order: CustomerOrder) {
    try {
      const res = await fetch("/api/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order)
      });
      if (!res.ok) return;
      const data = await res.json() as OrderMutationResponse;
      setAllOrders((prev) => prev.map((o) => (o.id === data.order.id ? data.order : o)));
      setWorkingOrder(data.order);
      setAdminOrderItems(data.order.items.map((item) => ({ ...item })));
      setIsOrderModified(false);
    } catch { /* silent */ }
  }

  /** Handle Admin updating quantity of an order item */
  function handleAdminQtyChange(itemId: string, newQty: number) {
    setAdminOrderItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, quantity: Math.max(1, Math.min(10_000, Math.trunc(newQty || 1))) } : item
      )
    );
    setIsOrderModified(true);
  }

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

  // Restore user session on mount
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setCurrentUser(data.user);
            const targetMode = data.user.isAdmin ? "admin" : "customer";
            setMode(targetMode);
            setActiveTab(prev => {
              if (prev === "catalog") {
                return targetMode === "admin" ? "admin" : "catalog";
              }
              return prev;
            });

            await fetchProducts();
            await fetchOrders();
            await fetchCategories();
            if (targetMode === "admin") {
              await fetchAdminData();
              await fetchUsers();
              await fetchPromotions();
            } else {
              setProfileFullName(data.user.name);
              setProfileAvatarUrl(data.user.avatarUrl ?? "");
            }
          } else {
            setMode("guest");
            await fetchProducts();
            await fetchCategories();
          }
        } else {
          setMode("guest");
          await fetchProducts();
          await fetchCategories();
        }
      } catch {
        setMode("guest");
        await fetchProducts();
        await fetchCategories();
      }
    }
    checkSession();
    // Initial session restore intentionally runs once; fetch helpers are stable enough for this mount-only bootstrap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeUser = currentUser ? {
    id: currentUser.id, name: currentUser.name, company: currentUser.company,
    email: currentUser.email, role: currentUser.role, isAdmin: currentUser.isAdmin
  } as UserAccount : undefined;
  const isLoggedIn = mode !== "guest";
  const isAdmin = mode === "admin";
  const quote = latestQuote(workingOrder);

  // Computed values
  const isLockedByOther = isAdmin && !!workingOrder.assignedStaffId && workingOrder.assignedStaffId !== currentUser?.id && currentUser?.role !== "super_admin";
  const requiresManagerApproval = (adminDiscount / (quote?.subtotal || 1) > adminPolicy.maxOperatorDiscountRate) || (adminDiscount > adminPolicy.requireManagerApprovalAbove);
  const isOrderFrozen = isLockedByOther || workingOrder.paymentStatus.includes("uploaded") || workingOrder.paymentStatus.includes("confirmed") || workingOrder.paymentStatus === "paid";

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
  async function changePaymentIntent(intent: PaymentIntent) {
    const updatedOrder: CustomerOrder = {
      ...workingOrder,
      paymentIntent: intent,
      paymentStatus: "unrequested",
      paymentRequests: [],
      comments: [
        {
          id: `c_intent_${Date.now()}`,
          author: workingOrder.customerName,
          audience: "customer_visible",
          message: intent === "deposit_cod"
            ? `Đại lý đề xuất phương án thanh toán: Đặt cọc trước 30% + Nhận hàng trả nốt (COD). Bản báo giá cũ hết hiệu lực, chờ nhân viên thẩm định lại.`
            : "Đại lý đề xuất phương án thanh toán: Thanh toán trước 100%. Bản báo giá cũ hết hiệu lực, chờ nhân viên thẩm định lại.",
          createdAt: new Date().toISOString()
        },
        ...workingOrder.comments
      ],
      updatedAt: new Date().toISOString()
    };
    await syncOrder(updatedOrder);
  }

  // 2. Admin publishes a new Quote Version (Gửi khách xác nhận)
  async function handlePublishQuote() {
    try {
      adminOrderItems.forEach((item) => {
        vndAmountSchema("Đơn giá").parse(item.unitPriceSnapshot);
        if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 10_000) {
          throw new Error(`Số lượng của ${item.productName} phải từ 1 đến 10.000.`);
        }
      });
      vndAmountSchema("Chiết khấu").parse(adminDiscount);
      vndAmountSchema("Phí ship").parse(adminShippingFee);
      if (customDepositInput.trim()) {
        vndAmountSchema("Số tiền cọc tùy chỉnh").parse(Number(customDepositInput));
      }
    } catch (error) {
      alert(getValidationErrorMessage(error, "Dữ liệu báo giá không hợp lệ."));
      return;
    }

    const subtotal = adminOrderItems.reduce((sum, item) => sum + item.quantity * item.unitPriceSnapshot, 0);

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

    const isDeposit = workingOrder.paymentIntent === "deposit_cod";
    const depositRate = isDeposit ? adminPolicy.defaultDepositRate : 1.0;
    const reqAmount = isDeposit
      ? (customDepositInput ? parseInt(customDepositInput, 10) : Math.round(finalTotal * depositRate))
      : finalTotal;
    const codRemaining = isDeposit ? finalTotal - reqAmount : 0;

    const nextVersion = workingOrder.quoteVersions.length + 1;
    const newQuote = {
      id: `q_${nextVersion}_${Date.now()}`,
      version: nextVersion,
      status: "published" as const,
      subtotal,
      adjustments,
      finalTotal,
      depositAmount: reqAmount,
      codRemaining,
      shippingFeeOption,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };

    const updatedRequests = workingOrder.paymentRequests.map((req) =>
      req.status === "active" ? { ...req, status: "superseded" as const } : req
    );

    const newComment = {
      id: `c_${Date.now()}`,
      author: "Ban Quản trị Pet Travel",
      audience: "customer_visible" as const,
      message: `Ban vận hành đã kiểm tra đơn hàng và phát hành Bản báo giá chính thức mới (lần ${nextVersion}). Số tiền cọc yêu cầu: ${formatVnd(reqAmount)}. Vui lòng kiểm tra và bấm Thanh toán ngay.`,
      createdAt: new Date().toISOString()
    };

    const updatedOrder: CustomerOrder = {
      ...workingOrder,
      items: adminOrderItems.map((item) => ({ ...item })),
      commercialStatus: "quoted",
      paymentStatus: isDeposit ? "deposit_requested" : "full_requested",
      quoteVersions: [...workingOrder.quoteVersions.map(q => ({ ...q, status: "superseded" as const })), newQuote],
      paymentRequests: updatedRequests,
      comments: [newComment, ...workingOrder.comments],
      updatedAt: new Date().toISOString()
    };

    await syncOrder(updatedOrder);
  }

  // 4. Customer uploads proof of payment
  async function simulateProofUpload() {
    const activeRequest = workingOrder.paymentRequests[workingOrder.paymentRequests.length - 1];
    if (!activeRequest || activeRequest.status !== "active") return;

    const updatedRequests = workingOrder.paymentRequests.map((req, idx) =>
      idx === workingOrder.paymentRequests.length - 1 ? { ...req, status: "uploaded" as const } : req
    );

    const updatedOrder: CustomerOrder = {
      ...workingOrder,
      paymentStatus: workingOrder.paymentIntent === "deposit_cod" ? "deposit_uploaded" : "full_uploaded",
      paymentRequests: updatedRequests,
      paymentProofs: [
        {
          id: `proof_${Date.now()}`,
          paymentRequestId: activeRequest.id,
          fileName: "bien-lai-chuyen-tien-thanh-cong.jpg",
          uploadedAt: new Date().toISOString(),
          status: "pending_admin_confirmation" as const
        },
        ...workingOrder.paymentProofs
      ],
      comments: [
        {
          id: `c_upload_${Date.now()}`,
          author: workingOrder.customerName,
          audience: "customer_visible",
          message: "Đại lý đã tải lên hình ảnh biên lai thành công. Đơn hàng hiện đã bị đóng băng chỉnh sửa để kế toán đối soát thực tế.",
          createdAt: new Date().toISOString()
        },
        ...workingOrder.comments
      ],
      updatedAt: new Date().toISOString()
    };
    await syncOrder(updatedOrder);
  }

  // 5. Accountant confirms payment (Locks order and payments)
  async function confirmDeposit() {
    const updatedRequests = workingOrder.paymentRequests.map((req, idx) =>
      idx === workingOrder.paymentRequests.length - 1 ? { ...req, status: "confirmed" as const } : req
    );
    const updatedProofs = workingOrder.paymentProofs.map((proof, idx) =>
      idx === 0 ? { ...proof, status: "accepted" as const } : proof
    );

    const isDeposit = workingOrder.paymentIntent === "deposit_cod";

    const updatedOrder: CustomerOrder = {
      ...workingOrder,
      commercialStatus: "locked" as const,
      paymentStatus: isDeposit ? "deposit_confirmed" : "paid",
      fulfillmentStatus: "packing" as const,
      paymentRequests: updatedRequests,
      paymentProofs: updatedProofs,
      comments: [
        {
          id: `c_conf_${Date.now()}`,
          author: "Ban Quản trị Pet Travel",
          audience: "customer_visible",
          message: "Bộ phận kế toán xác nhận tiền đã vào tài khoản ngân hàng. Đơn hàng đã được khóa giao dịch thành công và chuyển cho kho đóng hàng.",
          createdAt: new Date().toISOString()
        },
        ...workingOrder.comments
      ],
      updatedAt: new Date().toISOString()
    };
    await syncOrder(updatedOrder);
  }

  // 6. Gán mã vận đơn
  async function attachShipment() {
    const updatedOrder: CustomerOrder = {
      ...workingOrder,
      fulfillmentStatus: "shipped",
      shipment: {
        carrier: "Giao Hàng Nhanh (GHN)",
        trackingCode: "GHN982601448",
        shippingFee: 90000,
        eta: "2026-08-10",
        note: "Giao giờ hành chính, thu hộ phần còn lại COD nếu có."
      },
      comments: [
        {
          id: `c_ship_${Date.now()}`,
          author: "Ban Quản trị Pet Travel",
          audience: "customer_visible",
          message: "Đơn hàng đã được bàn giao cho đối tác vận chuyển GHN. Mã vận đơn: GHN982601448.",
          createdAt: new Date().toISOString()
        },
        ...workingOrder.comments
      ],
      updatedAt: new Date().toISOString()
    };
    await syncOrder(updatedOrder);
  }

  // Shopping Cart handlers
  function addToCart(variantSku: string, productCode: string, productName: string, variantLabel: string, price: number, supplierId: string, qty: number = 1) {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.variantSku === variantSku);
      if (existing) {
        return prev.map((item) =>
          item.variantSku === variantSku ? { ...item, quantity: item.quantity + qty } : item
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
        .map((item) =>
          item.variantSku === sku ? { ...item, quantity: Math.max(0, Math.min(10_000, item.quantity + delta)) } : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  // 7. Customer submits cart proposal (Initial Confirm or Updated Buy More proposal)
  async function handleSubmitCartProposal() {
    try {
      if (cartItems.length === 0) throw new Error("Giỏ hàng chưa có sản phẩm.");
      cartItems.forEach((item) => {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 10_000) {
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

    // Check if updating an existing order or creating a new one
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
        quoteVersions: [...workingOrder.quoteVersions.map(q => ({ ...q, status: "superseded" as const })), nextQuote],
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
        if (!res.ok) return;
        const data = await res.json() as OrderMutationResponse;
        setWorkingOrder(data.order);
        setAllOrders((prev) => [data.order, ...prev]);
        setSelectedOrderId(data.order.id);
        setCartItems(data.order.items.map((item) => ({ ...item })));
        setActiveTab("order");
      } catch { /* silent */ }
    }
  }

  // 8. "Mua thêm" (Buy More) Action
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

  // 9. Customer Checkout Confirmation (Pay Now Form Submission)
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
      paymentStatus: isDeposit ? "deposit_uploaded" : "full_uploaded", // directly upload simulated receipt
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
          message: `Đại lý đã khóa đơn để thanh toán. Thông tin nhận hàng: ${recipientName} (${recipientPhone}) - ${recipientAddress}. Số tiền chuyển khoản: ${formatVnd(reqAmount)}.`,
          createdAt: new Date().toISOString()
        },
        ...workingOrder.comments
      ],
      updatedAt: new Date().toISOString()
    };

    await syncOrder(updatedOrder);
    setShowCheckoutModal(false);
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

  const filteredAdminOrderItems = useMemo(() => {
    return adminOrderItems.filter((item) => {
      const parent = allProducts.find((p) => p.code === item.productCode);
      const category = parent?.category ?? "Tất cả";
      
      const matchCategory = adminCategoryFilter === "Tất cả" || category === adminCategoryFilter;
      const matchSupplier = adminSupplierFilter === "Tất cả" || item.supplierId === adminSupplierFilter;
      
      return matchCategory && matchSupplier;
    });
  }, [adminOrderItems, allProducts, adminCategoryFilter, adminSupplierFilter]);



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
        {!isLoggedIn ? (
          <div className="panel p-4 bg-[#FFFDF9] border border-orange-100 rounded-2xl flex flex-col gap-2">
            <p className="m-0 text-xs font-bold text-[#331B08]/70">Chào mừng khách ghé thăm!</p>
            <button
              type="button"
              className="w-full text-xs font-bold py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl cursor-pointer"
              onClick={() => setShowLoginModal(true)}
            >
              Đăng nhập Đại lý
            </button>
          </div>
        ) : (
          <div className="panel p-4 bg-[#FFFDF9] border border-orange-100 rounded-2xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-sm">
                {activeUser?.name?.charAt(0) || "U"}
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
              onClick={handleLogout}
            >
              <LogOut size={16} />
            </button>
          </div>
        )}

        {/* NAVIGATION TABS */}
        <nav className="tabs flex flex-col gap-2 mt-2" aria-label="Điều hướng">
          {!isLoggedIn ? (
            <button
              className="tab-button w-full justify-start"
              type="button"
              data-active={activeTab === "catalog"}
              onClick={() => setActiveTab("catalog")}
            >
              <Search size={18} />
              Cửa hàng bán sỉ
            </button>
          ) : mode === "customer" ? (
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
                  <span className="ml-auto bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                    {formatVnd(cartTotalVal)}
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
              <button
                className="tab-button w-full justify-start"
                type="button"
                data-active={activeTab === "profile"}
                onClick={() => {
                  setActiveTab("profile");
                  setProfileFullName(currentUser?.name || "");
                }}
              >
                <UserRound size={18} />
                Hồ sơ & Đơn sỉ của tôi
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
                data-active={activeTab === "admin_suppliers"}
                onClick={() => setActiveTab("admin_suppliers")}
              >
                <Building2 size={18} />
                Quản lý nhà cung cấp
              </button>
              <button
                className="tab-button w-full justify-start"
                type="button"
                data-active={activeTab === "admin_categories"}
                onClick={() => setActiveTab("admin_categories")}
              >
                <Boxes size={18} />
                Quản lý danh mục
              </button>
              <button
                className="tab-button w-full justify-start"
                type="button"
                data-active={activeTab === "admin_users"}
                onClick={() => {
                  setActiveTab("admin_users");
                  fetchUsers();
                }}
              >
                <Users size={18} />
                Quản lý tài khoản
              </button>
              <button
                className="tab-button w-full justify-start"
                type="button"
                data-active={activeTab === "admin_promotions"}
                onClick={() => {
                  setActiveTab("admin_promotions");
                  fetchPromotions();
                }}
              >
                <Percent size={18} />
                Cấu hình ưu đãi
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
        <header className="topbar animate-fade-in">
          <div>
            <p className="muted m-0 text-[10px] font-mono font-bold uppercase tracking-wider">
              Cửa hàng sỉ Pet Travel / {!isLoggedIn ? "Khách ghé thăm" : isAdmin ? "Cổng quản trị" : "Cổng Đại lý"}
            </p>
            <h2 className="text-xl font-bold text-[#331B08] mt-1">
              {!isLoggedIn ? "Xin chào đối tác sỉ đáng yêu! 👋" : `Xin chào, ${currentUser?.name || "Đại lý"}! 👋`}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input
                type="text"
                className="text-input pl-10 text-sm max-w-[200px] pr-4 py-2"
                placeholder="Tìm sản phẩm, SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search className="absolute left-3 top-3 text-orange-400" size={16} />
            </div>

            {!isLoggedIn ? (
              <>
                <button
                  className="tab-button text-xs py-2 px-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl flex items-center gap-1 cursor-pointer transition"
                  type="button"
                  onClick={() => setShowLoginModal(true)}
                >
                  <LockKeyhole size={14} />
                  Đăng nhập
                </button>
              </>
            ) : (
              <>
                {!isAdmin && mode === "customer" && (
                  <button
                    className="tab-button text-xs py-2 px-3 bg-orange-100 hover:bg-orange-200 border-orange-200 font-bold rounded-xl flex items-center gap-1.5 cursor-pointer text-orange-800 transition"
                    type="button"
                    onClick={() => setActiveTab("cart")}
                  >
                    <ShoppingCart size={15} />
                    <span>Giỏ hàng: {formatVnd(cartTotalVal)}</span>
                  </button>
                )}
                <button className="icon-button" aria-label="Thông báo" type="button">
                  <Bell size={18} />
                </button>
              </>
            )}
          </div>
        </header>



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
                    <div className="relative aspect-square w-full bg-[#FFFBEB] border-b border-orange-100 shrink-0">
                      <Image src={product.imageUrl} alt={product.name} fill className="object-cover" />
                      <span className="absolute top-2 left-2 bg-[#FFFDF9] border border-orange-100 text-[9px] px-2 py-0.5 rounded-full font-bold text-orange-950 shadow-sm z-10">
                        {product.category}
                      </span>
                    </div>

                    {!isLoggedIn ? (
                      <div className="product-body text-center p-2 flex flex-col justify-between h-full">
                        <h3 className="m-0 text-xs font-bold text-[#331B08] line-clamp-2 leading-tight">{product.name}</h3>
                        <span className="text-[9px] text-orange-600 font-bold block mt-1">🐾 Đăng nhập</span>
                      </div>
                    ) : (
                      <div className="product-body p-2 flex flex-col justify-between h-full gap-1">
                        <div>
                          <p className="muted m-0 text-[8px] font-mono font-bold leading-none">{product.code}</p>
                          <h3 className="m-0 text-xs font-bold text-[#331B08] mt-1 line-clamp-1 leading-snug">{product.name}</h3>
                        </div>
                        <div className="flex items-center justify-between border-t border-dashed border-orange-100 pt-1.5 mt-auto">
                          <span className="text-[9px] muted font-bold uppercase">{product.category}</span>
                          <span className="text-[9px] text-orange-950 font-extrabold bg-[#FFEEDD] border border-orange-100 rounded-full px-1.5 py-0.5 shrink-0">
                            Còn: {totalStock}
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
              <div className="section-title flex justify-between items-center">
                <h3 className="text-lg font-bold">🛒 Danh sách hàng sỉ đề xuất</h3>
                <span className="bg-orange-100 text-orange-700 text-xs px-2.5 py-0.5 rounded-full font-bold">
                  {cartItems.reduce((acc, curr) => acc + curr.quantity, 0)} sản phẩm
                </span>
              </div>

              {/* Lọc giỏ hàng theo category */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {["Tất cả", "Túi vận chuyển", "Ăn uống du lịch", "Vệ sinh"].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`tab-button min-h-[32px] text-xs py-1 px-3 ${cartCategoryFilter === cat ? 'bg-orange-500 text-white border-orange-600' : 'bg-white border-orange-100'}`}
                    onClick={() => setCartCategoryFilter(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {groupedCartItems.length === 0 ? (
                <div className="text-center py-8 muted text-sm font-semibold">
                  Giỏ hàng sỉ đang trống. Vui lòng quay lại Cửa hàng để thêm sản phẩm sỉ.
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 max-h-[480px] overflow-y-auto pr-1">
                    {groupedCartItems.map((group) => (
                      <div className="p-4 border-2 border-orange-100 rounded-3xl bg-white flex flex-col gap-3" key={group.productCode}>
                        {/* Header sản phẩm */}
                        <div className="flex items-center gap-3 pb-2 border-b border-dashed border-orange-100">
                          <div className="relative w-10 h-10 rounded-xl bg-orange-50 overflow-hidden flex items-center justify-center border border-orange-100 shrink-0">
                            <Image src={group.productImage} alt={group.productName} fill className="object-cover" />
                          </div>
                          <div>
                            <strong className="text-xs text-[#331B08] block">{group.productName}</strong>
                            <span className="text-[9px] muted font-bold uppercase tracking-wider">{group.category} · {group.brand}</span>
                          </div>
                        </div>

                        {/* Danh sách phân loại của sản phẩm */}
                        <div className="flex flex-col gap-2.5">
                          {group.items.map((item) => (
                            <div className="flex items-center justify-between gap-4 text-xs pl-1" key={item.variantSku}>
                              <div className="flex-grow">
                                <span className="font-semibold text-orange-950">{item.variantLabel}</span>
                                <br />
                                <span className="text-[9px] muted">{item.variantSku}</span>
                              </div>
                              
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1 border border-orange-200 rounded-xl p-0.5 bg-orange-50/25">
                                  <button
                                    type="button"
                                    className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-xs font-bold text-[#78350F] shadow-sm active:scale-90 cursor-pointer"
                                    onClick={() => updateCartQty(item.variantSku, -1)}
                                  >
                                    -
                                  </button>
                                  <span className="text-xs font-bold text-[#331B08] min-w-[16px] text-center">{item.quantity}</span>
                                  <button
                                    type="button"
                                    className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-xs font-bold text-[#78350F] shadow-sm active:scale-90 cursor-pointer"
                                    onClick={() => updateCartQty(item.variantSku, 1)}
                                  >
                                    +
                                  </button>
                                </div>
                                
                                <div className="text-right min-w-[90px]">
                                  <strong className="text-xs text-[#331B08] block">{formatVnd(item.quantity * item.unitPriceSnapshot)}</strong>
                                  <span className="text-[9px] muted">{formatVnd(item.unitPriceSnapshot)}/cái</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-dashed border-orange-100 pt-3 flex justify-between items-center">
                    <span className="text-sm font-bold text-[#331B08]">Tổng cộng tạm tính:</span>
                    <strong className="text-lg text-orange-600 font-bold">
                      {formatVnd(cartTotalVal)}
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
                    className="primary-button text-xs py-3 w-full justify-center mt-2 font-bold bg-orange-500 text-white border-orange-600 hover:bg-orange-600 rounded-xl cursor-pointer"
                    type="button"
                    disabled={cartItems.length === 0}
                    onClick={handleSubmitCartProposal}
                  >
                    Xác nhận lần đầu
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
                  <div className="flex flex-col gap-2 w-full mt-1">
                    <button
                      className="primary-button text-xs py-3 justify-center w-full font-bold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-2xl shadow-lg cursor-pointer"
                      type="button"
                      onClick={() => {
                        setRecipientName(currentUser?.name || "");
                        setRecipientPhone("");
                        setRecipientAddress(workingOrder.recipientAddress || "");
                        setShowCheckoutModal(true);
                      }}
                    >
                      💳 Thanh toán ngay
                    </button>
                    
                    <button
                      className="tab-button text-xs py-2 px-3 border border-orange-200 hover:bg-orange-50 text-orange-800 rounded-xl justify-center font-bold cursor-pointer"
                      type="button"
                      onClick={handleBuyMore}
                    >
                      🛍️ Mua thêm sản phẩm
                    </button>
                  </div>
                )}

                {/* Yêu cầu VietQR */}
                {isLoggedIn && workingOrder.paymentRequests.length > 0 && (
                  <div className="p-4 border-2 border-orange-200 bg-white rounded-2xl flex flex-col items-center gap-3 mt-1 shadow-inner">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#78350F] border-b border-dashed border-orange-100 pb-2 w-full justify-center">
                      <QrCode size={16} /> Quét VietQR chuyển khoản nhanh
                    </div>
                    
                    {(() => {
                      const activeReq = workingOrder.paymentRequests[workingOrder.paymentRequests.length - 1];
                      return (
                        <>
                          {/* VietQR Mockup Frame */}
                          <div className="w-48 p-3 bg-gradient-to-b from-blue-50 to-orange-50 border-2 border-orange-100 rounded-2xl flex flex-col items-center text-center relative overflow-hidden shadow-sm">
                            <span className="text-[10px] text-blue-900 font-bold tracking-wider mb-2 bg-blue-100/50 px-2 py-0.5 rounded-full">VIETQR · NAPAS247</span>
                            
                            <div className="w-32 h-32 bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center p-2 relative">
                              {/* QR Pattern visual */}
                              <div className="w-full h-full bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:8px_8px] opacity-80 flex items-center justify-center">
                                <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-[8px] text-white font-bold shadow-md">
                                  PET
                                </div>
                              </div>
                              <div className="absolute top-1 left-1 w-4 h-4 border-t-2 border-l-2 border-blue-600"></div>
                              <div className="absolute top-1 right-1 w-4 h-4 border-t-2 border-r-2 border-blue-600"></div>
                              <div className="absolute bottom-1 left-1 w-4 h-4 border-b-2 border-l-2 border-blue-600"></div>
                              <div className="absolute bottom-1 right-1 w-4 h-4 border-b-2 border-r-2 border-blue-600"></div>
                            </div>

                            <strong className="text-sm text-orange-600 block mt-3 font-extrabold">{formatVnd(activeReq.amount)}</strong>
                            <span className="text-[8px] text-gray-500 font-mono mt-1">Techcombank · 190356782390</span>
                          </div>
                          
                          {/* Payment information details */}
                          <div className="flex flex-col gap-2 w-full text-xs text-[#331B08] bg-orange-50/50 p-3 rounded-2xl border border-orange-100">
                            <div className="flex justify-between">
                              <span className="muted font-semibold">Ngân hàng:</span>
                              <strong>Techcombank (TCB)</strong>
                            </div>
                            <div className="flex justify-between">
                              <span className="muted font-semibold">Chủ tài khoản:</span>
                              <strong>PET TRAVEL WHOLESALE</strong>
                            </div>
                            <div className="flex justify-between">
                              <span className="muted font-semibold">Số tài khoản:</span>
                              <strong>1903 5678 2390</strong>
                            </div>
                            <div className="flex justify-between items-center border-t border-dashed border-orange-200 pt-2 mt-1">
                              <span className="muted font-bold text-[10px] uppercase">Nội dung chuyển khoản:</span>
                              <strong className="font-mono text-xs text-orange-950 bg-white border border-orange-200 px-2 py-0.5 rounded-lg select-all shadow-sm">{activeReq.reference}</strong>
                            </div>
                          </div>

                          {workingOrder.paymentStatus.includes("requested") && (
                            <button
                              type="button"
                              className="tab-button text-xs py-2 w-full justify-center bg-orange-500 text-white border-orange-600 hover:bg-orange-600 cursor-pointer font-bold rounded-xl mt-1"
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

              {/* Địa chỉ giao nhận */}
              {workingOrder.recipientName && (
                <div className="panel flex flex-col gap-3">
                  <div className="section-title">
                    <h3 className="text-sm font-bold flex items-center gap-1"><MapPin size={15} /> Địa chỉ giao nhận</h3>
                  </div>
                  <div className="flex flex-col gap-2 text-xs text-[#331B08]">
                    <div className="flex justify-between">
                      <span className="muted font-semibold">Người nhận:</span>
                      <strong>{workingOrder.recipientName}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="muted font-semibold">Số điện thoại:</span>
                      <strong>{workingOrder.recipientPhone}</strong>
                    </div>
                    <div className="border-t border-dashed border-orange-100 pt-2 mt-1">
                      <span className="muted text-[10px] font-bold uppercase block mb-1">Địa chỉ nhận hàng:</span>
                      <p className="m-0 bg-orange-50/50 p-2 rounded-xl border border-orange-100 leading-relaxed font-semibold">{workingOrder.recipientAddress}</p>
                    </div>
                  </div>
                </div>
              )}

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

        {/* --- CUSTOMER PROFILE & ORDER HISTORY TAB --- */}
        {activeTab === "profile" && isLoggedIn && !isAdmin && (
          <div className="flex flex-col gap-6 animate-fade-in w-full">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Account Settings Panel */}
              <div className="panel flex flex-col gap-4 bg-white border border-orange-100 rounded-3xl p-6">
                <h3 className="text-lg font-bold text-[#331B08] flex items-center gap-2">
                  <UserRound className="text-orange-500" size={20} />
                  Thông tin cá nhân & Bảo mật
                </h3>
                <p className="muted text-xs">Cập nhật họ tên đối tác, ảnh đại diện và thay đổi mật khẩu đăng nhập cổng sỉ.</p>

                <form onSubmit={handleUpdateProfile} className="flex flex-col gap-4 mt-2">
                  <div className="flex items-center gap-4 py-2 border-b border-orange-100/50">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-orange-50 border-2 border-orange-200 flex items-center justify-center text-xl font-bold text-orange-600 shrink-0">
                      {profileAvatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={profileAvatarUrl} alt="Avatar" width={64} height={64} className="object-cover w-full h-full" />
                      ) : (
                        currentUser?.name?.charAt(0) || "U"
                      )}
                    </div>
                    <div className="flex flex-col gap-1 w-full">
                      <label className="text-[10px] font-bold text-orange-950/70 uppercase">Đường dẫn ảnh đại diện</label>
                      <input
                        type="url"
                        className="text-input text-xs py-1.5 px-3 w-full"
                        placeholder="https://..."
                        value={profileAvatarUrl}
                        onChange={(e) => setProfileAvatarUrl(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-orange-950/80 uppercase">Họ và Tên</label>
                    <input
                      type="text"
                      className="text-input text-sm py-2 px-3"
                      value={profileFullName}
                      onChange={(e) => setProfileFullName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
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
                    className="primary-button text-xs py-3 w-full justify-center font-bold cursor-pointer"
                  >
                    Cập nhật tài khoản
                  </button>
                </form>
              </div>

              {/* Order History and tracking */}
              <div className="panel lg:col-span-2 flex flex-col gap-4 bg-white border border-orange-100 rounded-3xl p-6">
                <h3 className="text-lg font-bold text-[#331B08] flex items-center gap-2">
                  <ReceiptText className="text-orange-500" size={20} />
                  Lịch sử Đơn sỉ & Vận chuyển
                </h3>
                <p className="muted text-xs">Theo dõi tiến độ duyệt giá, tình trạng cọc VietQR, hóa đơn VAT đỏ và mã vận đơn thực tế của các đơn hàng sỉ.</p>

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
                            Chưa có đơn sỉ nào được tạo. Quay lại Cửa hàng để bắt đầu lên đơn!
                          </td>
                        </tr>
                      ) : (
                        allOrders.map((ord) => {
                          const q = latestQuote(ord);
                          return (
                            <tr key={ord.id} className="text-xs hover:bg-orange-50/20">
                              <td className="py-3 font-extrabold text-[#331B08]">{ord.number}</td>
                              <td className="text-gray-500 font-medium">
                                {new Date(ord.updatedAt).toLocaleDateString("vi-VN")}
                              </td>
                              <td>
                                <span className={`status-pill text-[9px] ${
                                  ord.commercialStatus === "locked" ? "success" :
                                  ord.commercialStatus === "quoted" ? "info" : "warning"
                                }`}>
                                  {ord.commercialStatus === "submitted" ? "Chờ duyệt" :
                                   ord.commercialStatus === "quoted" ? "Đã báo giá" :
                                   ord.commercialStatus === "customer_accepted" ? "Chờ cọc" :
                                   ord.commercialStatus === "locked" ? "Đang giao" : "Hoàn tất"}
                                </span>
                              </td>
                              <td>
                                <span className={`status-pill text-[9px] ${
                                  ord.paymentStatus === "paid" ? "success" : "warning"
                                }`}>
                                  {ord.paymentStatus === "paid" ? "Đã thanh toán" :
                                   ord.paymentStatus === "deposit_confirmed" ? "Đã cọc 30%" :
                                   ord.paymentStatus.includes("uploaded") ? "Chờ xác nhận" : "Chưa cọc"}
                                </span>
                              </td>
                              <td className="text-right font-extrabold text-orange-950">
                                {formatVnd(q.finalTotal)}
                              </td>
                              <td className="text-center">
                                <button
                                  type="button"
                                  className="text-[10px] font-bold py-1 px-3 bg-orange-100 hover:bg-orange-200 text-orange-850 rounded-lg cursor-pointer transition border border-orange-200"
                                  onClick={() => {
                                    setSelectedOrderId(ord.id);
                                    setWorkingOrder(ord);
                                    setCartItems(ord.items.map(item => ({ ...item })));
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

                {/* Shipping tracking information */}
                {allOrders.some(o => o.shipment) && (
                  <div className="mt-4 p-4 bg-orange-50/50 border border-orange-100 rounded-2xl flex flex-col gap-3">
                    <h4 className="text-xs font-bold text-orange-950 flex items-center gap-1.5">
                      <Truck size={14} /> Tracking Vận Đơn Mới Nhất
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      {allOrders
                        .filter(o => o.shipment)
                        .slice(0, 2)
                        .map(o => (
                          <div key={o.id} className="p-3 bg-white border border-orange-100 rounded-xl flex flex-col gap-1.5">
                            <div className="flex justify-between font-bold">
                              <span>Đơn sỉ: {o.number}</span>
                              <span className="text-orange-600">{o.shipment?.carrier}</span>
                            </div>
                            <div className="flex justify-between text-gray-500 text-[11px] font-medium">
                              <span>Mã vận đơn:</span>
                              <span className="font-mono font-bold text-orange-900">{o.shipment?.trackingCode}</span>
                            </div>
                            <div className="flex justify-between text-gray-500 text-[11px] font-medium">
                              <span>Ngày giao hàng dự kiến:</span>
                              <span className="font-bold text-[#331B08]">{o.shipment?.eta}</span>
                            </div>
                            {o.shipment?.note && (
                              <p className="m-0 text-[10px] italic text-gray-600 mt-1 border-t border-dashed border-gray-150 pt-1">
                                Ghi chú: {o.shipment.note}
                              </p>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- D. ADMIN OPERATIONS TAB (ADMIN ONLY) --- */}
        {activeTab === "admin" && isAdmin && (
          workingOrder.id === "" ? (
            <div className="panel flex flex-col gap-6 w-full">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-bold text-[#331B08] flex items-center gap-2">📋 Danh sách Đơn hàng sỉ</h2>
                <p className="muted text-xs">Chọn một đơn hàng từ danh sách dưới đây để tiến hành thẩm định chi phí, báo giá, phát hành VietQR hoặc đối soát dòng tiền thực tế.</p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {allOrders.map((ord) => {
                  const q = latestQuote(ord);
                  return (
                    <div
                      key={ord.id}
                      className="p-5 border-2 border-orange-100 hover:border-orange-500 rounded-2xl bg-white hover:-translate-y-0.5 transition flex flex-col md:flex-row justify-between items-start md:items-center gap-4 cursor-pointer"
                      onClick={() => selectOrder(ord.id)}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-[#331B08]">{ord.number}</span>
                          <span className={`status-pill text-[10px] ${
                            ord.commercialStatus === "locked" ? "success" :
                            ord.commercialStatus === "quoted" ? "info" : "warning"
                          }`}>
                            {ord.commercialStatus === "submitted" ? "Chờ duyệt giá" :
                             ord.commercialStatus === "quoted" ? "Đã báo giá" :
                             ord.commercialStatus === "customer_accepted" ? "Chờ cọc" :
                             ord.commercialStatus === "locked" ? "Chờ đóng hàng" : "Hoàn tất"}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-[#78350F]">{ord.customerName} · {ord.customerCompany}</span>
                        <span className="muted text-[10px]">{ord.items.length} mặt hàng sỉ · Cập nhật: {new Date(ord.updatedAt).toLocaleTimeString("vi-VN")} {new Date(ord.updatedAt).toLocaleDateString("vi-VN")}</span>
                      </div>
                      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                        <div className="text-right flex flex-col">
                          <span className="text-[10px] muted font-bold">TỔNG ĐƠN SỈ</span>
                          <strong className="text-sm text-orange-950 font-extrabold">{formatVnd(q.finalTotal)}</strong>
                        </div>
                        <button
                          type="button"
                          className="tab-button bg-orange-500 text-white border-orange-600 hover:bg-orange-600 text-xs py-2 px-4 cursor-pointer font-bold rounded-xl"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectOrder(ord.id);
                          }}
                        >
                          Xử lý đơn
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 w-full">
              {/* Back to list and quick switcher */}
              <div className="panel p-4 bg-orange-50/50 border border-orange-100 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="tab-button text-xs py-1.5 px-3 bg-white hover:bg-orange-100 font-bold border-orange-200 rounded-xl"
                    onClick={() => {
                      setSelectedOrderId(null);
                      setWorkingOrder(EMPTY_ORDER);
                    }}
                  >
                    ← Quay lại danh sách
                  </button>
                  <span className="text-sm font-bold text-[#331B08]">Đang xử lý đơn: <span className="text-orange-600">{workingOrder.number}</span> ({workingOrder.customerName})</span>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-xs font-semibold text-orange-950 shrink-0">Chuyển nhanh đơn:</span>
                  <select
                    className="text-input text-xs py-1.5 px-2 bg-white border border-orange-200 rounded-xl flex-grow sm:flex-none sm:w-[200px] font-semibold"
                    value={workingOrder.id}
                    onChange={(e) => selectOrder(e.target.value)}
                  >
                    {allOrders.map((o) => (
                      <option key={o.id} value={o.id}>{o.number} - {o.customerName}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* WARNING BANNER FOR LOCKED ORDER */}
              {(() => {
                const isLockedByOther = workingOrder.assignedStaffId && workingOrder.assignedStaffId !== currentUser?.id && currentUser?.role !== "super_admin";
                if (isLockedByOther) {
                  return (
                    <div className="p-4 bg-red-50 border-2 border-red-200 text-red-950 rounded-2xl flex items-center gap-3 animate-fade-in">
                      <span className="text-2xl">🔒</span>
                      <div>
                        <h4 className="font-extrabold text-sm m-0">Đơn hàng này đã bị khóa thao tác!</h4>
                        <p className="m-0 text-xs mt-1">
                          Đơn hàng này đã được gán cho nhân viên <strong>{workingOrder.assignedStaffName || "khác"}</strong> phụ trách. 
                          Bạn chỉ có quyền xem chi tiết và trao đổi nội bộ, không thể thay đổi số lượng, báo giá hay xác nhận giao dịch.
                        </p>
                      </div>
                    </div>
                  );
                } else if (workingOrder.assignedStaffId) {
                  return (
                    <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-950 rounded-2xl flex items-center gap-2.5 animate-fade-in">
                      <span className="text-lg">👤</span>
                      <p className="m-0 text-xs font-bold">
                        Đơn hàng được gán cho bạn phụ trách xử lý ({workingOrder.assignedStaffName}).
                      </p>
                    </div>
                  );
                }
                return null;
              })()}

              <section className="grid-dashboard">
                <div className="flex flex-col gap-4">
                  {/* Danh sách sản phẩm sỉ trong đơn */}
                  <div className="panel flex flex-col gap-4">
                    <div className="section-title flex justify-between items-center">
                      <h3 className="text-lg font-bold">📦 Sản phẩm sỉ trong đơn hàng</h3>
                      {isOrderModified && (
                        <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">
                          Đã chỉnh sửa (Chưa lưu)
                        </span>
                      )}
                    </div>

                    {/* Bộ lọc sản phẩm sỉ dành cho Admin */}
                    <div className="grid grid-cols-2 gap-3 p-3 bg-orange-50/30 rounded-2xl border border-orange-100">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-orange-950/80 uppercase">Lọc theo phân loại</label>
                        <select
                          className="text-input text-xs py-1.5 px-2 bg-white border border-orange-200 rounded-xl"
                          value={adminCategoryFilter}
                          onChange={(e) => setAdminCategoryFilter(e.target.value)}
                        >
                          <option value="Tất cả">Tất cả phân loại</option>
                          <option value="Túi vận chuyển">Túi vận chuyển</option>
                          <option value="Ăn uống du lịch">Ăn uống du lịch</option>
                          <option value="Vệ sinh">Vệ sinh</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-orange-950/80 uppercase">Lọc theo nhà cung cấp</label>
                        <select
                          className="text-input text-xs py-1.5 px-2 bg-white border border-orange-200 rounded-xl"
                          value={adminSupplierFilter}
                          onChange={(e) => setAdminSupplierFilter(e.target.value)}
                        >
                          <option value="Tất cả">Tất cả nhà cung cấp</option>
                          {suppliers.map((sup) => (
                            <option key={sup.id} value={sup.id}>{sup.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="variant-table w-full">
                        <thead>
                          <tr>
                            <th>Ảnh/Mã</th>
                            <th>Sản phẩm sỉ & Nhà cung cấp</th>
                            <th className="text-center w-28">Số lượng</th>
                            <th className="text-right">Đơn giá sỉ</th>
                            <th className="text-right">Thành tiền</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAdminOrderItems.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="text-center py-6 muted text-xs font-semibold">
                                Không tìm thấy sản phẩm sỉ phù hợp với bộ lọc.
                              </td>
                            </tr>
                          ) : (
                            filteredAdminOrderItems.map((item) => {
                              const parent = allProducts.find((p) => p.code === item.productCode);
                              const image = parent?.imageUrl ?? "/product-food.svg";
                              return (
                                <tr key={item.id} className={item.quantity === 0 ? "opacity-50 bg-gray-50/50" : ""}>
                                  <td className="w-16">
                                    <div className="relative w-10 h-10 rounded-xl overflow-hidden border bg-orange-50 flex items-center justify-center p-1 shrink-0">
                                      <Image src={image} alt={item.productName} fill className="object-cover" />
                                    </div>
                                    <span className="text-[8px] font-mono font-bold text-orange-900 block mt-1 text-center">{item.variantSku}</span>
                                  </td>
                                  <td>
                                    <strong className="text-xs text-[#331B08] block">{item.productName}</strong>
                                    <span className="text-[10px] text-gray-500 font-semibold block">{item.variantLabel}</span>
                                    <span className="text-[9px] bg-blue-50 text-blue-800 px-2 py-0.5 rounded-full font-bold inline-block mt-1">
                                      🏭 {visibleSupplierName(item.supplierId)}
                                    </span>
                                  </td>
                                  <td className="text-center">
                                    <div className="flex items-center justify-center gap-1 border border-orange-200 rounded-xl p-0.5 bg-orange-50/25 max-w-[100px] mx-auto">
                                      <button
                                        type="button"
                                        className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-xs font-bold text-[#78350F] shadow-sm active:scale-90 cursor-pointer disabled:opacity-40"
                                        disabled={isOrderFrozen}
                                        onClick={() => handleAdminQtyChange(item.id, item.quantity - 1)}
                                      >
                                        -
                                      </button>
                                      <input
                                        type="number"
                                        className="w-8 text-center text-xs font-bold bg-transparent border-0 focus:ring-0 p-0"
                                        disabled={isOrderFrozen}
                                        value={item.quantity}
                                        onChange={(e) => handleAdminQtyChange(item.id, parseInt(e.target.value, 10) || 0)}
                                      />
                                      <button
                                        type="button"
                                        className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-xs font-bold text-[#78350F] shadow-sm active:scale-90 cursor-pointer disabled:opacity-40"
                                        disabled={isOrderFrozen}
                                        onClick={() => handleAdminQtyChange(item.id, item.quantity + 1)}
                                      >
                                        +
                                      </button>
                                    </div>
                                  </td>
                                  <td className="text-right text-xs text-[#78350F] font-semibold">
                                    {formatVnd(item.unitPriceSnapshot)}
                                  </td>
                                  <td className="text-right text-xs font-bold text-[#331B08]">
                                    {formatVnd(item.quantity * item.unitPriceSnapshot)}
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

                <aside className="flex flex-col gap-4">
                  {/* Thẩm định Chi phí, Báo giá & Đặt cọc */}
                  <div className="panel flex flex-col gap-4">
                    <div className="section-title">
                      <h3 className="text-lg font-bold">1. Chi phí & Báo giá</h3>
                      <StatusPill tone={isOrderFrozen ? "warning" : "info"}>
                        {isOrderFrozen ? "Đơn đã khóa" : "Thẩm định sỉ"}
                      </StatusPill>
                    </div>

                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-orange-950/80">Chiết khấu sỉ giảm giá (VND)</label>
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
                          <label className="text-xs font-bold text-orange-950/80">Phí vận chuyển (VND)</label>
                          <input
                            type="number"
                            className="text-input text-xs py-2 px-3"
                            disabled={isOrderFrozen || shippingFeeOption === "separate_cod"}
                            value={shippingFeeOption === "separate_cod" ? 0 : adminShippingFee}
                            onChange={(e) => setAdminShippingFee(parseInt(e.target.value, 10) || 0)}
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold text-orange-950/80">Phương thức tính phí</label>
                          <div className="flex flex-col gap-1 mt-1">
                            <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                              <input
                                type="radio"
                                name="ship_opt"
                                disabled={isOrderFrozen}
                                checked={shippingFeeOption === "included"}
                                onChange={() => setShippingFeeOption("included")}
                              />
                              Cộng vào đơn
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
                              Khách trả COD
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 border-t border-dashed border-orange-100 pt-3">
                        <label className="text-xs font-bold text-orange-950/80">Số tiền cọc gửi (VND)</label>
                        <input
                          type="number"
                          className="text-input text-xs py-2 px-3"
                          disabled={isOrderFrozen}
                          placeholder={formatVnd(quote?.depositAmount || 0)}
                          value={customDepositInput}
                          onChange={(e) => setCustomDepositInput(e.target.value)}
                        />
                        <span className="text-[10px] muted">Mặc định: 30% tổng đơn nếu bỏ trống.</span>
                      </div>

                      {requiresManagerApproval && !isManagerApproved && (
                        <div className="p-3 border-2 border-dashed border-red-200 bg-red-50/20 rounded-2xl flex flex-col gap-2 mt-2">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={16} />
                            <div>
                              <strong className="text-xs text-red-950 block">Vượt hạn mức chiết khấu Operator!</strong>
                              <p className="text-[10px] text-red-900 m-0 mt-0.5 leading-relaxed font-bold">
                                Cần Quản lý ký số phê duyệt để tiếp tục áp dụng mức giảm giá này.
                              </p>
                            </div>
                          </div>
                          <button
                            className="tab-button text-xs py-2 w-max text-red-700 border-red-300 hover:bg-red-50 cursor-pointer"
                            type="button"
                            onClick={() => {
                              setIsManagerApproved(true);
                              addComment("internal", "Quản lý (Manager) đã kiểm tra và phê duyệt mức chiết khấu sỉ đặc biệt cho đơn này.");
                            }}
                          >
                            <ShieldCheck size={14} /> Ký phê duyệt
                          </button>
                        </div>
                      )}

                      {isManagerApproved && (
                        <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-xs text-green-800 font-bold">
                          <CheckCircle2 size={16} className="text-green-600" /> Quản lý đã duyệt hạn mức!
                        </div>
                      )}

                      <button
                        className={`primary-button text-xs py-3 justify-center w-full mt-2 font-bold cursor-pointer transition rounded-xl ${
                          isOrderModified
                            ? "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-md"
                            : "bg-orange-500 text-white border-orange-600 hover:bg-orange-600"
                        }`}
                        type="button"
                        disabled={isOrderFrozen || (requiresManagerApproval && !isManagerApproved)}
                        onClick={handlePublishQuote}
                      >
                        📬 Gửi khách xác nhận
                      </button>
                    </div>
                  </div>

                  {/* Kế toán đối soát */}
                  <div className="panel flex flex-col gap-4">
                    <div className="section-title">
                      <h3 className="text-lg font-bold">2. Đối soát dòng tiền</h3>
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
                              <span className="status-pill success text-[9px]">Đã nhận tiền sỉ</span>
                            ) : (
                              <span className="status-pill info text-[9px]">Chờ thanh toán</span>
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
                              className="tab-button py-2 w-full justify-center bg-green-500 text-white border-green-600 hover:bg-green-600 font-bold cursor-pointer"
                              onClick={confirmDeposit}
                            >
                              Xác nhận Nhận đủ tiền
                            </button>
                          ) : (
                            <div className="p-2.5 bg-green-50 border border-green-200 rounded-xl text-green-800 font-bold text-center">
                              ✓ Giao dịch đã xác nhận thành công
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bàn giao vận chuyển */}
                  <div className="panel flex flex-col gap-4">
                    <div className="section-title">
                      <h3 className="text-lg font-bold">3. Kho hàng & Vận chuyển</h3>
                    </div>

                    <div className="flex flex-col gap-3">
                      <button
                        type="button"
                        className="tab-button text-xs py-3 justify-center w-full bg-blue-600 text-white border-blue-700 hover:bg-blue-700 cursor-pointer font-bold rounded-xl"
                        disabled={workingOrder.fulfillmentStatus === "shipped" || (!workingOrder.paymentStatus.includes("confirmed") && workingOrder.paymentStatus !== "paid")}
                        onClick={attachShipment}
                      >
                        <Truck size={15} /> Bàn giao GHN (Mã vận đơn)
                      </button>
                    </div>
                  </div>
                </aside>
              </section>
            </div>
          )
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
                  const nextProductCode = `PRO-${Date.now().toString().slice(-4)}`;
                  setFormCode(nextProductCode);
                  setFormName("");
                  setFormCategory(allCategories[0] || "");
                  setFormProductSupplier(suppliers[0]?.id || "");
                  setFormImage("/product-food.svg");
                  setFormImages(["/product-food.svg"]);
                  setFormDimensions("");
                  setFormWeight(0);
                  setFormDescription("");
                  setFormTags("");
                  setFormVariants(syncVariantSkus(nextProductCode, [
                    { id: `v_${Date.now()}_1`, sku: "", label: "Túi 1.5kg", wholesalePrice: 150000, minOrderQty: 10, stock: 100, supplierId: suppliers[0]?.id || "sup_pettravel" },
                    { id: `v_${Date.now()}_2`, sku: "", label: "Túi 5kg", wholesalePrice: 420000, minOrderQty: 5, stock: 50, supplierId: suppliers[0]?.id || "sup_pettravel" }
                  ]));
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
                              setFormProductSupplier(p.variants[0]?.supplierId || "");
                              setFormImage(p.imageUrl);
                              setFormImages(p.images ?? [p.imageUrl]);
                              setFormDimensions(p.dimensions ?? "");
                              setFormWeight(p.weight ?? 0);
                              setFormDescription(p.description ?? "");
                              setFormTags(p.tags.join(", "));
                              setFormVariants(syncVariantSkus(p.code, p.variants.map(v => ({ ...v }))));
                            }}
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            className="tab-button text-xs py-1 px-3 text-red-600 border-red-200 bg-red-50/30 hover:bg-red-50"
                            onClick={async () => {
                              if (confirm(`Bạn có chắc chắn muốn xóa sản phẩm ${p.name}?`)) {
                                const res = await fetch(`/api/products?id=${p.id}`, { method: "DELETE" });
                                if (res.ok) {
                                  await fetchProducts();
                                } else {
                                  alert("Lỗi khi xóa sản phẩm.");
                                }
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

        {/* --- D2-C. CATEGORY MANAGEMENT TAB (ADMIN ONLY) --- */}
        {activeTab === "admin_categories" && isAdmin && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-xl font-bold text-[#331B08]">🏷️ Quản lý Danh mục Sản phẩm sỉ</h2>
              <p className="muted text-xs">Quản lý danh sách các danh mục hàng sỉ (Thức ăn, Túi vận chuyển, Đồ chơi...).</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              {/* Form thêm mới */}
              <div className="panel p-4 flex flex-col gap-4">
                <h3 className="text-sm font-bold text-orange-950 border-b pb-2">Thêm danh mục mới</h3>
                <form onSubmit={handleAddCategory} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-orange-900">Tên danh mục:</label>
                    <input
                      type="text"
                      className="text-input text-xs py-2 px-3"
                      placeholder="Nhập tên danh mục..."
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="primary-button text-xs py-2 w-full">
                    + Thêm danh mục
                  </button>
                </form>
              </div>

              {/* Danh sách danh mục */}
              <div className="panel p-4 md:col-span-2 flex flex-col gap-4">
                <h3 className="text-sm font-bold text-orange-950 border-b pb-2">Danh sách danh mục hiện có</h3>
                <div className="flex flex-col gap-2">
                  {allCategories.map((cat) => (
                    <div key={cat} className="flex items-center justify-between p-3 border border-orange-100 bg-[#FFFDF9] rounded-xl">
                      {editingCategoryOld === cat ? (
                        <div className="flex items-center gap-2 w-full mr-4">
                          <input
                            type="text"
                            className="text-input text-xs py-1 px-2 flex-grow"
                            value={editingCategoryNew}
                            onChange={(e) => setEditingCategoryNew(e.target.value)}
                          />
                          <button
                            type="button"
                            className="tab-button bg-green-500 text-white border-green-600 px-3 py-1 text-xs cursor-pointer"
                            onClick={() => handleEditCategory(cat, editingCategoryNew)}
                          >
                            Lưu
                          </button>
                          <button
                            type="button"
                            className="tab-button bg-gray-200 text-gray-800 px-3 py-1 text-xs cursor-pointer"
                            onClick={() => setEditingCategoryOld(null)}
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="font-bold text-sm text-orange-950">{cat}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="tab-button px-2.5 py-1 text-xs cursor-pointer border-orange-200 text-orange-800"
                              onClick={() => {
                                setEditingCategoryOld(cat);
                                setEditingCategoryNew(cat);
                              }}
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              className="tab-button px-2.5 py-1 text-xs cursor-pointer bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                              onClick={() => handleDeleteCategory(cat)}
                            >
                              Xóa
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  {allCategories.length === 0 && (
                    <p className="muted text-xs text-center py-4">Chưa có danh mục nào.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- D2-S. SUPPLIER MANAGEMENT TAB (ADMIN ONLY) --- */}
        {activeTab === "admin_suppliers" && isAdmin && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-[#331B08]">🏢 Quản lý Đối tác Nhà cung cấp sỉ</h2>
                <p className="muted text-xs">Quản lý các nhà cung cấp sỉ, thời gian chuẩn bị hàng (lead time) và cài đặt hiển thị.</p>
              </div>
              <button
                type="button"
                className="primary-button text-xs py-2"
                onClick={() => {
                  setEditingSupplier(null);
                  setSupCode("");
                  setSupName("");
                  setSupLeadTime(3);
                  setSupAdminOnly(true);
                  setShowSupplierForm(true);
                }}
              >
                + Thêm nhà cung cấp
              </button>
            </div>

            {/* Form modal/panel */}
            {showSupplierForm && (
              <div className="panel p-4 flex flex-col gap-4 bg-[#FFFDF9] border-2 border-orange-200">
                <h3 className="text-sm font-bold text-orange-950 border-b pb-2">
                  {editingSupplier ? `Cập nhật nhà cung cấp: ${editingSupplier.name}` : "Thêm nhà cung cấp sỉ mới"}
                </h3>
                <form onSubmit={handleSaveSupplier} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-orange-900">Mã nhà cung cấp (Code):</label>
                    <input
                      type="text"
                      className="text-input text-xs py-2 px-3"
                      placeholder="Ví dụ: PT, PC, ML..."
                      value={supCode}
                      onChange={(e) => setSupCode(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="text-xs font-bold text-orange-900">Tên nhà cung cấp:</label>
                    <input
                      type="text"
                      className="text-input text-xs py-2 px-3"
                      placeholder="Nhập tên nhà cung cấp..."
                      value={supName}
                      onChange={(e) => setSupName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-orange-900">Chuẩn bị hàng (Lead time ngày):</label>
                    <input
                      type="number"
                      className="text-input text-xs py-2 px-3"
                      value={supLeadTime}
                      onChange={(e) => setSupLeadTime(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex items-center gap-2 pb-3">
                    <input
                      type="checkbox"
                      id="supAdminOnly"
                      checked={supAdminOnly}
                      onChange={(e) => setSupAdminOnly(e.target.checked)}
                    />
                    <label htmlFor="supAdminOnly" className="text-xs font-bold text-orange-900 cursor-pointer">
                      Chỉ hiển thị với Admin
                    </label>
                  </div>
                  <div className="md:col-span-4 flex justify-end gap-2 mt-2 border-t pt-3">
                    <button
                      type="button"
                      className="tab-button text-xs py-1.5 px-3 cursor-pointer"
                      onClick={() => setShowSupplierForm(false)}
                    >
                      Hủy bỏ
                    </button>
                    <button type="submit" className="primary-button text-xs py-1.5 px-4">
                      Lưu thay đổi
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="panel p-4 overflow-x-auto">
              <table className="variant-table w-full">
                <thead>
                  <tr>
                    <th>Mã NCC</th>
                    <th>Tên nhà cung cấp sỉ</th>
                    <th>Lead-time chuẩn bị</th>
                    <th>Hiển thị sỉ</th>
                    <th className="text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s) => (
                    <tr key={s.id}>
                      <td className="font-mono font-bold text-orange-900 text-xs">{s.code}</td>
                      <td>
                        <strong className="text-orange-950 text-sm">{s.name}</strong>
                      </td>
                      <td className="text-xs font-bold">{s.leadTimeDays} ngày</td>
                      <td>
                        <span className={`tag text-[10px] px-2 py-0.5 rounded-full font-bold ${s.adminOnly ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
                          {s.adminOnly ? "Chỉ Admin thấy" : "Công khai với Khách"}
                        </span>
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            className="tab-button px-2.5 py-1 text-xs cursor-pointer border-orange-200 text-orange-800"
                            onClick={() => {
                              setEditingSupplier(s);
                              setSupCode(s.code);
                              setSupName(s.name);
                              setSupLeadTime(s.leadTimeDays);
                              setSupAdminOnly(s.adminOnly);
                              setShowSupplierForm(true);
                            }}
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            className="tab-button px-2.5 py-1 text-xs cursor-pointer bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                            onClick={() => handleDeleteSupplier(s.id, s.name)}
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {suppliers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted text-xs text-center py-6">Chưa có nhà cung cấp nào.</td>
                    </tr>
                  )}
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

        {/* --- F. ADMIN USER MANAGEMENT TAB --- */}
        {activeTab === "admin_users" && isAdmin && (
          <div className="flex flex-col gap-6 animate-fade-in w-full">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* User Creation Form */}
              <div className="panel flex flex-col gap-4 bg-white border border-orange-100 rounded-3xl p-6">
                <h3 className="text-lg font-bold text-[#331B08] flex items-center gap-2">
                  <UserRound className="text-orange-500" size={20} />
                  Tạo tài khoản mới
                </h3>
                <p className="muted text-xs">Cấp quyền truy cập mới cho nhân viên vận hành (Admin/Operator) hoặc đối tác đại lý sỉ (Customer).</p>

                <form onSubmit={handleCreateUser} className="flex flex-col gap-4 mt-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-orange-950/80 uppercase">Họ và Tên</label>
                    <input
                      type="text"
                      className="text-input text-sm py-2 px-3"
                      value={createFullName}
                      onChange={(e) => setCreateFullName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-orange-950/80 uppercase">Email đăng nhập</label>
                    <input
                      type="email"
                      className="text-input text-sm py-2 px-3"
                      value={createEmail}
                      onChange={(e) => setCreateEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-orange-950/80 uppercase">Số điện thoại</label>
                    <input
                      type="tel"
                      className="text-input text-sm py-2 px-3"
                      value={createPhone}
                      onChange={(e) => setCreatePhone(e.target.value)}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-orange-950/80 uppercase">Mật khẩu ban đầu</label>
                    <input
                      type="password"
                      className="text-input text-sm py-2 px-3"
                      placeholder="Tối thiểu 12 ký tự"
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      required
                      minLength={12}
                      autoComplete="new-password"
                    />
                    <span className="text-[10px] muted">Mật khẩu cần tối thiểu 12 ký tự để đảm bảo an toàn.</span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-orange-950/80 uppercase">Vai trò & Quyền</label>
                    <select
                      className="text-input text-sm py-2 px-3 bg-white border"
                      value={createRole}
                      onChange={(e) => setCreateRole(e.target.value)}
                    >
                      <option value="customer_owner">Đại lý sỉ (Customer Owner)</option>
                      <option value="super_admin">Quản trị cấp cao (Super Admin)</option>
                      <option value="finance_admin">Tài chính (Finance Admin)</option>
                      <option value="operator">Nhân viên vận hành (Operator)</option>
                    </select>
                  </div>

                  {createRole === "customer_owner" && (
                    <div className="flex flex-col gap-1.5 animate-slide-down">
                      <label className="text-[10px] font-bold text-orange-950/80 uppercase">Tên Công ty/Cửa hàng</label>
                      <input
                        type="text"
                        className="text-input text-sm py-2 px-3"
                        placeholder="Ví dụ: Happy Paws Shop"
                        value={createCompany}
                        onChange={(e) => setCreateCompany(e.target.value)}
                        required={createRole === "customer_owner"}
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    className="primary-button text-xs py-3 w-full justify-center font-bold cursor-pointer"
                  >
                    Tạo tài khoản
                  </button>
                </form>
              </div>

              {/* User List Panel */}
              <div className="panel lg:col-span-2 flex flex-col gap-4 bg-white border border-orange-100 rounded-3xl p-6">
                <h3 className="text-lg font-bold text-[#331B08] flex items-center gap-2">
                  <Users className="text-orange-500" size={20} />
                  Thành viên hệ thống ({userList.length})
                </h3>
                <p className="muted text-xs">Danh sách toàn bộ tài khoản đại lý sỉ, nhân viên kế toán, tài chính và điều phối viên đang hoạt động.</p>

                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b-2 border-orange-100 text-[10px] font-extrabold uppercase text-[#78350F] tracking-wider">
                        <th className="py-2.5">Thành viên</th>
                        <th>Số điện thoại</th>
                        <th>Tổ chức sỉ / Vai trò</th>
                        <th>Phân loại</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-orange-50/50">
                      {userList.map((u) => (
                        <tr key={u.id} className="text-xs hover:bg-orange-50/20">
                          <td className="py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full overflow-hidden bg-orange-50 flex items-center justify-center font-bold text-orange-750 text-xs shrink-0 border border-orange-200">
                                {u.avatarUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  u.fullName?.charAt(0) || "U"
                                )}
                              </div>
                              <div className="flex flex-col">
                                <strong className="text-[#331B08]">{u.fullName}</strong>
                                <span className="text-[10px] text-gray-400">{u.email}</span>
                              </div>
                            </div>
                          </td>
                          <td className="font-semibold text-gray-655">{u.phone || "—"}</td>
                          <td>
                            <div className="flex flex-col">
                              <strong className="text-[#78350F]">{u.company || "Pet Travel Nội bộ"}</strong>
                              <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{u.role}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`status-pill text-[9px] ${
                              u.role.includes("admin") ? "success" : "info"
                            }`}>
                              {u.role.includes("admin") ? "Nội bộ Admin" : "Đại lý ngoài"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- G. ADMIN PROMOTIONS & SYSTEM DEFAULTS TAB --- */}
        {activeTab === "admin_promotions" && isAdmin && (
          <div className="flex flex-col gap-6 animate-fade-in w-full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Settings Form */}
              <div className="panel flex flex-col gap-4 bg-white border border-orange-100 rounded-3xl p-6">
                <h3 className="text-lg font-bold text-[#331B08] flex items-center gap-2">
                  <Percent className="text-orange-500" size={20} />
                  Khuyến mãi & Chỉ số mặc định
                </h3>
                <p className="muted text-xs">Cấu hình các chỉ số ưu đãi mặc định cho đại lý khi tạo đơn sỉ tự động và ngưỡng freeship hệ thống.</p>

                <form onSubmit={handleSavePromotions} className="flex flex-col gap-4 mt-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-orange-950/80 uppercase">Ngưỡng miễn phí vận chuyển sỉ (Freeship Threshold - VND)</label>
                    <input
                      type="number"
                      className="text-input text-sm py-2 px-3"
                      value={promotionsPolicy.freeShippingThreshold}
                      onChange={(e) => setPromotionsPolicy({
                        ...promotionsPolicy,
                        freeShippingThreshold: Math.max(0, parseInt(e.target.value, 10) || 0)
                      })}
                      required
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">Các đơn sỉ có tổng trị giá hàng từ ngưỡng này trở lên sẽ tự động freeship.</p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-[#78350F] uppercase">Tỷ lệ đặt cọc mặc định (Ví dụ: 0.3 = 30%)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      className="text-input text-sm py-2 px-3 font-semibold"
                      value={promotionsPolicy.defaultDepositRate}
                      onChange={(e) => setPromotionsPolicy({
                        ...promotionsPolicy,
                        defaultDepositRate: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0))
                      })}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-[#78350F] uppercase">Chiết khấu tối đa của nhân viên (Ví dụ: 0.08 = 8%)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      className="text-input text-sm py-2 px-3 font-semibold"
                      value={promotionsPolicy.maxOperatorDiscountRate}
                      onChange={(e) => setPromotionsPolicy({
                        ...promotionsPolicy,
                        maxOperatorDiscountRate: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0))
                      })}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-[#78350F] uppercase">Hạn mức chiết khấu cần Quản lý duyệt (VND)</label>
                    <input
                      type="number"
                      className="text-input text-sm py-2 px-3"
                      value={promotionsPolicy.requireManagerApprovalAbove}
                      onChange={(e) => setPromotionsPolicy({
                        ...promotionsPolicy,
                        requireManagerApprovalAbove: Math.max(0, parseInt(e.target.value, 10) || 0)
                      })}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-orange-950/80 uppercase">Ngưỡng tặng quà sỉ mặc định (VND)</label>
                    <input
                      type="number"
                      className="text-input text-sm py-2 px-3"
                      value={promotionsPolicy.giftThreshold || 0}
                      onChange={(e) => setPromotionsPolicy({
                        ...promotionsPolicy,
                        giftThreshold: Math.max(0, parseInt(e.target.value, 10) || 0)
                      })}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-orange-950/80 uppercase">Tên Quà Tặng kèm theo</label>
                    <input
                      type="text"
                      className="text-input text-sm py-2 px-3"
                      placeholder="Không quà tặng"
                      value={promotionsPolicy.giftName || ""}
                      onChange={(e) => setPromotionsPolicy({
                        ...promotionsPolicy,
                        giftName: e.target.value
                      })}
                    />
                  </div>

                  <button
                    type="submit"
                    className="primary-button text-xs py-3 w-full justify-center font-bold cursor-pointer"
                  >
                    Lưu thiết lập ưu đãi
                  </button>
                </form>
              </div>

              {/* Status and Active Rules overview */}
              <div className="flex flex-col gap-4">
                <div className="panel bg-[#FFFDF9] border border-orange-100 rounded-3xl p-6">
                  <h4 className="text-xs font-bold text-orange-950 uppercase flex items-center gap-1.5">
                    💡 Hướng dẫn Quy tắc Khuyến mại
                  </h4>
                  <ul className="text-xs text-[#331B08]/85 pl-4 flex flex-col gap-3 mt-3 list-disc">
                    <li>
                      Miễn phí vận chuyển cho các đơn sỉ từ <strong>{formatVnd(promotionsPolicy.freeShippingThreshold)}</strong> trở lên.
                    </li>
                    <li>
                      Đại lý thanh toán trước <strong>{promotionsPolicy.defaultDepositRate * 100}%</strong> giá trị đơn sỉ làm tiền cọc đóng gói, <strong>{(1 - promotionsPolicy.defaultDepositRate) * 100}%</strong> COD còn lại khi nhận hàng.
                    </li>
                    <li>
                      Nếu đơn sỉ có trị giá từ <strong>{formatVnd(promotionsPolicy.giftThreshold || 0)}</strong>, hệ thống tự động tặng kèm quà: <strong>{promotionsPolicy.giftName || "Chưa thiết lập"}</strong>.
                    </li>
                    <li>
                      Nhân viên vận hành được tự động chiết khấu tối đa <strong>{promotionsPolicy.maxOperatorDiscountRate * 100}%</strong> hoặc giảm trực tiếp đến <strong>{formatVnd(promotionsPolicy.requireManagerApprovalAbove)}</strong> cho đại lý mà không cần Quản lý duyệt.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
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
                      if (!isLoggedIn) {
                        return (
                          <div className="mt-3 p-4 bg-orange-50 border border-orange-100 rounded-xl text-[#331B08]/80 text-xs text-center font-medium">
                            🔒 Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng sỉ.
                          </div>
                        );
                      }
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
            className="panel max-w-2xl w-full flex flex-col gap-4 p-6 relative overflow-hidden bg-[#FFFDF9] animate-scale-in max-h-[95vh] overflow-y-auto"
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
            
            <div className="flex flex-col gap-4">
              {/* Row 1: Tên, Mã */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-orange-950/80">Tên sản phẩm sỉ:</label>
                  <input type="text" className="text-input text-xs py-2 px-3" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Nhập tên sản phẩm..." />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-orange-950/80">Mã sản phẩm (Code):</label>
                  <input type="text" className="text-input text-xs py-2 px-3" value={formCode} onChange={(e) => updateFormCode(e.target.value)} placeholder="Ví dụ: PRO-102" />
                </div>
              </div>

              {/* Row 2: Danh mục, Nhà cung cấp */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-orange-950/80">Danh mục:</label>
                  <select className="text-input text-xs py-2 px-3 bg-white" value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
                    <option value="">-- Chọn danh mục --</option>
                    {allCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-orange-950/80">Nhà cung cấp sỉ chính:</label>
                  <select className="text-input text-xs py-2 px-3 bg-white" value={formProductSupplier} onChange={(e) => setFormProductSupplier(e.target.value)}>
                    <option value="">-- Chọn nhà cung cấp --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Kích thước, Khối lượng */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-orange-950/80">Kích thước (Dài x Rộng x Cao cm):</label>
                  <input type="text" className="text-input text-xs py-2 px-3" value={formDimensions} onChange={(e) => setFormDimensions(e.target.value)} placeholder="Ví dụ: 30x20x15 cm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-orange-950/80">Khối lượng (kg):</label>
                  <input type="number" step="0.1" className="text-input text-xs py-2 px-3" value={formWeight || ""} onChange={(e) => setFormWeight(Number(e.target.value))} placeholder="Ví dụ: 1.5" />
                </div>
              </div>

              {/* TikTok-style Image Gallery Manager */}
              <div className="flex flex-col gap-1.5 p-3 border border-orange-100 rounded-2xl bg-orange-50/5">
                <label className="text-xs font-bold text-orange-950/80">Ảnh sản phẩm (Chọn 1 ảnh làm ảnh chính):</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="text-input text-xs py-2 px-3 flex-grow"
                    placeholder="Nhập đường dẫn ảnh sản phẩm (URL)..."
                    value={newImageUrlInput}
                    onChange={(e) => setNewImageUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddImage();
                      }
                    }}
                  />
                  <button type="button" className="tab-button text-xs py-2 px-4 cursor-pointer" onClick={handleAddImage}>
                    + Thêm ảnh
                  </button>
                </div>

                {/* Gallery Previews */}
                <div className="flex flex-wrap gap-2.5 mt-2.5">
                  {formImages.map((imgUrl, idx) => {
                    const isMain = imgUrl === formImage;
                    return (
                      <div
                        key={idx}
                        className={`relative w-20 h-20 rounded-xl overflow-hidden border-2 cursor-pointer bg-[#FFFBEB] flex items-center justify-center group ${isMain ? 'border-orange-500 ring-2 ring-orange-200' : 'border-orange-100 hover:border-orange-300'}`}
                        onClick={() => setFormImage(imgUrl)}
                        title="Click để chọn làm ảnh chính"
                      >
                        <Image src={imgUrl} alt={`Thumb ${idx}`} fill className="object-cover" />
                        
                        {/* Main Image Indicator */}
                        {isMain && (
                          <div className="absolute top-1 left-1 bg-orange-500 text-white text-[8px] font-extrabold px-1 py-0.5 rounded shadow-sm z-10">
                            Ảnh chính
                          </div>
                        )}

                        {/* Remove Image Button */}
                        <button
                          type="button"
                          className="absolute top-1 right-1 w-4.5 h-4.5 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold opacity-0 group-hover:opacity-100 transition shadow-sm z-20 hover:bg-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            const updated = formImages.filter(img => img !== imgUrl);
                            setFormImages(updated);
                            if (isMain) {
                              setFormImage(updated[0] || "");
                            }
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  {formImages.length === 0 && (
                    <div className="w-20 h-20 border-2 border-dashed border-orange-200 rounded-xl flex items-center justify-center text-[10px] text-orange-900/60 font-bold bg-orange-50/10">
                      Chưa có ảnh
                    </div>
                  )}
                </div>
              </div>

              {/* Phân loại (Variants) */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-orange-950">Quản lý phân loại sản phẩm (Variants):</h4>
                  <button
                    type="button"
                    className="tab-button text-[10px] py-1 px-2 border-orange-200 bg-orange-50/50 cursor-pointer"
                    onClick={() => {
                      setFormVariants(prev => [
                        ...prev,
                        {
                          id: `v_${Date.now()}`,
                          sku: buildVariantSku(formCode, "Phân loại mới", prev.length),
                          label: "Phân loại mới",
                          wholesalePrice: 100000,
                          minOrderQty: 10,
                          stock: 100,
                          supplierId: formProductSupplier || suppliers[0]?.id || "sup_pettravel"
                        }
                      ]);
                    }}
                  >
                    + Thêm phân loại
                  </button>
                </div>

                <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto border border-orange-100 rounded-2xl p-2 bg-orange-50/10">
                  {formVariants.map((v, index) => (
                    <div key={v.id} className="grid grid-cols-6 gap-2 items-center bg-[#FFFDF9] border border-orange-100 p-2 rounded-xl">
                      <div className="col-span-1">
                        <label className="text-[10px] font-bold text-gray-500">Tên phân loại:</label>
                        <input 
                          type="text" 
                          className="text-input text-[10px] py-1 px-2 w-full" 
                          value={v.label} 
                          onChange={(e) => {
                            const nextLabel = e.target.value;
                            setFormVariants((prev) => prev.map((variant, variantIndex) =>
                              variantIndex === index
                                ? { ...variant, label: nextLabel, sku: buildVariantSku(formCode, nextLabel, variantIndex) }
                                : variant
                            ));
                          }} 
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[10px] font-bold text-gray-500">SKU (Tự sinh):</label>
                        <input 
                          type="text" 
                          className="text-input text-[9px] py-1 px-2 w-full bg-gray-50 border-gray-200 cursor-not-allowed font-mono" 
                          value={v.sku} 
                          readOnly
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
                          className="text-[10px] font-bold text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded border border-red-100 mt-4 cursor-pointer"
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
              </div>

              {/* Mô tả sản phẩm */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-orange-950/80">Mô tả sản phẩm chi tiết:</label>
                <textarea
                  className="text-input text-xs py-2 px-3 min-h-[80px]"
                  placeholder="Nhập mô tả sản phẩm chi tiết..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>

              {/* Tags */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-orange-950/80">Tags (Ngăn cách bởi dấu phẩy):</label>
                <input type="text" className="text-input text-xs py-2 px-3" value={formTags} onChange={(e) => setFormTags(e.target.value)} placeholder="Ví dụ: Dành cho mèo, Cát vệ sinh..." />
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-2 justify-end mt-2 border-t pt-3">
                <button
                  type="button"
                  className="tab-button text-xs py-2 px-4 cursor-pointer"
                  onClick={() => setShowProductForm(false)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  className="primary-button text-xs py-2 px-6 cursor-pointer"
                  onClick={async () => {
                    if (!formName.trim() || !formCode.trim()) {
                      alert("Vui lòng điền đầy đủ Tên và Mã sản phẩm!");
                      return;
                    }
                    if (!formCategory) {
                      alert("Vui lòng chọn danh mục sản phẩm!");
                      return;
                    }

                    const productData = {
                      id: editingProduct?.id || `p_${Date.now()}`,
                      code: formCode,
                      name: formName,
                      category: formCategory,
                      brand: "Pet Travel",
                      imageUrl: formImage || "/product-food.svg",
                      images: formImages.length > 0 ? formImages : [formImage || "/product-food.svg"],
                      dimensions: formDimensions,
                      weight: Number(formWeight) || 0,
                      description: formDescription,
                      tags: formTags.split(",").map(t => t.trim()).filter(Boolean),
                      variants: formVariants.map((v) => ({
                        ...v,
                        supplierId: formProductSupplier || v.supplierId || suppliers[0]?.id || "sup_pettravel"
                      }))
                    };

                    const preflightProduct = productSchema.safeParse(productData);
                    if (!preflightProduct.success) {
                      alert(getValidationErrorMessage(preflightProduct.error, "Dữ liệu sản phẩm không hợp lệ."));
                      return;
                    }

                    try {
                      const validatedProduct = productSchema.parse(productData);
                      const res = await fetch("/api/products", {
                        method: editingProduct ? "PUT" : "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(validatedProduct)
                      });
                      if (res.ok) {
                        await fetchProducts();
                        setShowProductForm(false);
                      } else {
                        alert("Lỗi khi lưu sản phẩm.");
                      }
                    } catch {
                      alert("Lỗi kết nối máy chủ.");
                    }
                  }}
                >
                  Lưu thay đổi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- E. CUSTOMER CHECKOUT INFO MODAL --- */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-1000 flex items-center justify-center p-4 bg-black/60 backdrop-filter backdrop-blur-sm animate-fade-in" onClick={() => setShowCheckoutModal(false)}>
          <div 
            className="panel max-w-md w-full flex flex-col gap-4 p-6 relative overflow-hidden bg-[#FFFDF9] animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              type="button" 
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold hover:bg-orange-200 transition active:scale-90 cursor-pointer"
              onClick={() => setShowCheckoutModal(false)}
            >
              ✕
            </button>

            <h3 className="text-lg font-bold text-[#331B08] flex items-center gap-1.5">
              🚚 Thông tin Giao nhận sỉ & Thanh toán
            </h3>
            <p className="muted text-xs leading-relaxed">
              Vui lòng cung cấp chính xác thông tin giao nhận hàng. Đơn hàng sỉ sẽ được khóa và phát hành thông tin chuyển khoản VietQR ngay sau khi xác nhận.
            </p>

            <div className="flex flex-col gap-3 mt-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-orange-950/80">Họ và tên người nhận:</label>
                <input 
                  type="text" 
                  className="text-input text-xs py-2 px-3" 
                  value={recipientName} 
                  onChange={(e) => setRecipientName(e.target.value)} 
                  placeholder="Ví dụ: Nguyễn Văn A..." 
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-orange-950/80">Số điện thoại liên hệ:</label>
                <input 
                  type="text" 
                  className="text-input text-xs py-2 px-3" 
                  value={recipientPhone} 
                  onChange={(e) => setRecipientPhone(e.target.value)} 
                  placeholder="Ví dụ: 0987654321..." 
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-orange-950/80">Địa chỉ giao hàng sỉ:</label>
                <textarea 
                  className="text-input text-xs py-2 px-3 min-h-[80px]" 
                  value={recipientAddress} 
                  onChange={(e) => setRecipientAddress(e.target.value)} 
                  placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành phố..." 
                />
              </div>

              <div className="flex gap-2 justify-end mt-4">
                <button
                  type="button"
                  className="tab-button text-xs py-2 px-4 cursor-pointer font-bold rounded-xl"
                  onClick={() => setShowCheckoutModal(false)}
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  className="primary-button text-xs py-2 px-6 font-bold bg-orange-500 text-white border-orange-600 hover:bg-orange-600 cursor-pointer rounded-xl"
                  onClick={handleConfirmCheckout}
                >
                  Xác nhận & Thanh toán sỉ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* --- CUTE CREDENTIALS LOGIN MODAL --- */}
      {showLoginModal && (
        <div className="fixed inset-0 z-1000 flex items-center justify-center p-4 bg-black/60 backdrop-filter backdrop-blur-sm animate-fade-in" onClick={() => setShowLoginModal(false)}>
          <div 
            className="panel max-w-sm w-full flex flex-col gap-4 p-6 relative overflow-hidden bg-[#FFFDF9] animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              type="button" 
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold hover:bg-orange-200 transition active:scale-90"
              onClick={() => setShowLoginModal(false)}
            >
              ✕
            </button>

            <div className="text-center">
              <span className="text-3xl">🐾</span>
              <h3 className="text-lg font-bold text-[#331B08] mt-2">Đăng nhập Đại lý sỉ</h3>
              <p className="muted text-xs">Vui lòng điền thông tin đăng nhập hoặc chọn tài khoản demo để thử nghiệm nhanh.</p>
            </div>

            <form onSubmit={handleCredentialsLogin} className="flex flex-col gap-3 mt-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-orange-950/80">Địa chỉ Email sỉ</label>
                <input
                  type="email"
                  className="text-input text-sm py-2 px-3"
                  placeholder="admin@pettravel.vn hoặc minh@happypaws.vn..."
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
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
                className="primary-button text-sm py-3 justify-center font-bold bg-orange-500 hover:bg-orange-600 text-white cursor-pointer mt-2"
                disabled={isLoading}
              >
                {isLoading ? "Đang đăng nhập..." : "Đăng nhập Cổng sỉ"}
              </button>
            </form>

            <div className="border-t border-dashed border-orange-200 my-2 pt-3">
              <p className="text-[10px] font-bold text-[#78350F] uppercase text-center">Đăng nhập nhanh (Tài khoản Demo)</p>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <button
                  type="button"
                  className="py-1 px-2 bg-orange-100 hover:bg-orange-200 text-[#78350F] rounded-lg text-[10px] font-bold cursor-pointer"
                  onClick={() => {
                    setLoginEmail("admin@pettravel.vn");
                    setLoginPassword("");
                  }}
                >
                  Admin
                </button>
                <button
                  type="button"
                  className="py-1 px-2 bg-orange-100 hover:bg-orange-200 text-[#78350F] rounded-lg text-[10px] font-bold cursor-pointer"
                  onClick={() => {
                    setLoginEmail("minh@happypaws.vn");
                    setLoginPassword("");
                  }}
                >
                  Minh (Đại lý)
                </button>
                <button
                  type="button"
                  className="py-1 px-2 bg-orange-100 hover:bg-orange-200 text-[#78350F] rounded-lg text-[10px] font-bold cursor-pointer"
                  onClick={() => {
                    setLoginEmail("lan@petland.vn");
                    setLoginPassword("");
                  }}
                >
                  Lan (Đại lý)
                </button>
              </div>
            </div>

            <div className="text-center text-xs mt-1">
              <span className="muted">Tài khoản đại lý được cấp bởi Admin Pet Travel.</span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
