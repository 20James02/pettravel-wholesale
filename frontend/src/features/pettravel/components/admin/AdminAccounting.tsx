"use client";

import { useState, useMemo } from "react";
import {
  RefreshCw,
  ShieldCheck,
  Scale,
  SlidersHorizontal
} from "lucide-react";
import type { CustomerOrder, AccountingOverview, JournalEntryDetail } from "@/lib/domain";
import { formatVnd } from "@/lib/money";
import { promotionsPolicySchema } from "@/lib/validation";

export interface PromotionTier {
  id: string;
  minOrderValue: number;
  discountPercent: number;
  isFreeShipping: boolean;
  giftName?: string;
  description?: string;
}

export interface PromotionsPolicy {
  freeShippingThreshold: number;
  defaultDepositRate: number;
  maxOperatorDiscountRate: number;
  requireManagerApprovalAbove: number;
  giftThreshold?: number;
  giftName?: string;
  minWholesaleOrderValue?: number;
  tiers?: PromotionTier[];
}

interface AdminAccountingProps {
  activeTab: string;
  isAdmin: boolean;
  workingOrder: CustomerOrder;
  accountingOverview: AccountingOverview | null;
  accountingJournalEntries: JournalEntryDetail[];
  isAccountingLoading: boolean;
  isAccountingJournalLoading: boolean;
  accountingError: string;
  promotionsPolicy: PromotionsPolicy;
  setPromotionsPolicy: (policy: PromotionsPolicy) => void;
  fetchAccountingOverview: () => Promise<void>;
  fetchAccountingJournalEntries: () => Promise<void>;
  fetchPromotions: () => Promise<void>;
  rolePermissions: Record<string, string[]>;
  adminPolicy: {
    freeShippingThreshold: number;
    defaultDepositRate: number;
    maxOperatorDiscountRate: number;
    requireManagerApprovalAbove: number;
  };
}

export function AdminAccounting({
  activeTab,
  isAdmin,
  accountingOverview,
  accountingJournalEntries,
  isAccountingLoading,
  isAccountingJournalLoading,
  promotionsPolicy,
  setPromotionsPolicy,
  fetchAccountingOverview,
  fetchAccountingJournalEntries,
  fetchPromotions
}: AdminAccountingProps) {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [showPromotionsForm, setShowPromotionsForm] = useState(false);

  // Selected Journal Entry for Right Inspector
  const activeJournalEntry = useMemo(() => {
    if (selectedEntryId) {
      const found = accountingJournalEntries.find((e) => e.id === selectedEntryId);
      if (found) return found;
    }
    return accountingJournalEntries.length > 0 ? accountingJournalEntries[0] : null;
  }, [selectedEntryId, accountingJournalEntries]);

  const handleSavePromotions = async (e: React.FormEvent) => {
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
      setShowPromotionsForm(false);
    } catch {
      alert("Lỗi kết nối.");
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="flex flex-col gap-6 w-full animate-fade-in text-xs">
      {/* 1. GENERAL LEDGER DOCK (Finnova Midnight Indigo Dual-Pane) */}
      {activeTab === "admin_accounting" && (
        <div className="admin-dark-dock w-full p-4 sm:p-6 lg:p-7 flex flex-col gap-6">
          {/* Header Strip with Refresh & Metrics */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#222744] pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                <Scale size={20} />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-extrabold text-white tracking-tight">
                  Double-Entry General Ledger
                </span>
                <span className="text-xs text-gray-400 font-medium">
                  Bút toán cân đối Nợ/Có (Debit ≡ Credit) & Nhật ký đối soát minh bạch
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 self-stretch sm:self-auto justify-end">
              <button
                type="button"
                className="bg-[#191e36] hover:bg-[#222846] text-gray-200 border border-[#2b3356] font-bold text-xs py-2 px-4 rounded-full flex items-center gap-2 cursor-pointer transition"
                onClick={() => {
                  fetchAccountingOverview();
                  fetchAccountingJournalEntries();
                }}
                disabled={isAccountingLoading || isAccountingJournalLoading}
              >
                <RefreshCw size={14} className={isAccountingLoading || isAccountingJournalLoading ? "animate-spin" : ""} />
                <span>{isAccountingLoading || isAccountingJournalLoading ? "Đang tải..." : "Refresh Data"}</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#191e36] p-3.5 rounded-2xl border border-[#283152] flex flex-col justify-between">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Kỳ kế toán</span>
              <div className="text-lg font-black text-white font-mono mt-1">
                {accountingOverview ? accountingOverview.periodsTotal : "—"}
              </div>
              <span className="text-[10px] text-gray-400">
                Mở: {accountingOverview?.openPeriods ?? 0} · Đóng: {accountingOverview?.closedPeriods ?? 0}
              </span>
            </div>

            <div className="bg-[#191e36] p-3.5 rounded-2xl border border-[#283152] flex flex-col justify-between">
              <span className="text-[10px] font-bold text-amber-400 uppercase">Bút toán nháp</span>
              <div className="text-lg font-black text-amber-400 font-mono mt-1">
                {accountingOverview ? accountingOverview.draftEntries : "0"}
              </div>
              <span className="text-[10px] text-gray-400">Chưa ghi sổ</span>
            </div>

            <div className="bg-[#191e36] p-3.5 rounded-2xl border border-[#283152] flex flex-col justify-between">
              <span className="text-[10px] font-bold text-emerald-400 uppercase">Đã ghi sổ</span>
              <div className="text-lg font-black text-emerald-400 font-mono mt-1">
                {accountingOverview ? accountingOverview.postedEntries : "0"}
              </div>
              <span className="text-[10px] text-emerald-500/80 font-bold">Khóa sổ minh bạch</span>
            </div>

            <div className="bg-[#191e36] p-3.5 rounded-2xl border border-[#283152] flex flex-col justify-between">
              <span className="text-[10px] font-bold text-rose-400 uppercase">Bút toán hủy</span>
              <div className="text-lg font-black text-rose-400 font-mono mt-1">
                {accountingOverview ? accountingOverview.voidEntries : "0"}
              </div>
              <span className="text-[10px] text-gray-400">Đã điều chỉnh</span>
            </div>
          </div>

          {/* DUAL-PANE JOURNAL INSPECTOR: Left List (35%) & Right Detail Lines (65%) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[500px]">
            {/* Left List of Journal Entries */}
            <div className="lg:col-span-5 flex flex-col gap-2.5 max-h-[520px] overflow-y-auto pr-1 admin-dark-scroll">
              {accountingJournalEntries.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-400 border border-dashed border-[#293050] rounded-2xl bg-[#161a30]">
                  Chưa có bút toán nào trong hệ thống.
                </div>
              ) : (
                accountingJournalEntries.map((entry) => {
                  const isSelected = entry.id === activeJournalEntry?.id;
                  return (
                    <div
                      key={entry.id}
                      className={`p-3.5 rounded-2xl transition-all duration-200 cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? "bg-[#4f46e5] text-white shadow-[0_10px_28px_rgba(79,70,229,0.45)] scale-[1.01]"
                          : "bg-[#181d33] hover:bg-[#1f2542] text-gray-200 border border-[#272e4e]"
                      }`}
                      onClick={() => setSelectedEntryId(entry.id)}
                    >
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-extrabold text-xs tracking-tight truncate">
                            {entry.entryNo}
                          </span>
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                              isSelected
                                ? "bg-white/20 text-white"
                                : entry.status === "posted"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                : "bg-amber-500/20 text-amber-300"
                            }`}
                          >
                            {entry.status === "posted" ? "Posted" : "Draft"}
                          </span>
                          {entry.isBalanced && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-400/20 text-indigo-200">
                              Balanced
                            </span>
                          )}
                        </div>
                        <span className={`text-[11px] truncate mt-1 ${isSelected ? "text-indigo-100" : "text-gray-400"}`}>
                          {entry.description}
                        </span>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono font-black text-xs sm:text-sm tracking-tight">
                          {formatVnd(entry.debitTotalVnd)}
                        </div>
                        <span className={`text-[10px] block ${isSelected ? "text-indigo-200" : "text-gray-400"}`}>
                          {entry.lines.length} lines
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Right Detailed Journal Lines Inspector */}
            <div className="lg:col-span-7 flex flex-col justify-between bg-[#171b30] rounded-2xl border border-[#272e4e] p-4 sm:p-6 shadow-inner">
              {activeJournalEntry ? (
                <div className="flex flex-col gap-4">
                  {/* Inspector Header */}
                  <div className="flex items-center justify-between border-b border-[#242a49] pb-3">
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Chi tiết bút toán
                      </span>
                      <h3 className="text-lg font-black text-white font-mono m-0 mt-0.5">
                        {activeJournalEntry.entryNo}
                      </h3>
                      <p className="text-xs text-gray-300 m-0 mt-1">{activeJournalEntry.description}</p>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 block font-semibold">TỔNG GIAO DỊCH</span>
                      <span className="text-base font-black text-emerald-400 font-mono">
                        {formatVnd(activeJournalEntry.debitTotalVnd)}
                      </span>
                    </div>
                  </div>

                  {/* Lines Table */}
                  <div className="overflow-x-auto max-h-[300px] admin-dark-scroll">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#293154] text-gray-400 text-[10px] uppercase font-bold">
                          <th className="py-2 px-2">Tài khoản</th>
                          <th className="py-2 px-2">Đối tượng</th>
                          <th className="py-2 px-2 text-right">Nợ (Debit)</th>
                          <th className="py-2 px-2 text-right">Có (Credit)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#232a48]">
                        {activeJournalEntry.lines.map((line, idx) => (
                          <tr key={line.id || idx} className="hover:bg-[#1f2542] transition">
                            <td className="py-2.5 px-2 font-mono font-bold text-indigo-300">
                              {line.accountCode} - {line.accountName}
                            </td>
                            <td className="py-2.5 px-2 text-gray-300">{line.memo || line.accountName || "Nội bộ"}</td>
                            <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-400">
                              {line.debitAmountVnd > 0 ? formatVnd(line.debitAmountVnd) : "—"}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono font-bold text-sky-400">
                              {line.creditAmountVnd > 0 ? formatVnd(line.creditAmountVnd) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Bar */}
                  <div className="p-3 bg-[#13172b] rounded-xl border border-[#272e4e] flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={16} className="text-emerald-400" />
                      <span className="font-bold text-gray-200">Bảo toàn cân đối Nợ/Có:</span>
                      <span className="font-mono text-emerald-300 font-black">
                        {activeJournalEntry.isBalanced ? "100% CÂN ĐỐI" : "LỆCH NỢ CÓ"}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 font-mono font-bold">
                      <span className="text-emerald-400">Nợ: {formatVnd(activeJournalEntry.debitTotalVnd)}</span>
                      <span className="text-sky-400">Có: {formatVnd(activeJournalEntry.creditTotalVnd)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-gray-400">
                  Chọn bút toán để kiểm tra chi tiết
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. SETTINGS / PRICING TIERS TAB */}
      {(activeTab === "settings" || activeTab === "admin_promotions") && (() => {
        const defaultTiers = promotionsPolicy.tiers && promotionsPolicy.tiers.length > 0 ? promotionsPolicy.tiers : [
          {
            id: "tier_1",
            minOrderValue: 2000000,
            discountPercent: 0,
            isFreeShipping: false,
            description: "Ngưỡng tối thiểu tạo đơn hàng sỉ (Đủ điều kiện xuất kho)"
          },
          {
            id: "tier_2",
            minOrderValue: 5000000,
            discountPercent: 0,
            isFreeShipping: true,
            description: "Miễn phí giao hàng tiêu chuẩn toàn quốc"
          },
          {
            id: "tier_3",
            minOrderValue: 10000000,
            discountPercent: 2,
            isFreeShipping: true,
            description: "Freeship + Chiết khấu 2% trực tiếp trên đơn sỉ"
          },
          {
            id: "tier_4",
            minOrderValue: 20000000,
            discountPercent: 5,
            isFreeShipping: true,
            giftName: "Bát ăn inox chống trượt cao cấp",
            description: "Freeship + Giảm 5% + Tặng Bát ăn inox"
          },
          {
            id: "tier_5",
            minOrderValue: 50000000,
            discountPercent: 8,
            isFreeShipping: true,
            giftName: "Balo phi hành gia thú cưng VIP",
            description: "Freeship + Giảm 8% + Tặng Balo phi hành gia"
          }
        ];

        return (
          <div className="admin-dark-dock w-full p-4 sm:p-6 lg:p-7 flex flex-col gap-6 animate-fade-in text-xs">
            {/* Top Title & Actions */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#222744] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                  <SlidersHorizontal size={20} />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-extrabold text-white tracking-tight">
                    Chính Sách Bảng Giá & Chiết Khấu B2B Đa Tầng
                  </span>
                  <span className="text-xs text-gray-400 font-medium">
                    Thiết lập nhiều ngưỡng ưu đãi: Đơn tối thiểu, Miễn phí vận chuyển, Chiết khấu theo nấc doanh số & Quà tặng
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="admin-pill-btn-white text-xs py-2 px-5 cursor-pointer"
                  onClick={() => setShowPromotionsForm(!showPromotionsForm)}
                >
                  {showPromotionsForm ? "Đóng form" : "⚙️ Cấu hình chung"}
                </button>
              </div>
            </div>

            {/* 4 Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#191e36] p-4 rounded-2xl border border-[#283152]">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Đơn sỉ tối thiểu</span>
                <div className="text-lg font-black text-amber-400 font-mono mt-1">
                  {formatVnd(promotionsPolicy.minWholesaleOrderValue || 2000000)}
                </div>
                <span className="text-[10px] text-gray-400 mt-1 block">Cho phép tạo đơn sỉ</span>
              </div>

              <div className="bg-[#191e36] p-4 rounded-2xl border border-[#283152]">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Miễn phí ship từ</span>
                <div className="text-lg font-black text-white font-mono mt-1">
                  {formatVnd(promotionsPolicy.freeShippingThreshold || 5000000)}
                </div>
                <span className="text-[10px] text-gray-400 mt-1 block">Tự động áp dụng cho đơn sỉ</span>
              </div>

              <div className="bg-[#191e36] p-4 rounded-2xl border border-[#283152]">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Tỷ lệ đặt cọc chuẩn</span>
                <div className="text-lg font-black text-indigo-400 font-mono mt-1">
                  {Math.round(promotionsPolicy.defaultDepositRate * 100)}%
                </div>
                <span className="text-[10px] text-gray-400 mt-1 block">Tối thiểu trước khi xuất kho</span>
              </div>

              <div className="bg-[#191e36] p-4 rounded-2xl border border-[#283152]">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Giới hạn duyệt Operator</span>
                <div className="text-lg font-black text-emerald-400 font-mono mt-1">
                  {Math.round(promotionsPolicy.maxOperatorDiscountRate * 100)}%
                </div>
                <span className="text-[10px] text-gray-400 mt-1 block">
                  Vượt quá {formatVnd(promotionsPolicy.requireManagerApprovalAbove || 500000)} cần Super Admin
                </span>
              </div>
            </div>

            {/* Config Form (if toggled) */}
            {showPromotionsForm && (
              <form onSubmit={handleSavePromotions} className="bg-[#15192e] p-5 rounded-2xl border border-[#293256] flex flex-col gap-4 animate-fade-in">
                <h4 className="font-extrabold text-white text-sm m-0">Cập nhật chính sách chiết khấu & đặt cọc sỉ</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-gray-300">Đơn sỉ tối thiểu (VND)</label>
                    <input
                      type="number"
                      className="w-full mt-1 bg-[#1e2440] border border-[#303960] rounded-xl py-2 px-3 text-white text-xs font-mono"
                      value={promotionsPolicy.minWholesaleOrderValue || 2000000}
                      onChange={(e) =>
                        setPromotionsPolicy({
                          ...promotionsPolicy,
                          minWholesaleOrderValue: Number(e.target.value) || 0
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-300">Ngưỡng Freeship mặc định (VND)</label>
                    <input
                      type="number"
                      className="w-full mt-1 bg-[#1e2440] border border-[#303960] rounded-xl py-2 px-3 text-white text-xs font-mono"
                      value={promotionsPolicy.freeShippingThreshold}
                      onChange={(e) =>
                        setPromotionsPolicy({
                          ...promotionsPolicy,
                          freeShippingThreshold: Number(e.target.value) || 0
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-300">Tỷ lệ đặt cọc mặc định (0 - 1)</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      className="w-full mt-1 bg-[#1e2440] border border-[#303960] rounded-xl py-2 px-3 text-white text-xs font-mono"
                      value={promotionsPolicy.defaultDepositRate}
                      onChange={(e) =>
                        setPromotionsPolicy({
                          ...promotionsPolicy,
                          defaultDepositRate: Number(e.target.value) || 0.3
                        })
                      }
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-2">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl text-gray-300 hover:text-white cursor-pointer"
                    onClick={() => setShowPromotionsForm(false)}
                  >
                    Hủy
                  </button>
                  <button type="submit" className="admin-pill-btn-primary text-xs py-2 px-6">
                    Lưu cấu hình
                  </button>
                </div>
              </form>
            )}

            {/* Multi-Tier Table */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-sm text-white">Bảng Các Bậc Ưu Đãi Theo Giá Trị Đơn Hàng</span>
                  <span className="text-xs text-gray-400 font-semibold">({defaultTiers.length} bậc ưu đãi)</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const newTier = {
                      id: `tier_${Date.now()}`,
                      minOrderValue: 30000000,
                      discountPercent: 6,
                      isFreeShipping: true,
                      giftName: "Bát ăn inox hoặc đồ chơi thú cưng",
                      description: "Freeship + Giảm 6% + Tặng quà"
                    };
                    const updated = [...defaultTiers, newTier];
                    setPromotionsPolicy({ ...promotionsPolicy, tiers: updated });
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition"
                >
                  <span>+ Thêm bậc ưu đãi mới</span>
                </button>
              </div>

              <div className="bg-[#171b30] p-4 rounded-2xl border border-[#272e4e] overflow-x-auto w-full">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#293154] text-[10px] text-gray-400 uppercase font-bold">
                      <th className="py-2.5 px-3">Bậc ưu đãi</th>
                      <th className="py-2.5 px-3">Giá trị đơn từ</th>
                      <th className="py-2.5 px-3 text-center">Freeship</th>
                      <th className="py-2.5 px-3 text-center">Chiết khấu</th>
                      <th className="py-2.5 px-3">Quà tặng đính kèm</th>
                      <th className="py-2.5 px-3">Mô tả hiển thị</th>
                      <th className="py-2.5 px-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232a48]">
                    {defaultTiers.map((t, idx) => (
                      <tr key={t.id} className="hover:bg-[#1d2340]/60 transition">
                        <td className="py-3 px-3 font-bold text-white">
                          <span className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 font-mono inline-flex items-center justify-center mr-2">
                            {idx + 1}
                          </span>
                          Bậc {idx + 1}
                        </td>
                        <td className="py-3 px-3 font-mono font-black text-emerald-400 text-sm">
                          {formatVnd(t.minOrderValue)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {t.isFreeShipping ? (
                            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold text-[10px]">
                              ✓ Miễn phí ship
                            </span>
                          ) : (
                            <span className="text-gray-500 text-[10px]">Tính theo cước</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {t.discountPercent > 0 ? (
                            <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 rounded-full font-black text-xs font-mono">
                              -{t.discountPercent}%
                            </span>
                          ) : (
                            <span className="text-gray-500 text-[10px]">0%</span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-medium text-amber-300">
                          {t.giftName || "—"}
                        </td>
                        <td className="py-3 px-3 text-gray-300 text-[11px]">
                          {t.description || "—"}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              const updated = defaultTiers.filter((item) => item.id !== t.id);
                              setPromotionsPolicy({ ...promotionsPolicy, tiers: updated });
                            }}
                            className="px-2.5 py-1 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold cursor-pointer transition"
                          >
                            Xóa
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
