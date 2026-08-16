"use client";

import { useState, useMemo } from "react";
import {
  ShieldCheck,
  Plus,
  ArrowUpRight,
  Link as LinkIcon,
  Calendar as CalendarIcon,
  Printer,
  Sparkles,
  SlidersHorizontal,
  X,
  CheckCircle2,
  Clock,
  PackageCheck
} from "lucide-react";
import type { CustomerOrder, Supplier, Product, OrderItem } from "@/lib/domain";
import type { ApiUser } from "../../types";
import { formatVnd } from "@/lib/money";

interface AdminOrdersProps {
  allOrders: CustomerOrder[];
  workingOrder: CustomerOrder;
  currentUser: ApiUser | null;
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
  handleAdminQtyChange: (itemId: string, qty: number) => void;
  handlePublishQuote: () => void;
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
  allProducts,
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
  handleAdminQtyChange,
  handlePublishQuote,
  confirmDeposit,
  handlePostOrderAccounting
}: AdminOrdersProps) {
  const [darkTabFilter, setDarkTabFilter] = useState<"all" | "draft" | "unpaid" | "accepted" | "locked">("all");
  const [showAdjustments, setShowAdjustments] = useState<boolean>(false);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState<boolean>(false);
  const [isTimelineModalOpen, setIsTimelineModalOpen] = useState<boolean>(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form states for Add Item modal
  const [selectedProductId, setSelectedProductId] = useState<string>(allProducts[0]?.id || "");
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [addItemQty, setAddItemQty] = useState<number>(10);

  // Active selected order or default to first order
  const activeOrder = useMemo(() => {
    if (workingOrder.id) return workingOrder;
    return allOrders.length > 0 ? allOrders[0] : workingOrder;
  }, [workingOrder, allOrders]);

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
      return { finalTotal: 0, subtotal: 0, depositAmount: 0 };
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

  return (
    <div className="admin-dark-dock w-full p-4 sm:p-6 lg:p-7 flex flex-col gap-6 animate-fade-in text-xs">
      {/* 1. TOP TABS & VIEW SWITCHER STRIP (Finnova Dark Header) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#222744] pb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-extrabold text-white tracking-tight">Quản lý Đơn hàng & Báo giá Sỉ</span>
          <span className="text-xs text-gray-400 font-semibold">({allOrders.length} đơn hàng)</span>
        </div>

        {/* Dark Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 bg-[#0e1020] p-1 rounded-full border border-[#232742]">
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
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              darkTabFilter === "draft" ? "bg-[#4f46e5] text-white shadow-sm" : "text-gray-400 hover:text-white"
            }`}
            onClick={() => setDarkTabFilter("draft")}
          >
            <span>Chờ duyệt</span>
            <span className="w-4 h-4 rounded-full bg-white/15 text-[10px] flex items-center justify-center">
              {allOrders.filter((o) => o.commercialStatus === "draft" || o.commercialStatus === "submitted").length}
            </span>
          </button>
          <button
            type="button"
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              darkTabFilter === "unpaid" ? "bg-[#4f46e5] text-white shadow-sm" : "text-gray-400 hover:text-white"
            }`}
            onClick={() => setDarkTabFilter("unpaid")}
          >
            <span>Chưa thu</span>
            <span className="w-4 h-4 rounded-full bg-indigo-400 text-black text-[10px] font-black flex items-center justify-center">
              ₫
            </span>
          </button>
          <button
            type="button"
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
              darkTabFilter === "accepted" ? "bg-[#4f46e5] text-white shadow-sm" : "text-gray-400 hover:text-white"
            }`}
            onClick={() => setDarkTabFilter("accepted")}
          >
            Đã chốt
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

      {/* 2. DUAL-PANE WORKSPACE: LEFT LIST (35%) & RIGHT DETAIL (65%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 min-h-[540px]">
        {/* === LEFT PANE: INVOICES / ORDERS LIST (4/12 cols) === */}
        <div className="lg:col-span-4 flex flex-col gap-2.5 max-h-[580px] overflow-y-auto pr-1 admin-dark-scroll">
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
                  className={`p-3.5 rounded-2xl transition-all duration-200 cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? "bg-[#4f46e5] text-white shadow-[0_10px_28px_rgba(79,70,229,0.45)] scale-[1.01]"
                      : "bg-[#181d33] hover:bg-[#1f2542] text-gray-200 border border-[#272e4e]"
                  }`}
                  onClick={() => selectOrder(ord.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Avatar Pill */}
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${
                        isSelected ? "bg-white text-indigo-700 shadow-sm" : "bg-[#252b4b] text-indigo-300"
                      }`}
                    >
                      {ord.customerName?.charAt(0) || "U"}
                    </div>

                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-xs tracking-tight truncate font-mono">
                          # {ord.number}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
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
                            : "Unsent"}
                        </span>
                      </div>
                      <span className={`text-[11px] truncate mt-0.5 ${isSelected ? "text-indigo-100" : "text-gray-400"}`}>
                        {ord.customerCompany || ord.customerName}
                      </span>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <div className="font-black text-xs sm:text-sm font-mono tracking-tight">
                      {formatVnd(q.finalTotal)}
                    </div>
                    <span className={`text-[10px] block ${isSelected ? "text-indigo-200" : "text-gray-400"}`}>
                      {ord.items.length} SKUs
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* === RIGHT PANE: DETAILED INSPECTION & ACTION WORKSPACE (8/12 cols) === */}
        <div className="lg:col-span-8 flex flex-col justify-between bg-[#171b30] rounded-2xl border border-[#272e4e] p-4 sm:p-6 shadow-inner">
          {activeOrder.id ? (
            <div className="flex flex-col gap-5">
              {/* Header: Invoice Details + Company Name & Logo + Customer Card */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#242a49] pb-4">
                {/* Left: Invoice Number & Status */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Invoice details
                  </span>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight font-mono m-0">
                      # {activeOrder.number}
                    </h2>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                      {activeOrder.commercialStatus === "customer_accepted" ? "Accepted" : "Unsent"}
                    </span>
                  </div>
                </div>

                {/* Middle: Company Brand */}
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Company
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-extrabold text-sm sm:text-base text-white">
                      {activeOrder.customerCompany || "Pet Care Partner"}
                    </span>
                    <Sparkles size={15} className="text-indigo-400" />
                  </div>
                </div>

                {/* Right: Customer Profile Card */}
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

              {/* Itemized Service / Product Cards (3 Columns + Add Item Box) */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Sản phẩm trong đơn sỉ ({activeOrder.items?.length || 0} items)
                  </span>
                  <button
                    type="button"
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer transition flex items-center gap-1"
                    onClick={() => setShowAdjustments(!showAdjustments)}
                  >
                    <SlidersHorizontal size={13} />
                    <span>{showAdjustments ? "Ẩn điều chỉnh giá" : "Điều chỉnh chiết khấu & VAT"}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {activeOrder.items?.slice(0, 3).map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="bg-[#202644] hover:bg-[#252c4e] p-3.5 rounded-2xl border border-[#2e375e] transition flex flex-col justify-between min-h-[95px] relative group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-mono font-black text-sm text-white">
                          {formatVnd(item.unitPriceSnapshot * item.quantity)}
                        </div>
                        <ArrowUpRight size={14} className="text-gray-400 group-hover:text-indigo-400 transition" />
                      </div>

                      <div className="flex flex-col mt-2">
                        <span className="text-xs font-bold text-gray-200 truncate">
                          {item.variantLabel || item.variantSku || item.productName}
                        </span>
                        <div className="flex items-center justify-between mt-1 text-[10px] text-gray-400 font-mono">
                          <span>SL: {item.quantity} × {formatVnd(item.unitPriceSnapshot)}</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="w-4 h-4 rounded bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
                              onClick={() => handleAdminQtyChange(item.id, Math.max(1, item.quantity - 1))}
                            >
                              -
                            </button>
                            <button
                              type="button"
                              className="w-4 h-4 rounded bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
                              onClick={() => handleAdminQtyChange(item.id, item.quantity + 1)}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Add Item Card Box (Opens interactive SKU selector) */}
                  <div
                    className="border-2 border-dashed border-[#2f375e] hover:border-indigo-500/60 bg-[#1a1f38] hover:bg-[#202644] p-3.5 rounded-2xl transition flex flex-col items-center justify-center gap-1.5 cursor-pointer min-h-[95px]"
                    onClick={() => setIsAddItemModalOpen(true)}
                  >
                    <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white">
                      <Plus size={15} />
                    </div>
                    <span className="text-xs font-bold text-gray-300">+ Thêm sản phẩm sỉ</span>
                  </div>
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
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">
              Chọn một đơn hàng từ danh sách bên trái để xem chi tiết
            </div>
          )}

          {/* 3. BOTTOM FINANCIAL SUMMARY BAR & WHITE ACTION PILL BUTTON (Finnova Footer) */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-[#242a49] pt-4 mt-6">
            {/* Financial Figures */}
            <div className="flex flex-wrap items-baseline gap-6 sm:gap-8">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Sub Total
                </span>
                <span className="text-sm sm:text-base font-extrabold text-white font-mono">
                  {formatVnd(subtotal)}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Total
                </span>
                <span className="text-sm sm:text-base font-extrabold text-white font-mono">
                  {formatVnd(finalTotal)}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                  Balance Due
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
                  onClick={handlePublishQuote}
                  disabled={Boolean(isLockedByOther)}
                >
                  Publish Quote
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
      {/* 4. MODALS & POPUPS FOR BUTTONS */}
      {/* ========================================================================= */}

      {/* A. ADD ITEM MODAL */}
      {isAddItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#14182b] border border-[#272e4e] rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 text-white">
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

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-bold text-gray-300">Chọn sản phẩm</label>
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
                  {allProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
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
                className="admin-pill-btn-primary py-2 px-5 text-xs"
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
          <div className="bg-[#14182b] border border-[#272e4e] rounded-3xl p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4 text-white">
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
          <div className="bg-white text-gray-900 border border-gray-200 rounded-3xl p-6 max-w-xl w-full shadow-2xl flex flex-col gap-4 text-xs">
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
    </div>
  );
}
