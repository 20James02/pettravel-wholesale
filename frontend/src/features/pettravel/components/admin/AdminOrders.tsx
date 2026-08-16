"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Image from "next/image";
import {
  ShieldCheck,
  Plus,
  Link as LinkIcon,
  Calendar as CalendarIcon,
  Printer,
  Sparkles,
  SlidersHorizontal,
  X,
  CheckCircle2,
  Clock,
  PackageCheck,
  MapPin,
  Building,
  Phone,
  FileText,
  UserCheck,
  Trash2,
  Send,
  Search,
  Filter,
  CreditCard,
  AlertTriangle,
  Edit3,
  History
} from "lucide-react";
import type { CustomerOrder, Supplier, Product, OrderItem } from "@/lib/domain";
import type { ApiUser } from "../../types";
import { formatVnd } from "@/lib/money";
import { OrderRevisionHistoryModal } from "../shared/OrderRevisionHistoryModal";

interface AdminOrdersProps {
  allOrders: CustomerOrder[];
  workingOrder: CustomerOrder;
  currentUser: ApiUser | null;
  userList?: ApiUser[];
  suppliers: Supplier[];
  allProducts: Product[];
  allCategories: string[];
  adminDiscount: number;
  setAdminDiscount: (val: number) => void;
  adminShippingFee: number;
  setAdminShippingFee: (val: number) => void;
  shippingFeeOption: "included" | "separate_cod";
  setShippingFeeOption: (val: "included" | "separate_cod") => void;
  customDepositInput: string;
  setCustomDepositInput: (val: string) => void;
  isManagerApproved: boolean;
  setIsManagerApproved: (val: boolean) => void;
  adminCategoryFilter: string;
  setAdminCategoryFilter: (val: string) => void;
  adminSupplierFilter: string;
  setAdminSupplierFilter: (val: string) => void;
  isOrderModified: boolean;
  isOrderFrozen: boolean;
  requiresManagerApproval: boolean;
  selectOrder: (id: string) => void;
  setSelectedOrderId: (id: string | null) => void;
  setWorkingOrder: (order: CustomerOrder) => void;
  syncOrder?: (order: CustomerOrder) => Promise<boolean>;
  handleAdminQtyChange: (itemId: string, qty: number) => void;
  handlePublishQuote: (customNote?: string) => void;
  confirmDeposit: () => void;
  attachShipment: () => void;
  handleStockReservationAction: (action: string) => void;
  handlePostOrderAccounting: (action: "post_all" | "post_confirmed_payments") => void;
  addComment: (audience: "customer_visible" | "internal", message: string) => void;
}

export function AdminOrders({
  allOrders,
  workingOrder,
  currentUser,
  userList = [],
  suppliers = [],
  allProducts,
  allCategories = [],
  adminDiscount,
  setAdminDiscount,
  adminShippingFee,
  setAdminShippingFee,
  shippingFeeOption,
  setShippingFeeOption,
  isManagerApproved,
  setIsManagerApproved,
  isOrderModified,
  requiresManagerApproval,
  selectOrder,
  setWorkingOrder,
  syncOrder,
  handleAdminQtyChange,
  handlePublishQuote,
  confirmDeposit,
  handlePostOrderAccounting
}: AdminOrdersProps) {
  const addItemModalRef = useRef<HTMLDivElement>(null);
  const timelineModalRef = useRef<HTMLDivElement>(null);
  const printModalRef = useRef<HTMLDivElement>(null);

  const [darkTabFilter, setDarkTabFilter] = useState<"all" | "draft" | "unpaid" | "accepted" | "locked">("all");
  const [showAdjustments, setShowAdjustments] = useState<boolean>(false);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState<boolean>(false);
  const [isTimelineModalOpen, setIsTimelineModalOpen] = useState<boolean>(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Lock body scroll and active scroll to top when popup opens
  useEffect(() => {
    const isAnyOpen = isAddItemModalOpen || isTimelineModalOpen || isPrintModalOpen;
    if (isAnyOpen) {
      const orig = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = orig;
      };
    }
  }, [isAddItemModalOpen, isTimelineModalOpen, isPrintModalOpen]);

  useEffect(() => {
    if (isAddItemModalOpen && addItemModalRef.current) {
      addItemModalRef.current.scrollTop = 0;
    }
  }, [isAddItemModalOpen]);

  useEffect(() => {
    if (isTimelineModalOpen && timelineModalRef.current) {
      timelineModalRef.current.scrollTop = 0;
    }
  }, [isTimelineModalOpen]);

  useEffect(() => {
    if (isPrintModalOpen && printModalRef.current) {
      printModalRef.current.scrollTop = 0;
    }
  }, [isPrintModalOpen]);

  // Form & filter states
  const [quoteCustomerNote, setQuoteCustomerNote] = useState<string>("");
  const [categoryFilterModal, setCategoryFilterModal] = useState<string>("Tất cả");
  const [supplierFilterModal, setSupplierFilterModal] = useState<string>("Tất cả");
  const [searchModalQuery, setSearchModalQuery] = useState<string>("");

  // Form states for Add Item modal
  const [selectedProductId, setSelectedProductId] = useState<string>(allProducts[0]?.id || "");
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [addItemQty, setAddItemQty] = useState<number>(10);

  // Active selected order or default to first order
  const activeOrder = useMemo(() => {
    if (workingOrder.id) return workingOrder;
    return allOrders.length > 0 ? allOrders[0] : workingOrder;
  }, [workingOrder, allOrders]);

  // Internal staff list from userList
  const staffList = useMemo(() => {
    return (userList || []).filter((u) =>
      ["super_admin", "admin_manager", "order_operator", "accountant", "warehouse"].includes(u.role)
    );
  }, [userList]);

  const getStaffRoleTitle = (role?: string) => {
    switch (role) {
      case "super_admin": return "Super Admin";
      case "admin_manager": return "Quản lý";
      case "order_operator": return "Kinh doanh";
      case "accountant": return "Kế toán";
      case "warehouse": return "Thủ kho";
      default: return role || "Nhân viên";
    }
  };

  const handleStaffSelect = async (staffId: string) => {
    const staff = staffList.find((s) => s.id === staffId);
    const updatedOrder: CustomerOrder = {
      ...activeOrder,
      assignedStaffId: staffId || undefined,
      assignedStaffName: staff ? staff.name : undefined
    };
    setWorkingOrder(updatedOrder);
    if (syncOrder) {
      const ok = await syncOrder(updatedOrder);
      if (ok) {
        showToast(staff ? `Đã phân bổ đơn cho: ${staff.name} (${getStaffRoleTitle(staff.role)})` : "Đã hủy phân bổ nhân viên");
      }
    } else {
      showToast(staff ? `Đã chọn: ${staff.name}` : "Đã hủy chọn");
    }
  };

  // Latest Quote calculation
  const quote = useMemo(() => {
    if (!activeOrder.quoteVersions || activeOrder.quoteVersions.length === 0) {
      return null;
    }
    return activeOrder.quoteVersions[activeOrder.quoteVersions.length - 1];
  }, [activeOrder.quoteVersions]);

  // Filter orders for the left pane
  const filteredOrders = useMemo(() => {
    if (darkTabFilter === "all") return allOrders;
    if (darkTabFilter === "draft") return allOrders.filter((o) => o.commercialStatus === "draft" || o.commercialStatus === "submitted");
    if (darkTabFilter === "unpaid") return allOrders.filter((o) => o.paymentStatus !== "paid");
    if (darkTabFilter === "accepted") return allOrders.filter((o) => o.commercialStatus === "customer_accepted");
    if (darkTabFilter === "locked") return allOrders.filter((o) => o.commercialStatus === "locked");
    return allOrders;
  }, [allOrders, darkTabFilter]);

  const latestQuote = (ord: CustomerOrder) => {
    if (!ord.quoteVersions || ord.quoteVersions.length === 0) {
      const calcSub = ord.items?.reduce((s, i) => s + (i.quantity || 0) * (i.unitPriceSnapshot || 0), 0) || 0;
      return { finalTotal: calcSub, subtotal: calcSub, depositAmount: Math.round(calcSub * 0.3) };
    }
    return ord.quoteVersions[ord.quoteVersions.length - 1];
  };

  const isLockedByOther = useMemo(() => {
    if (!activeOrder.id) return false;
    return (
      activeOrder.assignedStaffId &&
      activeOrder.assignedStaffId !== currentUser?.id &&
      currentUser?.role !== "super_admin"
    );
  }, [activeOrder.id, activeOrder.assignedStaffId, currentUser]);

  // Financial totals
  const subtotal = quote ? quote.subtotal : activeOrder.items?.reduce((sum, i) => sum + i.quantity * i.unitPriceSnapshot, 0) || 0;
  const finalTotal = quote ? quote.finalTotal : subtotal;
  const depositRequired = quote ? quote.depositAmount : Math.round(finalTotal * 0.3);
  const balanceDue = finalTotal - (activeOrder.paymentStatus === "deposit_confirmed" ? depositRequired : 0);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Add Item to Order Handler
  const handleAddItemToOrder = () => {
    const prod = allProducts.find((p) => p.id === selectedProductId);
    if (!prod) {
      alert("Vui lòng chọn sản phẩm!");
      return;
    }
    const variant = prod.variants.find((v) => v.id === selectedVariantId) || prod.variants[0];
    if (!variant) {
      alert("Sản phẩm không có biến thể hợp lệ!");
      return;
    }

    const newItem: OrderItem = {
      id: `item_${Date.now()}`,
      productCode: prod.code,
      productName: prod.name,
      variantSku: variant.sku,
      variantLabel: variant.label,
      variantImage: variant.imageUrl || prod.imageUrl || "/product-food.svg",
      unitPriceSnapshot: variant.wholesalePrice || 100000,
      quantity: addItemQty,
      supplierId: variant.supplierId || "sup_pettravel"
    };

    const updatedItems = [...(activeOrder.items || []), newItem];
    setWorkingOrder({
      ...activeOrder,
      items: updatedItems
    });

    setIsAddItemModalOpen(false);
    showToast(`Đã thêm ${addItemQty} × ${variant.label} vào đơn hàng!`);
  };

  // Remove Item from Order Handler
  const handleRemoveItemFromOrder = (itemId: string) => {
    const updatedItems = (activeOrder.items || []).filter((i) => i.id !== itemId);
    setWorkingOrder({
      ...activeOrder,
      items: updatedItems
    });
    showToast("Đã xóa sản phẩm khỏi đơn hàng!");
  };

  // Publish Quote with Customer Note
  const onPublishQuoteWithNote = () => {
    handlePublishQuote(quoteCustomerNote.trim() || undefined);
    setQuoteCustomerNote("");
  };

  // Filtered Products for Add Item Modal
  const modalFilteredProducts = useMemo(() => {
    return allProducts.filter((p) => {
      const matchCat = categoryFilterModal === "Tất cả" || p.category === categoryFilterModal;
      const matchSup = supplierFilterModal === "Tất cả" || (p.variants && p.variants.some((v) => v.supplierId === supplierFilterModal));
      const matchSearch = !searchModalQuery.trim() || p.name.toLowerCase().includes(searchModalQuery.toLowerCase()) || p.code.toLowerCase().includes(searchModalQuery.toLowerCase());
      return matchCat && matchSup && matchSearch;
    });
  }, [allProducts, categoryFilterModal, supplierFilterModal, searchModalQuery]);

  return (
    <div className="admin-dark-dock w-full p-4 sm:p-6 lg:p-7 flex flex-col gap-6 animate-fade-in text-xs">
      {/* 1. TOP TABS & VIEW SWITCHER STRIP (Finnova Dark Header) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#222744] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <PackageCheck size={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-extrabold text-white tracking-tight">
              Quản Lý Báo Giá & Đơn Hàng Sỉ B2B
            </span>
            <span className="text-xs text-gray-400 font-medium">
              Xử lý báo giá, kiểm tra tồn kho ATP, ghi chú gửi đại lý và phân bổ nhân sự chốt đơn
            </span>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-[#14182b] p-1 rounded-2xl border border-[#262c4c]">
          <button
            type="button"
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
              darkTabFilter === "all" ? "bg-[#4f46e5] text-white shadow-sm" : "text-gray-400 hover:text-white"
            }`}
            onClick={() => setDarkTabFilter("all")}
          >
            Tất cả ({allOrders.length})
          </button>
          <button
            type="button"
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
              darkTabFilter === "draft" ? "bg-[#4f46e5] text-white shadow-sm" : "text-gray-400 hover:text-white"
            }`}
            onClick={() => setDarkTabFilter("draft")}
          >
            Chờ duyệt
          </button>
          <button
            type="button"
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
              darkTabFilter === "unpaid" ? "bg-[#4f46e5] text-white shadow-sm" : "text-gray-400 hover:text-white"
            }`}
            onClick={() => setDarkTabFilter("unpaid")}
          >
            Chờ thu tiền
          </button>
          <button
            type="button"
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
              darkTabFilter === "accepted" ? "bg-[#4f46e5] text-white shadow-sm" : "text-gray-400 hover:text-white"
            }`}
            onClick={() => setDarkTabFilter("accepted")}
          >
            Khách đã chốt
          </button>
          <button
            type="button"
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
              darkTabFilter === "locked" ? "bg-[#4f46e5] text-white shadow-sm" : "text-gray-400 hover:text-white"
            }`}
            onClick={() => setDarkTabFilter("locked")}
          >
            Đã khóa
          </button>
        </div>
      </div>

      {/* 2. DUAL-PANE WORKSPACE: COMPACT LEFT LIST (25%) & EXPANDED RIGHT DETAIL (75%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 min-h-[560px]">
        {/* === LEFT PANE: COMPACT ORDER LIST (3/12 cols) === */}
        <div className="lg:col-span-3 flex flex-col gap-2 max-h-[640px] overflow-y-auto pr-1 admin-dark-scroll">
          {filteredOrders.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-400 border border-dashed border-[#293050] rounded-2xl bg-[#161a30]">
              Không có đơn hàng nào phù hợp bộ lọc.
            </div>
          ) : (
            filteredOrders.map((ord) => {
              const q = latestQuote(ord);
              const isSelected = ord.id === activeOrder.id;

              return (
                <div
                  key={ord.id}
                  className={`p-3 rounded-2xl transition-all duration-200 cursor-pointer flex flex-col gap-2 ${
                    isSelected
                      ? "bg-[#4f46e5] text-white shadow-[0_8px_24px_rgba(79,70,229,0.45)] scale-[1.01]"
                      : "bg-[#181d33] hover:bg-[#1f2542] text-gray-200 border border-[#272e4e]"
                  }`}
                  onClick={() => selectOrder(ord.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-[10px] shrink-0 ${
                          isSelected ? "bg-white text-indigo-700 shadow-sm" : "bg-[#252b4b] text-indigo-300"
                        }`}
                      >
                        {ord.customerName?.charAt(0) || "U"}
                      </div>
                      <span className="font-extrabold text-xs tracking-tight truncate font-mono">
                        # {ord.number}
                      </span>
                    </div>

                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        isSelected
                          ? "bg-white/20 text-white"
                          : ord.commercialStatus === "customer_accepted"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : ord.commercialStatus === "locked"
                          ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                          : "bg-gray-700/50 text-gray-300"
                      }`}
                    >
                      {ord.commercialStatus === "customer_accepted"
                        ? "Accepted"
                        : ord.commercialStatus === "locked"
                        ? "Locked"
                        : "Draft"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px] pt-1 border-t border-white/10">
                    <span className={`truncate ${isSelected ? "text-indigo-100" : "text-gray-400"}`}>
                      {ord.customerCompany || ord.customerName}
                    </span>
                    <span className="font-mono font-black text-xs shrink-0">
                      {formatVnd(q.finalTotal)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* === RIGHT PANE: DETAILED INSPECTION & ACTION WORKSPACE (9/12 cols) === */}
        <div className="lg:col-span-9 flex flex-col justify-between bg-[#171b30] rounded-2xl border border-[#272e4e] p-4 sm:p-6 shadow-inner">
          {activeOrder.id ? (
            <div className="flex flex-col gap-5">
              {/* 1. Header: Invoice Title + Company + Customer Card */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#242a49] pb-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Mã đơn hàng sỉ
                  </span>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight font-mono m-0">
                      # {activeOrder.number}
                    </h2>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                      {activeOrder.commercialStatus === "customer_accepted" ? "Khách đã chốt" : "Bản thảo báo giá"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsHistoryModalOpen(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-900/50 hover:bg-indigo-800/70 text-indigo-200 text-xs font-bold border border-indigo-500/40 transition-colors cursor-pointer"
                      title="Xem lịch sử các lần sửa đổi sản phẩm, báo giá và trao đổi với khách"
                    >
                      <History size={13} className="text-indigo-400" />
                      <span>Lịch sử duyệt đơn</span>
                    </button>
                  </div>
                </div>

                {/* Company Brand */}
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Đại lý / Doanh nghiệp
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-extrabold text-sm sm:text-base text-white">
                      {activeOrder.customerCompany || "Pet Care Wholesale Partner"}
                    </span>
                    <Sparkles size={15} className="text-indigo-400" />
                  </div>
                </div>

                {/* Customer Profile Card */}
                <div className="flex items-center gap-2.5 bg-[#1f2544] p-2 pr-3.5 rounded-2xl border border-[#2f375f]">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-black text-white text-xs shadow-sm">
                    {activeOrder.customerName?.charAt(0) || "C"}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-xs text-white leading-tight">
                      {activeOrder.customerName}
                    </span>
                    <span className="text-[10px] text-gray-400 font-medium">
                      Đại lý Sỉ VIP
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. CUSTOMER DETAILS & ORDER ASSIGNEE STRIP (Dữ liệu thực từ DB) */}
              <div className="bg-[#14182b] p-4 rounded-2xl border border-[#262c4c] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 text-xs">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                    <MapPin size={12} className="text-indigo-400" /> Địa chỉ giao hàng
                  </span>
                  <span className="text-white font-medium line-clamp-2" title={activeOrder.recipientAddress || "Chưa có địa chỉ"}>
                    {activeOrder.recipientAddress || "—"}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                    <Building size={12} className="text-indigo-400" /> Mã số thuế
                  </span>
                  <span className="text-white font-mono font-bold">
                    {activeOrder.customerTaxCode || (activeOrder as unknown as { taxId?: string }).taxId || "—"}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                    <Phone size={12} className="text-indigo-400" /> Số điện thoại
                  </span>
                  <span className="text-white font-mono font-bold">
                    {activeOrder.recipientPhone || "—"}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-sky-400 uppercase flex items-center gap-1">
                    <CreditCard size={12} /> Hình thức TT
                  </span>
                  <span className="text-sky-200 font-bold leading-tight">
                    {activeOrder.paymentIntent === "pay_full" ? "Thanh toán 100%" : "Cọc 30% + Thu COD"}
                    {activeOrder.invoiceRequested ? " (VAT)" : ""}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-amber-400 uppercase flex items-center gap-1">
                    <FileText size={12} /> Note của khách
                  </span>
                  <span
                    className="text-amber-200/90 font-medium italic line-clamp-2"
                    title={
                      activeOrder.customerNote ||
                      activeOrder.comments?.find(
                        (c) => c.audience === "customer_visible" && c.author !== "Hệ thống" && !c.message.startsWith("Nhân viên đã")
                      )?.message ||
                      "Không có ghi chú"
                    }
                  >
                    {activeOrder.customerNote ||
                      activeOrder.comments?.find(
                        (c) => c.audience === "customer_visible" && c.author !== "Hệ thống" && !c.message.startsWith("Nhân viên đã")
                      )?.message ||
                      "—"}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase flex items-center gap-1">
                    <UserCheck size={12} /> Nhân viên xử lý
                  </span>
                  <select
                    className="w-full bg-[#1e2440] border border-[#303960] rounded-xl py-1.5 px-2 text-white text-xs font-semibold focus:ring-1 focus:ring-indigo-500"
                    value={activeOrder.assignedStaffId || ""}
                    onChange={(e) => handleStaffSelect(e.target.value)}
                  >
                    <option value="">-- Chưa phân bổ --</option>
                    {staffList.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name} ({getStaffRoleTitle(staff.role)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Order Modification Alert & Re-quote Action Banner */}
              {isOrderModified && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-gradient-to-r from-amber-500/20 via-indigo-500/20 to-purple-500/20 border border-amber-500/50 rounded-2xl animate-fade-in shadow-lg">
                  <div className="flex items-center gap-2.5 text-amber-300 font-bold text-xs">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
                    <span>Đơn hàng đã được điều chỉnh số lượng/sản phẩm. Vui lòng bấm nút để gửi lại báo giá cho khách duyệt!</span>
                  </div>
                  <button
                    type="button"
                    onClick={onPublishQuoteWithNote}
                    className="px-4 py-2 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-600 hover:to-indigo-700 text-white font-black rounded-xl shadow flex items-center gap-2 cursor-pointer transition text-xs whitespace-nowrap"
                  >
                    <Send size={14} /> Gửi xác nhận lại khách (Báo giá mới)
                  </button>
                </div>
              )}

              {/* Locked Quote Notice when waiting for customer response */}
              {activeOrder.commercialStatus === "quoted" && !isOrderModified && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-[#1a203d] border border-amber-500/40 rounded-2xl animate-fade-in shadow-md">
                  <div className="flex items-center gap-2.5 text-amber-300 font-bold text-xs">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                    <span>⏳ Báo giá đã gửi cho đại lý duyệt. Hệ thống tạm khóa chỉnh sửa để tránh chồng chéo dữ liệu.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAdjustments(true)}
                    className="px-3.5 py-1.5 bg-[#252e55] hover:bg-[#303c6e] border border-amber-400/40 text-amber-200 hover:text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap"
                  >
                    <Edit3 size={13} /> Mở điều chỉnh báo giá
                  </button>
                </div>
              )}

              {/* Customer Request Change Alert */}
              {activeOrder.commercialStatus === "admin_review" && (
                <div className="p-3.5 bg-rose-500/15 border border-rose-500/50 rounded-2xl flex items-start gap-2.5 text-xs text-rose-200 font-bold shadow-md">
                  <AlertTriangle size={18} className="text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-1 w-full">
                    <span className="text-rose-300 uppercase tracking-wide text-[11px]">Đại lý yêu cầu điều chỉnh đơn sỉ:</span>
                    <span className="text-white font-medium bg-black/40 p-2.5 rounded-xl border border-rose-500/30">
                      {activeOrder.customerNote || activeOrder.comments?.find((c) => c.audience === "customer_visible" && c.author !== "Hệ thống" && !c.message.startsWith("Nhân viên đã"))?.message || "Đại lý yêu cầu xem xét lại số lượng hoặc bảng giá."}
                    </span>
                  </div>
                </div>
              )}

              {/* 3. PRODUCT ITEMS LIST (Mã, Tên SP, Phân loại, Đơn giá, SL, Tổng tiền) */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                    Sản phẩm trong đơn sỉ ({activeOrder.items?.length || 0} sản phẩm)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer transition flex items-center gap-1"
                      onClick={() => setShowAdjustments(!showAdjustments)}
                    >
                      <SlidersHorizontal size={13} />
                      <span>{showAdjustments ? "Ẩn điều chỉnh giá" : "Điều chỉnh chiết khấu & VAT"}</span>
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition"
                      onClick={() => setIsAddItemModalOpen(true)}
                    >
                      <Plus size={14} />
                      <span>+ Thêm sản phẩm sỉ</span>
                    </button>
                  </div>
                </div>

                {/* Table of Order Items */}
                <div className="bg-[#14182b] rounded-2xl border border-[#272e4e] overflow-x-auto w-full">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#293154] text-[10px] text-gray-400 uppercase font-bold">
                        <th className="py-2.5 px-3">Mã SP</th>
                        <th className="py-2.5 px-3">Tên sản phẩm</th>
                        <th className="py-2.5 px-3">Phân loại & Quy cách</th>
                        <th className="py-2.5 px-3 text-right">Đơn giá sỉ</th>
                        <th className="py-2.5 px-3 text-center">Số lượng</th>
                        <th className="py-2.5 px-3 text-right">Tổng tiền</th>
                        <th className="py-2.5 px-3 text-center">Xóa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#232a48]">
                      {activeOrder.items && activeOrder.items.length > 0 ? (
                        activeOrder.items.map((item, idx) => {
                          const prod = allProducts.find((p) => p.code === item.productCode || p.name === item.productName);
                          const variant = prod?.variants?.find((v) => v.sku === item.variantSku || v.label === item.variantLabel);
                          const img = item.variantImage || variant?.imageUrl || prod?.imageUrl || "/product-food.svg";

                          return (
                            <tr key={item.id || idx} className="hover:bg-[#1d2340]/60 transition">
                              <td className="py-3 px-3 font-mono font-bold text-indigo-300">
                                {item.productCode || "PTW-SKU"}
                              </td>
                              <td className="py-3 px-3 font-extrabold text-white max-w-[200px] truncate">
                                {item.productName}
                              </td>
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-lg bg-[#202644] border border-[#2e375e] overflow-hidden relative shrink-0">
                                    <Image src={img} alt={item.variantLabel || "thumb"} fill className="object-cover" />
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="font-bold text-gray-200">
                                      {item.variantLabel || item.variantSku}
                                    </span>
                                    <span className="text-[10px] text-gray-400 font-mono">
                                      SKU: {item.variantSku}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-3 text-right font-mono font-bold text-gray-200">
                                {formatVnd(item.unitPriceSnapshot)}
                              </td>
                              <td className="py-3 px-3 text-center">
                                <div className="inline-flex items-center gap-1 bg-[#1d2340] border border-[#2f375e] rounded-xl p-1">
                                  <button
                                    type="button"
                                    className="w-5 h-5 rounded bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold cursor-pointer transition disabled:opacity-30"
                                    onClick={() => handleAdminQtyChange(item.id, Math.max(1, item.quantity - 1))}
                                    disabled={item.quantity <= 1}
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min="1"
                                    max="10000"
                                    className="w-12 text-center bg-transparent font-mono font-black text-white px-1 text-xs focus:outline-none focus:bg-white/10 rounded"
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value, 10);
                                      if (!isNaN(val) && val > 0) {
                                        handleAdminQtyChange(item.id, val);
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="w-5 h-5 rounded bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold cursor-pointer transition"
                                    onClick={() => handleAdminQtyChange(item.id, item.quantity + 1)}
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td className="py-3 px-3 text-right font-mono font-black text-emerald-400 text-sm">
                                {formatVnd(item.unitPriceSnapshot * item.quantity)}
                              </td>
                              <td className="py-3 px-3 text-center">
                                <button
                                  type="button"
                                  className="w-7 h-7 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center cursor-pointer transition"
                                  title="Xóa sản phẩm"
                                  onClick={() => handleRemoveItemFromOrder(item.id)}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={7} className="text-center py-6 text-gray-400">
                            Chưa có sản phẩm nào trong đơn sỉ. Bấm <b>+ Thêm sản phẩm sỉ</b> để thêm.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Price Adjustments & Approval Section (if toggled) */}
              {showAdjustments && (
                <div className="p-4 rounded-2xl bg-[#14182b] border border-[#262c4c] flex flex-col gap-3 animate-fade-in text-xs">
                  <div className="flex items-center justify-between font-bold text-gray-200">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck size={15} className="text-indigo-400" /> Báo giá & Chiết khấu thương mại
                    </span>
                    {requiresManagerApproval && (
                      <span className="text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded-md">
                        Cần Quản lý duyệt (&gt; 8% hoặc &gt; 500k)
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] text-gray-400 font-bold uppercase">Chiết khấu (VND)</label>
                      <input
                        type="number"
                        className="w-full mt-1 bg-[#1e2440] border border-[#303960] rounded-xl py-1.5 px-3 text-white font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                        value={adminDiscount}
                        onChange={(e) => setAdminDiscount(Math.max(0, Number(e.target.value) || 0))}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 font-bold uppercase">Phí vận chuyển (VND)</label>
                      <input
                        type="number"
                        className="w-full mt-1 bg-[#1e2440] border border-[#303960] rounded-xl py-1.5 px-3 text-white font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                        value={adminShippingFee}
                        onChange={(e) => setAdminShippingFee(Math.max(0, Number(e.target.value) || 0))}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 font-bold uppercase">Hình thức phí ship</label>
                      <select
                        className="w-full mt-1 bg-[#1e2440] border border-[#303960] rounded-xl py-1.5 px-3 text-white text-xs focus:ring-1 focus:ring-indigo-500"
                        value={shippingFeeOption}
                        onChange={(e) => setShippingFeeOption(e.target.value as "included" | "separate_cod")}
                      >
                        <option value="included">Cộng vào đơn sỉ</option>
                        <option value="separate_cod">Thu riêng khi nhận hàng</option>
                      </select>
                    </div>
                  </div>

                  {requiresManagerApproval && currentUser?.role === "super_admin" && (
                    <label className="flex items-center gap-2 cursor-pointer mt-1 font-bold text-indigo-300">
                      <input
                        type="checkbox"
                        checked={isManagerApproved}
                        onChange={(e) => setIsManagerApproved(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-0"
                      />
                      <span>Super Admin: Tôi xác nhận phê duyệt chiết khấu đặc biệt này</span>
                    </label>
                  )}
                </div>
              )}

              {/* 4. KHUNG NOTE CHO KHÁCH MỖI LẦN GỬI XÁC NHẬN ĐƠN ĐẾN KHÁCH */}
              <div className="bg-[#14182b] p-3.5 rounded-2xl border border-[#262c4c] flex flex-col gap-2">
                <label className="text-[11px] font-bold text-indigo-300 flex items-center gap-1.5">
                  <Send size={13} /> Khung note gửi khách mỗi lần gửi xác nhận báo giá / đơn hàng
                </label>
                <textarea
                  rows={2}
                  className="w-full bg-[#1c223c] border border-[#2c365c] rounded-xl p-2.5 text-white text-xs placeholder:text-gray-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="Ví dụ: Dạ em đã áp dụng chiết khấu 2% cho đơn trên 10tr và miễn phí ship hỏa tốc nội thành ạ. Anh/Chị duyệt giúp em để xuất kho sớm nhé..."
                  value={quoteCustomerNote}
                  onChange={(e) => setQuoteCustomerNote(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">
              Chọn một đơn hàng từ danh sách bên trái để xem chi tiết
            </div>
          )}

          {/* 5. BOTTOM FINANCIAL SUMMARY BAR & WHITE ACTION PILL BUTTON */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-[#242a49] pt-4 mt-6">
            {/* Financial Figures */}
            <div className="flex flex-wrap items-baseline gap-6 sm:gap-8">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Tạm tính (Sub Total)
                </span>
                <span className="text-sm sm:text-base font-extrabold text-white font-mono">
                  {formatVnd(subtotal)}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Tổng đơn sỉ (Total)
                </span>
                <span className="text-sm sm:text-base font-extrabold text-white font-mono">
                  {formatVnd(finalTotal)}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                  Còn lại cần thanh toán
                </span>
                <span className="text-base sm:text-lg font-black text-indigo-300 font-mono">
                  {formatVnd(balanceDue)}
                </span>
              </div>
            </div>

            {/* Actions: Utility Icons + Primary White Action Pill */}
            <div className="flex items-center gap-2.5 self-stretch sm:self-auto justify-end">
              {/* Copy Order Deep Link Button */}
              <button
                type="button"
                className="w-9 h-9 rounded-xl bg-[#202644] hover:bg-[#293156] border border-[#2e375e] flex items-center justify-center text-gray-300 hover:text-white transition cursor-pointer"
                title="Sao chép link đơn hàng"
                onClick={() => {
                  const url = `${window.location.origin}/order?id=${activeOrder.id}`;
                  navigator.clipboard?.writeText(url);
                  showToast(`Đã sao chép link đơn #${activeOrder.number}!`);
                }}
              >
                <LinkIcon size={15} />
              </button>

              {/* Order Timeline Audit Modal Button */}
              <button
                type="button"
                className="w-9 h-9 rounded-xl bg-[#202644] hover:bg-[#293156] border border-[#2e375e] flex items-center justify-center text-gray-300 hover:text-white transition cursor-pointer"
                title="Xem lịch sử thay đổi & timeline đơn hàng"
                onClick={() => setIsTimelineModalOpen(true)}
              >
                <CalendarIcon size={15} />
              </button>

              {/* Print Preview Button */}
              <button
                type="button"
                className="w-9 h-9 rounded-xl bg-[#202644] hover:bg-[#293156] border border-[#2e375e] flex items-center justify-center text-gray-300 hover:text-white transition cursor-pointer"
                title="In hóa đơn báo giá / Phiếu xuất kho"
                onClick={() => setIsPrintModalOpen(true)}
              >
                <Printer size={15} />
              </button>

              {/* Primary White Action Pill Button */}
              {activeOrder.commercialStatus === "submitted" || isOrderModified ? (
                <button
                  type="button"
                  className="admin-pill-btn-white text-xs sm:text-sm py-2.5 px-6"
                  onClick={onPublishQuoteWithNote}
                  disabled={Boolean(isLockedByOther)}
                >
                  Publish Quote (Gửi Báo Giá)
                </button>
              ) : activeOrder.commercialStatus === "customer_accepted" ? (
                <button
                  type="button"
                  className="admin-pill-btn-white text-xs sm:text-sm py-2.5 px-6"
                  onClick={confirmDeposit}
                  disabled={Boolean(isLockedByOther)}
                >
                  Confirm Deposit & ATP
                </button>
              ) : (
                <button
                  type="button"
                  className="admin-pill-btn-white text-xs sm:text-sm py-2.5 px-6"
                  onClick={() => handlePostOrderAccounting("post_all")}
                  disabled={Boolean(isLockedByOther)}
                >
                  Post Ledger & Complete
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. MODALS & POPUPS */}
      {/* ========================================================================= */}

      {/* A. ADD ITEM MODAL WITH CATEGORY & SUPPLIER FILTERS */}
      {isAddItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div ref={addItemModalRef} className="bg-[#14182b] border border-[#272e4e] rounded-3xl p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4 text-white max-h-[90vh] overflow-y-auto admin-dark-scroll">
            <div className="flex items-center justify-between border-b border-[#232a48] pb-3">
              <div className="flex items-center gap-2">
                <Plus size={18} className="text-indigo-400" />
                <h3 className="font-extrabold text-white text-base m-0">Thêm sản phẩm vào đơn sỉ</h3>
              </div>
              <button
                type="button"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 cursor-pointer"
                onClick={() => setIsAddItemModalOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            {/* Filters: Category & Supplier & Search */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#181d34] p-3 rounded-2xl border border-[#283256]">
              <div>
                <label className="text-[10px] font-bold text-gray-300 uppercase flex items-center gap-1">
                  <Filter size={11} /> Lọc theo danh mục
                </label>
                <select
                  className="w-full mt-1 bg-[#1e2440] border border-[#303960] rounded-xl py-1.5 px-2.5 text-white text-xs"
                  value={categoryFilterModal}
                  onChange={(e) => setCategoryFilterModal(e.target.value)}
                >
                  <option value="Tất cả">Tất cả danh mục ({allCategories.length})</option>
                  {allCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-300 uppercase flex items-center gap-1">
                  <Building size={11} /> Nhà cung cấp
                </label>
                <select
                  className="w-full mt-1 bg-[#1e2440] border border-[#303960] rounded-xl py-1.5 px-2.5 text-white text-xs"
                  value={supplierFilterModal}
                  onChange={(e) => setSupplierFilterModal(e.target.value)}
                >
                  <option value="Tất cả">Tất cả NCC ({suppliers.length})</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Tìm theo tên sản phẩm hoặc mã SKU..."
                    className="w-full bg-[#1e2440] border border-[#303960] rounded-xl py-1.5 pl-8 pr-3 text-white text-xs"
                    value={searchModalQuery}
                    onChange={(e) => setSearchModalQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-bold text-gray-300">
                  Chọn sản phẩm ({modalFilteredProducts.length} sản phẩm phù hợp)
                </label>
                <select
                  className="w-full mt-1 bg-[#1c223c] border border-[#2c365c] rounded-xl py-2 px-3 text-white text-xs"
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    const p = allProducts.find((item) => item.id === e.target.value);
                    if (p && p.variants[0]) {
                      setSelectedVariantId(p.variants[0].id);
                    }
                  }}
                >
                  {modalFilteredProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.code}] {p.name} ({p.category})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-300">Chọn phân loại / Quy cách</label>
                <select
                  className="w-full mt-1 bg-[#1c223c] border border-[#2c365c] rounded-xl py-2 px-3 text-white text-xs"
                  value={selectedVariantId}
                  onChange={(e) => setSelectedVariantId(e.target.value)}
                >
                  {allProducts
                    .find((p) => p.id === selectedProductId)
                    ?.variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label} ({v.sku}) - {formatVnd(v.wholesalePrice || 0)} (Tồn: {v.stock})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-300">Số lượng đặt sỉ</label>
                <input
                  type="number"
                  min="1"
                  className="w-full mt-1 bg-[#1c223c] border border-[#2c365c] rounded-xl py-2 px-3 text-white text-xs font-mono"
                  value={addItemQty}
                  onChange={(e) => setAddItemQty(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 mt-2 border-t border-[#232a48] pt-3 text-xs">
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-gray-300 hover:text-white cursor-pointer"
                onClick={() => setIsAddItemModalOpen(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="admin-pill-btn-primary py-2 px-5 text-xs cursor-pointer"
                onClick={handleAddItemToOrder}
              >
                Thêm vào đơn hàng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* B. ORDER AUDIT TIMELINE MODAL */}
      {isTimelineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div ref={timelineModalRef} className="bg-[#14182b] border border-[#272e4e] rounded-3xl p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4 text-white max-h-[90vh] overflow-y-auto admin-dark-scroll">
            <div className="flex items-center justify-between border-b border-[#232a48] pb-3">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-indigo-400" />
                <h3 className="font-extrabold text-white text-base m-0">Lịch sử & Audit Trail đơn #{activeOrder.number}</h3>
              </div>
              <button
                type="button"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 cursor-pointer"
                onClick={() => setIsTimelineModalOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex flex-col gap-3 max-h-72 overflow-y-auto admin-dark-scroll pr-1">
              <div className="p-3 bg-[#1c223c] rounded-2xl border border-[#2e375e] flex items-start gap-3">
                <PackageCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white text-xs block">Trạng thái thương mại: {activeOrder.commercialStatus}</span>
                  <span className="text-[10px] text-gray-400">Thanh toán: {activeOrder.paymentStatus}</span>
                </div>
              </div>

              {activeOrder.comments?.map((comment) => (
                <div key={comment.id} className="p-3 bg-[#171c32] rounded-2xl border border-[#272f50] text-xs">
                  <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold">
                    <span>{comment.author}</span>
                    <span>{new Date(comment.createdAt).toLocaleString("vi-VN")}</span>
                  </div>
                  <p className="text-gray-200 mt-1 m-0">{comment.message}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2.5 mt-2 border-t border-[#232a48] pt-3 text-xs">
              <button
                type="button"
                className="admin-pill-btn-white py-2 px-5 text-xs"
                onClick={() => setIsTimelineModalOpen(false)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* C. PRINT PROFORMA INVOICE MODAL */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div ref={printModalRef} className="bg-white text-gray-900 border border-gray-200 rounded-3xl p-6 max-w-xl w-full shadow-2xl flex flex-col gap-4 text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center gap-2">
                <Printer size={18} className="text-indigo-600" />
                <h3 className="font-black text-gray-900 text-base m-0">Hóa đơn Báo giá B2B / Proforma Invoice</h3>
              </div>
              <button
                type="button"
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 cursor-pointer"
                onClick={() => setIsPrintModalOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex flex-col gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-200">
              <div className="flex justify-between items-center">
                <div>
                  <strong className="text-sm text-gray-900">PET TRAVEL WHOLESALE</strong>
                  <p className="text-[11px] text-gray-500 m-0">Hệ thống phân phối thú cưng toàn quốc</p>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-sm text-indigo-700">#{activeOrder.number}</span>
                  <p className="text-[10px] text-gray-400 m-0">{new Date().toLocaleDateString("vi-VN")}</p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-2 text-[11px]">
                <p className="m-0"><strong>Khách hàng / Đại lý:</strong> {activeOrder.customerCompany || activeOrder.customerName}</p>
                <p className="m-0 mt-0.5"><strong>Địa chỉ giao hàng:</strong> {activeOrder.recipientAddress || "Kho nhận hàng trung tâm"}</p>
              </div>

              <table className="w-full text-left text-xs mt-2 border-t border-gray-200 pt-2">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 font-bold text-[10px] uppercase">
                    <th className="py-1">Sản phẩm</th>
                    <th className="py-1 text-center">SL</th>
                    <th className="py-1 text-right">Đơn giá</th>
                    <th className="py-1 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activeOrder.items?.map((item) => (
                    <tr key={item.id}>
                      <td className="py-1.5 font-semibold">{item.variantLabel || item.productName}</td>
                      <td className="py-1.5 text-center font-mono">{item.quantity}</td>
                      <td className="py-1.5 text-right font-mono">{formatVnd(item.unitPriceSnapshot)}</td>
                      <td className="py-1.5 text-right font-mono font-bold">{formatVnd(item.unitPriceSnapshot * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-gray-300 pt-2 flex flex-col gap-1 text-right">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Tổng tiền hàng:</span>
                  <span className="font-mono font-bold">{formatVnd(subtotal)}</span>
                </div>
                <div className="flex justify-between text-xs text-indigo-600 font-black">
                  <span>Tổng thanh toán:</span>
                  <span className="font-mono text-sm">{formatVnd(finalTotal)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 border-t border-gray-200 pt-3">
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-gray-600 hover:text-gray-900 cursor-pointer"
                onClick={() => setIsPrintModalOpen(false)}
              >
                Đóng
              </button>
              <button
                type="button"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-5 rounded-xl cursor-pointer"
                onClick={() => window.print()}
              >
                In văn bản (Print)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#16192b] text-white px-4 py-3 rounded-2xl border border-indigo-500/50 shadow-2xl flex items-center gap-2 animate-slide-up-sheet text-xs font-bold">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modal Lịch sử duyệt đơn */}
      <OrderRevisionHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        orderId={activeOrder.id}
        orderNumber={activeOrder.number}
        allProducts={allProducts}
      />
    </div>
  );
}
