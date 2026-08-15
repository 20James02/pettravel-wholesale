"use client";

import { useState, useMemo } from "react";
import {
  ShieldCheck,
  Plus,
  ArrowUpRight,
  Link as LinkIcon,
  Calendar as CalendarIcon,
  Sparkles,
  SlidersHorizontal
} from "lucide-react";
import type { CustomerOrder, Supplier, Product } from "@/lib/domain";
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
  handlePublishQuote,
  confirmDeposit,
  handlePostOrderAccounting
}: AdminOrdersProps) {
  const [darkTabFilter, setDarkTabFilter] = useState<"all" | "draft" | "unpaid" | "accepted" | "locked">("all");
  const [showAdjustments, setShowAdjustments] = useState<boolean>(false);

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

  return (
    <div className="admin-dark-dock w-full p-4 sm:p-6 lg:p-7 flex flex-col gap-6 animate-fade-in">
      {/* 1. TOP TABS & VIEW SWITCHER STRIP (Finnova Dark Header) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#222744] pb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-extrabold text-white tracking-tight">Unpaid Invoices</span>
          <span className="text-xs text-gray-400 font-semibold">({allOrders.length} orders total)</span>
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
            All Invoices
          </button>
          <button
            type="button"
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              darkTabFilter === "draft" ? "bg-[#4f46e5] text-white shadow-sm" : "text-gray-400 hover:text-white"
            }`}
            onClick={() => setDarkTabFilter("draft")}
          >
            <span>Draft</span>
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
            <span>Unpaid</span>
            <span className="w-4 h-4 rounded-full bg-indigo-400 text-black text-[10px] font-black flex items-center justify-center">
              $
            </span>
          </button>
          <button
            type="button"
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
              darkTabFilter === "accepted" ? "bg-[#4f46e5] text-white shadow-sm" : "text-gray-400 hover:text-white"
            }`}
            onClick={() => setDarkTabFilter("accepted")}
          >
            Accepted
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
                        <span className="text-[10px] text-gray-400 font-mono">
                          SL: {item.quantity} × {formatVnd(item.unitPriceSnapshot)}
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Add Item Card Box */}
                  <div
                    className="border-2 border-dashed border-[#2f375e] hover:border-indigo-500/60 bg-[#1a1f38] hover:bg-[#202644] p-3.5 rounded-2xl transition flex flex-col items-center justify-center gap-1.5 cursor-pointer min-h-[95px]"
                    onClick={() => setShowAdjustments(true)}
                  >
                    <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white">
                      <Plus size={15} />
                    </div>
                    <span className="text-xs font-bold text-gray-300">Add item</span>
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
              <button
                type="button"
                className="w-9 h-9 rounded-xl bg-[#202644] hover:bg-[#293156] border border-[#2e375e] flex items-center justify-center text-gray-300 hover:text-white transition cursor-pointer"
                title="Sao chép link"
                onClick={() => navigator.clipboard?.writeText(window.location.href)}
              >
                <LinkIcon size={15} />
              </button>

              <button
                type="button"
                className="w-9 h-9 rounded-xl bg-[#202644] hover:bg-[#293156] border border-[#2e375e] flex items-center justify-center text-gray-300 hover:text-white transition cursor-pointer"
                title="Lịch sử giao dịch"
              >
                <CalendarIcon size={15} />
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
    </div>
  );
}
