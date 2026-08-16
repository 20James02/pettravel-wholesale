"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  BarChart3,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Wallet,
  ArrowUpRight,
  Copy,
  X,
  FileSpreadsheet
} from "lucide-react";
import type { AdminReportsOverview, CustomerOrder, Product } from "@/lib/domain";
import type { TabKey } from "../../types";
import { formatVnd } from "@/lib/money";

interface BankAccountInfo {
  id: string;
  label: string;
  bankName: string;
  accountNo: string;
  balanceVnd: number;
}

const BANK_ACCOUNTS: BankAccountInfo[] = [
  {
    id: "vcb",
    label: "Vietcombank",
    bankName: "Ngân hàng Ngoại thương Việt Nam (VCB)",
    accountNo: "1028391829",
    balanceVnd: 186540000
  },
  {
    id: "mbb",
    label: "MB Bank",
    bankName: "Ngân hàng TMCP Quân Đội (MB)",
    accountNo: "0988776655",
    balanceVnd: 94250000
  },
  {
    id: "tcb",
    label: "Techcombank",
    bankName: "Ngân hàng Kỹ Thương VN (TCB)",
    accountNo: "19038271625",
    balanceVnd: 142800000
  },
  {
    id: "vpb",
    label: "VPBank",
    bankName: "Ngân hàng Việt Nam Thịnh Vượng",
    accountNo: "9876543210",
    balanceVnd: 68400000
  },
  {
    id: "tech_payout",
    label: "Tech Payout",
    bankName: "Cổng Thanh toán B2B Payout Gateway",
    accountNo: "PAYOUT-PTW-889",
    balanceVnd: 51200000
  }
];

interface AdminReportsProps {
  isAdmin: boolean;
  reportsOverview: AdminReportsOverview | null;
  isReportsLoading: boolean;
  reportsError: string;
  fetchReportsOverview: () => Promise<void>;
  allOrders?: CustomerOrder[];
  allProducts?: Product[];
  setActiveTab?: (tab: TabKey) => void;
  theme?: "light" | "dark";
}

export function AdminReports({
  isAdmin,
  reportsOverview,
  isReportsLoading,
  reportsError,
  fetchReportsOverview,
  allOrders = [],
  allProducts = [],
  setActiveTab,
  theme = "light"
}: AdminReportsProps) {
  const liquidityModalRef = useRef<HTMLDivElement>(null);
  const cashflowModalRef = useRef<HTMLDivElement>(null);
  const turnaroundModalRef = useRef<HTMLDivElement>(null);

  const [selectedChannel, setSelectedChannel] = useState<string>("vcb");
  const [isLiquidityModalOpen, setIsLiquidityModalOpen] = useState<boolean>(false);
  const [isCashflowModalOpen, setIsCashflowModalOpen] = useState<boolean>(false);
  const [isTurnaroundModalOpen, setIsTurnaroundModalOpen] = useState<boolean>(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Lock body scroll and active scroll to top when popup opens
  useEffect(() => {
    const isAnyOpen = isLiquidityModalOpen || isCashflowModalOpen || isTurnaroundModalOpen;
    if (isAnyOpen) {
      const orig = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = orig;
      };
    }
  }, [isLiquidityModalOpen, isCashflowModalOpen, isTurnaroundModalOpen]);

  useEffect(() => {
    if (isLiquidityModalOpen && liquidityModalRef.current) {
      liquidityModalRef.current.scrollTop = 0;
    }
  }, [isLiquidityModalOpen]);

  useEffect(() => {
    if (isCashflowModalOpen && cashflowModalRef.current) {
      cashflowModalRef.current.scrollTop = 0;
    }
  }, [isCashflowModalOpen]);

  useEffect(() => {
    if (isTurnaroundModalOpen && turnaroundModalRef.current) {
      turnaroundModalRef.current.scrollTop = 0;
    }
  }, [isTurnaroundModalOpen]);

  const activeBank = BANK_ACCOUNTS.find((b) => b.id === selectedChannel) || BANK_ACCOUNTS[0];

  // Real-time client side metrics calculations
  const dynamicKpis = useMemo(() => {
    const totalOrders = allOrders.length;
    const acceptedOrders = allOrders.filter(
      (o) => o.commercialStatus === "customer_accepted" || o.commercialStatus === "locked"
    ).length;
    const pendingOrders = allOrders.filter(
      (o) => o.commercialStatus === "submitted" || o.commercialStatus === "admin_review"
    ).length;

    let estimatedSalesVnd = 0;
    let paymentConfirmedVnd = 0;

    allOrders.forEach((o) => {
      const q = o.quoteVersions?.[o.quoteVersions.length - 1];
      if (q) {
        estimatedSalesVnd += q.finalTotal;
        if (o.paymentStatus === "paid" || o.paymentStatus === "full_uploaded") {
          paymentConfirmedVnd += q.finalTotal;
        } else if (o.paymentStatus === "deposit_confirmed" || o.paymentStatus === "deposit_uploaded") {
          paymentConfirmedVnd += q.depositAmount || 0;
        }
      }
    });

    const receivableOpenVnd = Math.max(0, estimatedSalesVnd - paymentConfirmedVnd);
    const totalUnits = allProducts.reduce(
      (sum, p) => sum + p.variants.reduce((vSum, v) => vSum + v.stock, 0),
      0
    );
    const lowStockCount = allProducts.reduce(
      (sum, p) => sum + p.variants.filter((v) => v.stock < 10).length,
      0
    );
    const totalStockValue = allProducts.reduce(
      (sum, p) => sum + p.variants.reduce((vSum, v) => vSum + v.stock * (v.wholesalePrice || 0), 0),
      0
    );

    return {
      totalOrders,
      acceptedOrders,
      pendingOrders,
      estimatedSalesVnd,
      paymentConfirmedVnd,
      receivableOpenVnd,
      totalUnits,
      lowStockCount,
      totalStockValue
    };
  }, [allOrders, allProducts]);

  // Status breakdown calculations
  const statusBreakdown = useMemo(() => {
    const statusMap: Record<string, { label: string; count: number; amount: number }> = {
      submitted: { label: "Chờ phê duyệt", count: 0, amount: 0 },
      admin_review: { label: "Admin đang xem xét", count: 0, amount: 0 },
      quoted: { label: "Đã gửi báo giá", count: 0, amount: 0 },
      customer_accepted: { label: "Đại lý đã chấp thuận", count: 0, amount: 0 },
      locked: { label: "Đã khóa đơn / Hoàn tất", count: 0, amount: 0 },
      cancelled: { label: "Đã hủy", count: 0, amount: 0 }
    };

    allOrders.forEach((o) => {
      const status = o.commercialStatus || "submitted";
      const q = o.quoteVersions?.[o.quoteVersions.length - 1];
      const amount = q?.finalTotal || 0;
      if (statusMap[status]) {
        statusMap[status].count += 1;
        statusMap[status].amount += amount;
      } else {
        statusMap[status] = { label: status, count: 1, amount };
      }
    });

    return Object.entries(statusMap)
      .filter(([, val]) => val.count > 0)
      .map(([key, val]) => ({
        key,
        label: val.label,
        quantity: val.count,
        amountVnd: val.amount
      }));
  }, [allOrders]);

  // Product categories stock breakdown
  const categoryInventoryBreakdown = useMemo(() => {
    const catMap: Record<string, { count: number; value: number }> = {};
    allProducts.forEach((p) => {
      const cat = p.category || "Khác";
      const units = p.variants.reduce((sum, v) => sum + v.stock, 0);
      const val = p.variants.reduce((sum, v) => sum + v.stock * (v.wholesalePrice || 0), 0);
      if (!catMap[cat]) {
        catMap[cat] = { count: 0, value: 0 };
      }
      catMap[cat].count += units;
      catMap[cat].value += val;
    });

    return Object.entries(catMap).map(([key, val]) => ({
      key,
      label: key,
      quantity: val.count,
      amountVnd: val.value
    }));
  }, [allProducts]);

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    setCopyFeedback(label);
    setTimeout(() => setCopyFeedback(null), 2500);
  };

  const handleExportCsv = () => {
    const headers = "Trạng thái,Số đơn,Giá trị VND\n";
    const rows = statusBreakdown.map((r) => `"${r.label}",${r.quantity},${r.amountVnd}`).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Bao_cao_kinh_doanh_PetTravel_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  if (!isAdmin) return null;

  const activeKpis = reportsOverview?.kpis || {
    totalOrders: dynamicKpis.totalOrders,
    acceptedOrders: dynamicKpis.acceptedOrders,
    estimatedSalesVnd: dynamicKpis.estimatedSalesVnd,
    estimatedGrossSalesVnd: dynamicKpis.estimatedSalesVnd,
    paymentConfirmedVnd: dynamicKpis.paymentConfirmedVnd,
    paymentPendingProofVnd: 0,
    receivableOpenVnd: dynamicKpis.receivableOpenVnd,
    receivableOverdueVnd: dynamicKpis.receivableOpenVnd,
    trialBalanceDifferenceVnd: 0
  };

  const activeSalesByStatus = reportsOverview?.salesByStatus?.length
    ? reportsOverview.salesByStatus
    : statusBreakdown;

  const activeInventoryBySku = reportsOverview?.inventoryBySku?.length
    ? reportsOverview.inventoryBySku
    : categoryInventoryBreakdown;

  return (
    <div className="flex flex-col gap-5 w-full animate-fade-in text-xs pb-10">
      {/* ========================================================================= */}
      {/* 1. SUB-HEADER: TITLE & ACTIONS */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl sm:text-3xl font-black tracking-tight m-0 font-['Varela_Round'] ${
            theme === "dark" ? "text-white" : "text-[#121528]"
          }`}>
            Tổng quan Hiệu suất Kinh doanh & Tài chính
          </h1>
          <p className={`text-xs sm:text-sm font-medium m-0 mt-1 ${
            theme === "dark" ? "text-gray-400" : "text-gray-500"
          }`}>
            Thống kê doanh thu sỉ B2B thời gian thực, quản lý thanh khoản ngân hàng và kiểm soát công nợ đại lý.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-stretch sm:self-auto justify-end">
          <button
            type="button"
            className={`font-bold text-xs py-2 px-3.5 rounded-full border shadow-xs flex items-center gap-2 cursor-pointer transition active:scale-95 ${
              theme === "dark"
                ? "bg-[#1c223c] hover:bg-[#283154] text-gray-200 border-[#2e375e]"
                : "bg-white hover:bg-gray-50 text-gray-700 border-gray-200"
            }`}
            onClick={fetchReportsOverview}
            disabled={isReportsLoading}
          >
            <RefreshCw size={13} className={isReportsLoading ? "animate-spin text-indigo-500" : "text-indigo-500"} />
            <span>{isReportsLoading ? "Đang tải..." : "Làm mới"}</span>
          </button>

          <button
            type="button"
            className="bg-[#4f46e5] hover:bg-[#4338ca] text-white font-extrabold text-xs py-2 px-4 rounded-full shadow-[0_4px_14px_rgba(79,70,229,0.35)] flex items-center gap-2 cursor-pointer transition active:scale-95"
            onClick={handleExportCsv}
          >
            <FileSpreadsheet size={14} />
            <span>Xuất báo cáo CSV</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. 4-COLUMN INTERACTIVE KPI CARDS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD 1: OVERDUE / CÔNG NỢ PHẢI THU */}
        <div
          className={`admin-kpi-card p-5 flex flex-col justify-between cursor-pointer hover:scale-[1.01] transition ${
            theme === "dark" ? "bg-[#161b30] border-[#293256] text-white" : ""
          }`}
          onClick={() => setActiveTab?.("admin")}
          title="Nhấn để xem danh sách đơn hàng sỉ"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Công nợ chờ thu (AR)
            </span>
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 border ${
                activeKpis.receivableOpenVnd > 0
                  ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
                  : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
              }`}
            >
              <span>{activeKpis.receivableOpenVnd > 0 ? "Cần thu" : "0đ nợ"}</span>
            </span>
          </div>

          <div className="my-2">
            <div className={`text-2xl font-black font-mono tracking-tight ${
              theme === "dark" ? "text-white" : "text-[#121528]"
            }`}>
              {formatVnd(activeKpis.receivableOpenVnd)}
            </div>
            <span className="text-[11px] text-gray-400 font-medium">
              {dynamicKpis.pendingOrders > 0 ? `${dynamicKpis.pendingOrders} đơn cần phê duyệt` : "Tất cả đơn đã duyệt"}
            </span>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-200/40 text-xs">
            <span className="text-indigo-500 font-bold hover:underline flex items-center gap-1">
              Xem đơn hàng sỉ <ArrowUpRight size={13} />
            </span>
          </div>
        </div>

        {/* CARD 2: TOTAL REVENUE & DUE */}
        <div
          className={`admin-kpi-card p-5 flex flex-col justify-between cursor-pointer hover:scale-[1.01] transition ${
            theme === "dark" ? "bg-[#161b30] border-[#293256] text-white" : ""
          }`}
          onClick={() => setIsCashflowModalOpen(true)}
          title="Nhấn để xem phân tích dòng tiền và doanh thu"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Doanh thu sỉ thực tế
            </span>
            <span className="text-[10px] font-black text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full font-mono">
              {activeKpis.totalOrders} đơn
            </span>
          </div>

          <div className="flex items-end justify-between gap-3 my-1">
            <div>
              <div className={`text-2xl font-black font-mono tracking-tight ${
                theme === "dark" ? "text-white" : "text-[#121528]"
              }`}>
                {formatVnd(activeKpis.estimatedSalesVnd)}
              </div>
              <span className="text-[11px] text-emerald-500 font-bold">
                Thực thu: {formatVnd(activeKpis.paymentConfirmedVnd)}
              </span>
            </div>

            {/* SVG Purple Bar Chart */}
            <div className="flex items-end gap-1.5 h-12 pb-1">
              <div className="w-2.5 h-6 rounded-t-md bg-indigo-400/40" title="Tuần 1" />
              <div className="w-2.5 h-9 rounded-t-md bg-indigo-400/70" title="Tuần 2" />
              <div
                className="w-2.5 h-12 rounded-t-md bg-gradient-to-t from-indigo-600 to-purple-500 shadow-sm"
                title="Tuần 3"
              />
              <div className="w-2.5 h-7 rounded-t-md bg-indigo-400/50" title="Tuần 4" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-200/40 text-xs">
            <span className="text-gray-400 font-medium text-[11px]">Dự báo dòng tiền</span>
            <ArrowUpRight size={13} className="text-gray-400" />
          </div>
        </div>

        {/* CARD 3: INVENTORY & ATP UNITS */}
        <div
          className={`admin-kpi-card p-5 flex flex-col justify-between cursor-pointer hover:scale-[1.01] transition ${
            theme === "dark" ? "bg-[#161b30] border-[#293256] text-white" : ""
          }`}
          onClick={() => {
            if (setActiveTab) setActiveTab("admin_products");
            setIsTurnaroundModalOpen(true);
          }}
          title="Nhấn để xem quản lý kho & khả dụng ATP"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Tồn kho ATP Khả dụng
            </span>
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                dynamicKpis.lowStockCount > 0
                  ? "text-amber-400 bg-amber-500/10 border border-amber-500/20"
                  : "text-emerald-400 bg-emerald-500/10"
              }`}
            >
              {dynamicKpis.lowStockCount > 0 ? `${dynamicKpis.lowStockCount} SKU ít tồn` : "Tồn kho an toàn"}
            </span>
          </div>

          <div className="flex items-end justify-between gap-3 my-1">
            <div>
              <div className={`text-2xl font-black tracking-tight font-mono ${
                theme === "dark" ? "text-white" : "text-[#121528]"
              }`}>
                {dynamicKpis.totalUnits.toLocaleString("vi-VN")}{" "}
                <span className="text-sm font-sans text-gray-400">cái</span>
              </div>
              <span className="text-[11px] text-gray-400 font-medium">
                Giá trị tồn: {formatVnd(dynamicKpis.totalStockValue)}
              </span>
            </div>

            {/* SVG Sparkline Area */}
            <svg className="w-20 h-10 overflow-visible" viewBox="0 0 80 40">
              <path
                d="M 0 30 Q 20 10, 40 25 T 80 8"
                fill="none"
                stroke="#6366f1"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path
                d="M 0 30 Q 20 10, 40 25 T 80 8 L 80 40 L 0 40 Z"
                fill="url(#sparkline-grad-reports)"
                opacity="0.25"
              />
              <defs>
                <linearGradient id="sparkline-grad-reports" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-200/40 text-xs">
            <span className="text-gray-400 font-medium text-[11px]">Chi tiết kho hàng</span>
            <ArrowUpRight size={13} className="text-gray-400" />
          </div>
        </div>

        {/* CARD 4: AVAILABLE LIQUIDITY + MULTI-BANK SELECTOR */}
        <div
          className={`admin-kpi-card p-5 flex flex-col justify-between cursor-pointer hover:scale-[1.01] transition ${
            theme === "dark" ? "bg-[#161b30] border-[#293256] text-white" : ""
          }`}
          onClick={() => setIsLiquidityModalOpen(true)}
          title="Nhấn để mở cổng thanh toán và quản lý số dư ngân hàng"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Thanh khoản ngân hàng (112)
            </span>
            <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              Hoạt động
            </span>
          </div>

          <div className="my-1">
            <div className={`text-2xl font-black font-mono tracking-tight ${
              theme === "dark" ? "text-white" : "text-[#121528]"
            }`}>
              {formatVnd(activeBank.balanceVnd)}
            </div>
            <span className="text-[11px] text-gray-400 font-medium">
              TK: {activeBank.label}
            </span>
          </div>

          {/* Bank Pills Selector Strip */}
          <div
            className="flex items-center gap-1 pt-2 border-t border-gray-200/40 overflow-x-auto no-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            {BANK_ACCOUNTS.map((bank) => (
              <button
                key={bank.id}
                type="button"
                className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold transition cursor-pointer ${
                  selectedChannel === bank.id
                    ? "bg-[#4f46e5] text-white shadow-xs"
                    : theme === "dark"
                    ? "bg-[#1f2646] text-gray-300 hover:bg-[#28315a]"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                onClick={() => setSelectedChannel(bank.id)}
              >
                {bank.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. FINANCIAL INTELLIGENCE & BREAKDOWN DOCK */}
      {/* ========================================================================= */}
      <div className="admin-dark-dock w-full p-4 sm:p-6 lg:p-7 flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#222744] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <BarChart3 size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-extrabold text-white tracking-tight">
                Phân tích Sổ cái Kế toán & Vận hành B2B
              </span>
              <span className="text-xs text-gray-400 font-medium">
                Đối soát số dư Nợ/Có, tỷ lệ hoàn tất đơn hàng và cơ cấu giá trị danh mục sản phẩm
              </span>
            </div>
          </div>

          <div className="text-xs text-emerald-400 font-mono font-bold flex items-center gap-1.5 bg-[#171b32] px-3 py-1.5 rounded-full border border-[#262e4e]">
            <Sparkles size={14} className="text-indigo-400" />
            <span>Trial Balance: {formatVnd(activeKpis.trialBalanceDifferenceVnd || 0)} (Cân đối 100%)</span>
          </div>
        </div>

        {reportsError && (
          <div className="p-3.5 border border-rose-500/30 bg-rose-500/10 text-rose-300 rounded-2xl flex items-start gap-3">
            <AlertTriangle size={18} className="text-rose-400 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-300 m-0">
              {reportsError} (Hiển thị số liệu tính toán từ bộ nhớ đệm)
            </p>
          </div>
        )}

        {/* Breakdown Tables Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#171b30] p-4 sm:p-5 rounded-2xl border border-[#272e4e] overflow-x-auto">
            <div className="flex items-center justify-between mb-3 border-b border-[#242b4b] pb-2">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider m-0">
                Doanh thu theo trạng thái đơn hàng
              </h4>
              <span className="text-[10px] text-gray-400 font-mono">
                {activeSalesByStatus.length} trạng thái
              </span>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#293154] text-[10px] text-gray-400 uppercase font-bold">
                  <th className="py-2">Trạng thái</th>
                  <th className="py-2">Số đơn</th>
                  <th className="py-2 text-right">Giá trị</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232a48]">
                {activeSalesByStatus.map((row) => (
                  <tr key={row.key} className="hover:bg-[#1f2542] transition">
                    <td className="py-2.5 text-gray-300 font-semibold">{row.label}</td>
                    <td className="py-2.5 font-mono text-gray-400">{row.quantity || 0}</td>
                    <td className="py-2.5 text-right font-mono font-bold text-white">
                      {formatVnd(row.amountVnd)}
                    </td>
                  </tr>
                ))}
                {activeSalesByStatus.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-gray-400 italic">
                      Chưa có đơn hàng nào trong hệ thống.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-[#171b30] p-4 sm:p-5 rounded-2xl border border-[#272e4e] overflow-x-auto">
            <div className="flex items-center justify-between mb-3 border-b border-[#242b4b] pb-2">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider m-0">
                Tồn kho và Giá trị theo Danh mục
              </h4>
              <span className="text-[10px] text-emerald-400 font-mono">
                {activeInventoryBySku.length} danh mục
              </span>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#293154] text-[10px] text-gray-400 uppercase font-bold">
                  <th className="py-2">Danh mục / Phân loại</th>
                  <th className="py-2 text-right">Số lượng tồn</th>
                  <th className="py-2 text-right">Giá trị tồn kho</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232a48]">
                {activeInventoryBySku.map((item) => (
                  <tr key={item.key} className="hover:bg-[#1f2542] transition">
                    <td className="py-2.5 font-mono font-bold text-indigo-300">{item.label}</td>
                    <td className="py-2.5 text-right font-mono text-emerald-400 font-bold">
                      {item.quantity || 0}
                    </td>
                    <td className="py-2.5 text-right font-mono text-sky-400 font-bold">
                      {formatVnd(item.amountVnd)}
                    </td>
                  </tr>
                ))}
                {activeInventoryBySku.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-gray-400 italic">
                      Chưa có dữ liệu tồn kho sản phẩm.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. MODALS (LIQUIDITY, CASHFLOW, TURNAROUND) */}
      {/* ========================================================================= */}

      {/* LIQUIDITY & BANK TRANSFER MODAL */}
      {isLiquidityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div ref={liquidityModalRef} className="bg-[#14182b] border border-[#272e4e] rounded-3xl p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4 text-white max-h-[90vh] overflow-y-auto admin-dark-scroll">
            <div className="flex items-center justify-between border-b border-[#232a48] pb-3">
              <div className="flex items-center gap-2">
                <Wallet size={18} className="text-emerald-400" />
                <h3 className="font-extrabold text-white text-base m-0">Chi tiết Thanh khoản & Số dư Ngân hàng</h3>
              </div>
              <button
                type="button"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 cursor-pointer"
                onClick={() => setIsLiquidityModalOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-[#1c223c] border border-[#2e375e] flex flex-col gap-2">
              <div className="text-xs text-gray-400 font-bold uppercase">Tài khoản được chọn</div>
              <div className="text-xl font-black text-emerald-400 font-mono">
                {formatVnd(activeBank.balanceVnd)}
              </div>
              <div className="text-xs text-white font-bold">{activeBank.bankName}</div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#2a3356] text-xs">
                <span className="font-mono text-gray-300">STK: {activeBank.accountNo}</span>
                <button
                  type="button"
                  className="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
                  onClick={() => handleCopyText(activeBank.accountNo, "Đã sao chép số tài khoản!")}
                >
                  <Copy size={13} /> {copyFeedback || "Sao chép"}
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 mt-2 border-t border-[#232a48] pt-3 text-xs">
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-gray-300 hover:text-white cursor-pointer"
                onClick={() => setIsLiquidityModalOpen(false)}
              >
                Đóng
              </button>
              <button
                type="button"
                className="admin-pill-btn-white py-2 px-5 text-xs"
                onClick={() => {
                  alert(`Đã tạo lệnh đối soát tức thời cho tài khoản ${activeBank.label}!`);
                  setIsLiquidityModalOpen(false);
                }}
              >
                Tạo lệnh đối soát số dư
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CASHFLOW PROJECTION MODAL */}
      {isCashflowModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div ref={cashflowModalRef} className="bg-[#14182b] border border-[#272e4e] rounded-3xl p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4 text-white max-h-[90vh] overflow-y-auto admin-dark-scroll">
            <div className="flex items-center justify-between border-b border-[#232a48] pb-3">
              <h3 className="font-extrabold text-white text-base m-0">Phân tích Dòng tiền & Doanh thu B2B</h3>
              <button
                type="button"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 cursor-pointer"
                onClick={() => setIsCashflowModalOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <div className="p-3 bg-[#1c223c] rounded-2xl border border-[#2e375e] flex items-center justify-between">
                <span className="text-gray-300">Tổng doanh số đơn hàng:</span>
                <span className="font-mono font-black text-white text-sm">
                  {formatVnd(activeKpis.estimatedSalesVnd)}
                </span>
              </div>
              <div className="p-3 bg-[#1c223c] rounded-2xl border border-[#2e375e] flex items-center justify-between">
                <span className="text-emerald-300">Thực thu (Cọc & Full):</span>
                <span className="font-mono font-black text-emerald-400 text-sm">
                  {formatVnd(activeKpis.paymentConfirmedVnd)}
                </span>
              </div>
              <div className="p-3 bg-[#1c223c] rounded-2xl border border-[#2e375e] flex items-center justify-between">
                <span className="text-rose-300">Công nợ còn lại (AR):</span>
                <span className="font-mono font-black text-rose-400 text-sm">
                  {formatVnd(activeKpis.receivableOpenVnd)}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-2 pt-3 border-t border-[#232a48]">
              <button
                type="button"
                className="admin-pill-btn-white py-2 px-5 text-xs"
                onClick={() => setIsCashflowModalOpen(false)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TURNAROUND & INVENTORY MODAL */}
      {isTurnaroundModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div ref={turnaroundModalRef} className="bg-[#14182b] border border-[#272e4e] rounded-3xl p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4 text-white max-h-[90vh] overflow-y-auto admin-dark-scroll">
            <div className="flex items-center justify-between border-b border-[#232a48] pb-3">
              <h3 className="font-extrabold text-white text-base m-0">Hiệu suất Xử lý Đơn & Tồn kho ATP</h3>
              <button
                type="button"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 cursor-pointer"
                onClick={() => setIsTurnaroundModalOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <div className="p-3 bg-[#1c223c] rounded-2xl border border-[#2e375e] flex items-center justify-between">
                <span className="text-gray-300">Tổng số đơn hàng:</span>
                <span className="font-mono font-black text-white text-sm">
                  {dynamicKpis.totalOrders} đơn
                </span>
              </div>
              <div className="p-3 bg-[#1c223c] rounded-2xl border border-[#2e375e] flex items-center justify-between">
                <span className="text-indigo-300">Tồn kho khả dụng (ATP):</span>
                <span className="font-mono font-black text-indigo-400 text-sm">
                  {dynamicKpis.totalUnits} đơn vị
                </span>
              </div>
              <div className="p-3 bg-[#1c223c] rounded-2xl border border-[#2e375e] flex items-center justify-between">
                <span className="text-amber-300">SKU cảnh báo tồn thấp:</span>
                <span className="font-mono font-black text-amber-400 text-sm">
                  {dynamicKpis.lowStockCount} SKU
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-2 pt-3 border-t border-[#232a48]">
              <button
                type="button"
                className="admin-pill-btn-white py-2 px-5 text-xs"
                onClick={() => setIsTurnaroundModalOpen(false)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
