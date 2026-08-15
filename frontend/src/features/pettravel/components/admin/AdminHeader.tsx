"use client";

import { useState } from "react";
import type { TabKey, ApiUser } from "../../types";
import { formatVnd } from "@/lib/money";
import {
  ArrowLeft,
  SlidersHorizontal,
  Plus,
  Wallet,
  ArrowUpRight,
  Search,
  Bell,
  Settings,
  ChevronDown,
  LogOut,
  X,
  Copy,
  Filter
} from "lucide-react";

interface AdminHeaderProps {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  currentUser: ApiUser | null;
  totalOrdersCount?: number;
  totalRevenue?: number;
  collectedRevenue?: number;
  overdueAmount?: number;
  pendingApprovalsCount?: number;
  totalStockUnits?: number;
  lowStockCount?: number;
  onNewActionClick?: () => void;
  newActionLabel?: string;
  onBackClick?: () => void;
  onLogout?: () => void;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  statusFilter?: string;
  setStatusFilter?: (s: string) => void;
  customerFilter?: string;
  setCustomerFilter?: (c: string) => void;
}

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

export function AdminHeader({
  activeTab,
  setActiveTab,
  currentUser,
  totalOrdersCount = 0,
  totalRevenue = 0,
  collectedRevenue = 0,
  overdueAmount = 0,
  pendingApprovalsCount = 0,
  totalStockUnits = 0,
  lowStockCount = 0,
  onNewActionClick,
  newActionLabel = "+ Create an invoice",
  onBackClick,
  onLogout,
  searchQuery = "",
  setSearchQuery,
  statusFilter = "all",
  setStatusFilter
}: AdminHeaderProps) {
  const [selectedChannel, setSelectedChannel] = useState<string>("vcb");
  const [isFilterModalOpen, setIsFilterModalOpen] = useState<boolean>(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState<boolean>(false);
  const [isLiquidityModalOpen, setIsLiquidityModalOpen] = useState<boolean>(false);
  const [isCashflowModalOpen, setIsCashflowModalOpen] = useState<boolean>(false);
  const [isTurnaroundModalOpen, setIsTurnaroundModalOpen] = useState<boolean>(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Active bank account
  const activeBank = BANK_ACCOUNTS.find((b) => b.id === selectedChannel) || BANK_ACCOUNTS[0];

  // Top Center Floating Pill Tabs matching the user's authoritative layout
  const navTabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: "admin_reports", label: "Overview" },
    { key: "admin", label: "Invoices / Orders", badge: totalOrdersCount },
    { key: "admin_accounting", label: "Accounting & Ledger" },
    { key: "admin_products", label: "Inventory & ATP" },
    { key: "admin_promotions", label: "Pricing & Tiers" },
    { key: "admin_users", label: "Customers & Staff" }
  ];

  // Dynamic headings per tab
  const tabHeadings: Record<string, { title: string; subtitle: string; action: string }> = {
    admin: {
      title: "Invoices & B2B Orders",
      subtitle: "Quản lý đơn sỉ B2B, chốt báo giá, khóa snapshot giá và theo dõi thanh toán tập trung.",
      action: "+ Create an invoice"
    },
    admin_accounting: {
      title: "Double-Entry General Ledger",
      subtitle: "Bút toán kép cân đối Nợ/Có, tách VAT và ghi nhận cọc/doanh thu chuẩn mực kế toán.",
      action: "+ Post Journal Entry"
    },
    admin_products: {
      title: "Available-to-Promise Inventory",
      subtitle: "Tồn kho khả dụng ATP đa kho, theo dõi hạn dùng FEFO và hàng đang giữ chỗ.",
      action: "+ Thêm sản phẩm sỉ"
    },
    admin_reports: {
      title: "Financial Analytics & Reports",
      subtitle: "Tốc độ dòng tiền, tuổi nợ đại lý AR Aging và hiệu quả biên lợi nhuận danh mục.",
      action: "+ Xuất báo cáo CSV"
    },
    admin_promotions: {
      title: "Wholesale Pricing & Tiers",
      subtitle: "Chính sách chiết khấu khối lượng, tỷ lệ đặt cọc tối thiểu và hạn mức duyệt quản lý.",
      action: "+ Thêm chính sách sỉ"
    },
    admin_users: {
      title: "B2B Accounts & Staff RBAC",
      subtitle: "Quản lý hạn mức nợ đại lý VIP, xác minh tài khoản đối tác và phân quyền nhân viên.",
      action: "+ Cấp tài khoản mới"
    }
  };

  const currentHeading = tabHeadings[activeTab] || {
    title: "Wholesale Administration",
    subtitle: "Cổng quản trị toàn diện hệ sinh thái phân phối sỉ Pet Travel Wholesale.",
    action: newActionLabel
  };

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    setCopyFeedback(label);
    setTimeout(() => setCopyFeedback(null), 2500);
  };

  return (
    <div className="w-full flex flex-col gap-6 animate-fade-in relative">
      {/* ========================================================================= */}
      {/* 1. TOP-CENTER FLOATING CAPSULE NAVBAR (Finnova Pill Header) */}
      {/* ========================================================================= */}
      <div className="w-full flex flex-col lg:flex-row items-center justify-between gap-3 bg-white/90 backdrop-blur-xl p-2.5 sm:p-3 rounded-[26px] border border-[#e8ecf4] shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
        {/* Left: Brand Logo & Back to Wholesale Catalog */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition cursor-pointer active:scale-95 shadow-xs"
            onClick={onBackClick || (() => setActiveTab("catalog"))}
            title="Quay lại Cổng Khách hàng sỉ"
          >
            <ArrowLeft size={16} />
          </button>
          <div
            className="flex items-center gap-2.5 cursor-pointer group"
            onClick={() => setActiveTab("admin_reports")}
            title="Trang tổng quan Overview"
          >
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#16192b] to-[#2d3356] text-white flex items-center justify-center font-black text-xs shadow-md group-hover:scale-105 transition-transform">
              PT
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-xs text-[#16192b] tracking-tight leading-tight group-hover:text-indigo-600 transition-colors">
                Finnova Enterprise
              </span>
              <span className="text-[10px] text-gray-500 font-bold">
                Pet Travel Wholesale
              </span>
            </div>
          </div>
        </div>

        {/* CENTER: Floating Dark Capsule Navigation Pills (Chính giữa trên cùng) */}
        <div className="flex items-center gap-1 bg-[#16192b] p-1.5 rounded-full border border-[#262c4a] shadow-inner max-w-full overflow-x-auto no-scrollbar">
          {navTabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                className={`px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200 whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? "bg-[#4f46e5] text-white shadow-[0_4px_14px_rgba(79,70,229,0.5)] scale-[1.02]"
                    : "text-gray-400 hover:text-white hover:bg-white/10"
                }`}
                onClick={() => setActiveTab(tab.key)}
              >
                <span>{tab.label}</span>
                {tab.key === "admin" && (
                  <span className="min-w-4 h-4 px-1 rounded-full bg-white/20 text-[9px] font-mono flex items-center justify-center">
                    {totalOrdersCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right: Search, Notifications, Settings, Profile Avatar */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Quick Search */}
          <div className="relative hidden xl:block w-44">
            <input
              type="text"
              placeholder="Search invoice/SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery?.(e.target.value)}
              className="w-full bg-gray-100 hover:bg-gray-200/80 focus:bg-white border border-gray-200 focus:border-indigo-500 rounded-full pl-8 pr-3 py-1.5 text-xs text-gray-800 outline-none transition"
            />
            <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
            {searchQuery && (
              <button
                type="button"
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                onClick={() => setSearchQuery?.("")}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Notification Bell with Badge & Dropdown */}
          <div className="relative">
            <button
              type="button"
              className="w-9 h-9 rounded-full bg-gray-100 hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 flex items-center justify-center transition cursor-pointer relative"
              onClick={() => setIsNotificationOpen(!isNotificationOpen)}
              title="Thông báo hệ thống"
            >
              <Bell size={16} />
              {pendingApprovalsCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white animate-pulse" />
              )}
            </button>

            {/* Notification Dropdown */}
            {isNotificationOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#16192b] border border-[#272f50] rounded-3xl p-4 shadow-2xl z-50 animate-scale-in text-white">
                <div className="flex items-center justify-between border-b border-[#242b4b] pb-3">
                  <div className="flex items-center gap-2">
                    <Bell size={16} className="text-indigo-400" />
                    <span className="font-extrabold text-xs">Trung tâm Cảnh báo Real-Time</span>
                  </div>
                  <button
                    type="button"
                    className="text-[11px] text-gray-400 hover:text-white cursor-pointer"
                    onClick={() => setIsNotificationOpen(false)}
                  >
                    Đóng
                  </button>
                </div>

                <div className="flex flex-col gap-2.5 mt-3 max-h-72 overflow-y-auto admin-dark-scroll pr-1 text-xs">
                  {pendingApprovalsCount > 0 && (
                    <div
                      className="p-3 bg-[#1e2440] hover:bg-[#252c4e] rounded-2xl border border-[#2e375e] transition cursor-pointer"
                      onClick={() => {
                        setActiveTab("admin");
                        setIsNotificationOpen(false);
                      }}
                    >
                      <div className="flex items-center justify-between text-[10px] text-amber-400 font-bold">
                        <span>CẦN PHÊ DUYỆT ĐƠN</span>
                        <span>Vừa cập nhật</span>
                      </div>
                      <p className="font-bold text-white mt-1 m-0">
                        Có {pendingApprovalsCount} đơn hàng sỉ đang ở trạng thái chờ duyệt báo giá hoặc chờ đối soát cọc.
                      </p>
                    </div>
                  )}

                  {lowStockCount > 0 && (
                    <div
                      className="p-3 bg-[#1e2440] hover:bg-[#252c4e] rounded-2xl border border-[#2e375e] transition cursor-pointer"
                      onClick={() => {
                        setActiveTab("admin_products");
                        setIsNotificationOpen(false);
                      }}
                    >
                      <div className="flex items-center justify-between text-[10px] text-rose-400 font-bold">
                        <span>CẢNH BÁO TỒN KHO ATP</span>
                        <span>Tồn kho thấp</span>
                      </div>
                      <p className="font-bold text-white mt-1 m-0">
                        Có {lowStockCount} phân loại sản phẩm có số lượng tồn khả dụng dưới 10 đơn vị.
                      </p>
                    </div>
                  )}

                  <div
                    className="p-3 bg-[#1e2440] hover:bg-[#252c4e] rounded-2xl border border-[#2e375e] transition cursor-pointer"
                    onClick={() => {
                      setActiveTab("admin_accounting");
                      setIsNotificationOpen(false);
                    }}
                  >
                    <div className="flex items-center justify-between text-[10px] text-emerald-400 font-bold">
                      <span>SỔ CÁI KẾ TOÁN</span>
                      <span>Hôm nay</span>
                    </div>
                    <p className="font-bold text-white mt-1 m-0">
                      Bút toán kép cân đối 100% Nợ = Có trên toàn bộ tài khoản cấp 1 và cấp 2.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Settings Button */}
          <button
            type="button"
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 flex items-center justify-center transition cursor-pointer"
            onClick={() => setActiveTab("admin_promotions")}
            title="Cài đặt chính sách sỉ"
          >
            <Settings size={16} />
          </button>

          {/* User Profile Pill */}
          <div className="flex items-center gap-2 pl-1 border-l border-gray-200">
            <div
              className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white text-xs shadow-sm cursor-pointer"
              title={`${currentUser?.name || "Admin"} (${currentUser?.role || "Quản trị viên"})`}
              onClick={() => setActiveTab("admin_users")}
            >
              {currentUser?.name?.charAt(0) || "A"}
            </div>
            {onLogout && (
              <button
                type="button"
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-rose-50 text-gray-500 hover:text-rose-600 flex items-center justify-center transition cursor-pointer"
                title="Đăng xuất tài khoản"
                onClick={onLogout}
              >
                <LogOut size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. SUB-HEADER: TITLE, BREADCRUMB & MULTI-FILTER + ACTION CAPSULE BUTTON */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#121528] tracking-tight m-0 font-['Varela_Round']">
            {currentHeading.title}
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 font-medium m-0 mt-1">
            {currentHeading.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-stretch sm:self-auto justify-end">
          {/* Multi-Filter Modal Button */}
          <button
            type="button"
            className="bg-white hover:bg-gray-50 text-gray-700 font-extrabold text-xs py-2.5 px-4 rounded-full border border-gray-200 shadow-sm flex items-center gap-2 cursor-pointer transition active:scale-95"
            onClick={() => setIsFilterModalOpen(true)}
          >
            <SlidersHorizontal size={14} className="text-indigo-600" />
            <span>Bộ lọc nâng cao</span>
          </button>

          {/* Primary Action Button */}
          <button
            type="button"
            className="bg-[#121528] hover:bg-[#1a1e38] text-white font-extrabold text-xs py-2.5 px-5 rounded-full shadow-[0_8px_20px_rgba(18,21,40,0.25)] flex items-center gap-2 cursor-pointer transition active:scale-95"
            onClick={onNewActionClick}
          >
            <Plus size={15} />
            <span>{currentHeading.action}</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. 4-COLUMN KPI METRICS CARDS WITH REAL CALCULATED DATA & LIVE DRILLDOWNS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD 1: OVERDUE / CHỜ DUYỆT */}
        <div
          className="admin-kpi-card p-5 flex flex-col justify-between cursor-pointer hover:scale-[1.01] transition"
          onClick={() => {
            setActiveTab("admin");
            setStatusFilter?.("unpaid");
          }}
          title="Nhấn để lọc các đơn hàng chưa thanh toán / quá hạn"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Overdue / Công nợ chờ thu
            </span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 border ${
              overdueAmount > 0 ? "text-rose-600 bg-rose-50 border-rose-100" : "text-emerald-700 bg-emerald-50 border-emerald-100"
            }`}>
              <span>{overdueAmount > 0 ? "Cần thu" : "0 VND nợ"}</span>
            </span>
          </div>

          <div className="my-2">
            <div className="text-2xl font-black text-[#121528] font-mono tracking-tight">
              {formatVnd(overdueAmount)}
            </div>
            <span className="text-[11px] text-gray-500 font-medium">
              {pendingApprovalsCount > 0 ? `${pendingApprovalsCount} đơn cần duyệt` : "Tất cả đơn đã đối soát"}
            </span>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
            <span className="text-indigo-600 font-bold hover:underline flex items-center gap-1">
              Xem chi tiết đơn hàng <ArrowUpRight size={13} />
            </span>
          </div>
        </div>

        {/* CARD 2: TOTAL REVENUE & DUE */}
        <div
          className="admin-kpi-card p-5 flex flex-col justify-between cursor-pointer hover:scale-[1.01] transition"
          onClick={() => setIsCashflowModalOpen(true)}
          title="Nhấn để xem phân tích dòng tiền và doanh thu"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Doanh thu thực tế (B2B)
            </span>
            <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-mono">
              {totalOrdersCount} đơn
            </span>
          </div>

          <div className="flex items-end justify-between gap-3 my-1">
            <div>
              <div className="text-2xl font-black text-[#121528] font-mono tracking-tight">
                {formatVnd(totalRevenue)}
              </div>
              <span className="text-[11px] text-emerald-600 font-bold">
                Thực thu: {formatVnd(collectedRevenue)}
              </span>
            </div>

            {/* SVG Purple Bar Chart */}
            <div className="flex items-end gap-1.5 h-12 pb-1">
              <div className="w-2.5 h-6 rounded-t-md bg-indigo-300" title="Tuần 1" />
              <div className="w-2.5 h-9 rounded-t-md bg-indigo-400" title="Tuần 2" />
              <div className="w-2.5 h-12 rounded-t-md bg-gradient-to-t from-indigo-600 to-purple-500 shadow-sm" title="Tuần 3" />
              <div className="w-2.5 h-7 rounded-t-md bg-indigo-300" title="Tuần 4" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
            <span className="text-gray-400 font-medium text-[11px]">Dự báo dòng thu chi</span>
            <ArrowUpRight size={13} className="text-gray-400" />
          </div>
        </div>

        {/* CARD 3: INVENTORY & ATP UNITS */}
        <div
          className="admin-kpi-card p-5 flex flex-col justify-between cursor-pointer hover:scale-[1.01] transition"
          onClick={() => {
            setActiveTab("admin_products");
            setIsTurnaroundModalOpen(true);
          }}
          title="Nhấn để xem báo cáo kho & khả dụng ATP"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Tồn kho ATP Khả dụng
            </span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
              lowStockCount > 0 ? "text-amber-700 bg-amber-50 border border-amber-200" : "text-emerald-700 bg-emerald-50"
            }`}>
              {lowStockCount > 0 ? `${lowStockCount} SKU ít tồn` : "Tồn kho dồi dào"}
            </span>
          </div>

          <div className="flex items-end justify-between gap-3 my-1">
            <div>
              <div className="text-2xl font-black text-[#121528] tracking-tight font-mono">
                {totalStockUnits.toLocaleString("vi-VN")} <span className="text-sm font-sans text-gray-400">cái</span>
              </div>
              <span className="text-[11px] text-gray-500 font-medium">
                Sẵn sàng giao cho đại lý sỉ
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
                fill="url(#sparkline-grad)"
                opacity="0.25"
              />
              <defs>
                <linearGradient id="sparkline-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
            <span className="text-gray-400 font-medium text-[11px]">Chi tiết kho hàng</span>
            <ArrowUpRight size={13} className="text-gray-400" />
          </div>
        </div>

        {/* CARD 4: AVAILABLE LIQUIDITY + MULTI-BANK SELECTOR */}
        <div
          className="admin-kpi-card p-5 flex flex-col justify-between cursor-pointer hover:scale-[1.01] transition"
          onClick={() => setIsLiquidityModalOpen(true)}
          title="Nhấn để mở cổng thanh toán và quản lý số dư ngân hàng"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Available / Thanh khoản
            </span>
            <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
              Active
            </span>
          </div>

          <div className="my-1">
            <div className="text-2xl font-black text-[#121528] font-mono tracking-tight">
              {formatVnd(activeBank.balanceVnd)}
            </div>
            <span className="text-[11px] text-gray-400 font-medium">
              Tài khoản: {activeBank.label}
            </span>
          </div>

          {/* Bank Pills Selector Strip */}
          <div
            className="flex items-center gap-1 pt-2 border-t border-gray-100 overflow-x-auto no-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            {BANK_ACCOUNTS.map((bank) => (
              <button
                key={bank.id}
                type="button"
                className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold transition cursor-pointer ${
                  selectedChannel === bank.id
                    ? "bg-[#121528] text-white shadow-xs"
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
      {/* 4. ACTIVE FILTERS & SEARCH CAPSULE STRIP */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-gray-200 shadow-xs text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
            <Filter size={13} className="text-indigo-600" /> Active filters:
          </span>

          {/* Due date filter button */}
          <button
            type="button"
            className="px-3 py-1 rounded-full bg-gray-100 hover:bg-indigo-50 text-gray-700 hover:text-indigo-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            onClick={() => setIsFilterModalOpen(true)}
          >
            <span>Hạn thu: Tất cả</span>
            <ChevronDown size={12} />
          </button>

          {/* Payment status filter button */}
          <button
            type="button"
            className="px-3 py-1 rounded-full bg-gray-100 hover:bg-indigo-50 text-gray-700 hover:text-indigo-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            onClick={() => {
              const next = statusFilter === "all" ? "unpaid" : statusFilter === "unpaid" ? "paid" : "all";
              setStatusFilter?.(next);
            }}
          >
            <span>Thanh toán: {statusFilter === "all" ? "Tất cả" : statusFilter === "unpaid" ? "Chưa thu" : "Đã thu"}</span>
            <ChevronDown size={12} />
          </button>

          {/* Reset button */}
          {(statusFilter !== "all" || searchQuery) && (
            <button
              type="button"
              className="text-indigo-600 hover:text-indigo-800 font-extrabold text-xs ml-1 cursor-pointer"
              onClick={() => {
                setStatusFilter?.("all");
                setSearchQuery?.("");
              }}
            >
              Reset bộ lọc
            </button>
          )}
        </div>

        <div className="text-[11px] text-gray-500 font-medium">
          Hiển thị <strong>{totalOrdersCount}</strong> giao dịch sỉ
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. MODALS & POPUPS FOR COMPONENT BUTTONS */}
      {/* ========================================================================= */}

      {/* A. LIQUIDITY & BANK TRANSFER MODAL */}
      {isLiquidityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#14182b] border border-[#272e4e] rounded-3xl p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4 text-white">
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

      {/* B. CASHFLOW PROJECTION MODAL */}
      {isCashflowModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#14182b] border border-[#272e4e] rounded-3xl p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4 text-white">
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
                <span className="font-mono font-black text-white text-sm">{formatVnd(totalRevenue)}</span>
              </div>
              <div className="p-3 bg-[#1c223c] rounded-2xl border border-[#2e375e] flex items-center justify-between">
                <span className="text-emerald-300">Thực thu (Cọc & Full):</span>
                <span className="font-mono font-black text-emerald-400 text-sm">{formatVnd(collectedRevenue)}</span>
              </div>
              <div className="p-3 bg-[#1c223c] rounded-2xl border border-[#2e375e] flex items-center justify-between">
                <span className="text-rose-300">Công nợ còn lại (AR):</span>
                <span className="font-mono font-black text-rose-400 text-sm">{formatVnd(overdueAmount)}</span>
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

      {/* C. TURNAROUND MODAL */}
      {isTurnaroundModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#14182b] border border-[#272e4e] rounded-3xl p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4 text-white">
            <div className="flex items-center justify-between border-b border-[#232a48] pb-3">
              <h3 className="font-extrabold text-white text-base m-0">Hiệu suất Xử lý Đơn & Tồn kho</h3>
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
                <span className="font-mono font-black text-white text-sm">{totalOrdersCount} đơn</span>
              </div>
              <div className="p-3 bg-[#1c223c] rounded-2xl border border-[#2e375e] flex items-center justify-between">
                <span className="text-indigo-300">Tồn kho khả dụng (ATP):</span>
                <span className="font-mono font-black text-indigo-400 text-sm">{totalStockUnits} đơn vị</span>
              </div>
              <div className="p-3 bg-[#1c223c] rounded-2xl border border-[#2e375e] flex items-center justify-between">
                <span className="text-amber-300">SKU cảnh báo tồn thấp:</span>
                <span className="font-mono font-black text-amber-400 text-sm">{lowStockCount} SKU</span>
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

      {/* D. ADVANCED FILTER MODAL */}
      {isFilterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#14182b] border border-[#272e4e] rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 text-white">
            <div className="flex items-center justify-between border-b border-[#232a48] pb-3">
              <h3 className="font-extrabold text-white text-base m-0">Bộ lọc nâng cao</h3>
              <button
                type="button"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 cursor-pointer"
                onClick={() => setIsFilterModalOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <label className="flex flex-col gap-1">
                <span className="font-bold text-gray-300">Trạng thái thanh toán:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter?.(e.target.value)}
                  className="bg-[#1c223c] border border-[#2e375e] rounded-xl p-2.5 text-white outline-none"
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="unpaid">Chưa thu / Cần thu</option>
                  <option value="paid">Đã thanh toán</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="font-bold text-gray-300">Tìm kiếm từ khóa:</span>
                <input
                  type="text"
                  placeholder="Mã đơn, tên đại lý..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery?.(e.target.value)}
                  className="bg-[#1c223c] border border-[#2e375e] rounded-xl p-2.5 text-white outline-none"
                >
                </input>
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-[#232a48]">
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-gray-400 hover:text-white cursor-pointer"
                onClick={() => {
                  setStatusFilter?.("all");
                  setSearchQuery?.("");
                  setIsFilterModalOpen(false);
                }}
              >
                Reset
              </button>
              <button
                type="button"
                className="admin-pill-btn-white py-2 px-5 text-xs"
                onClick={() => setIsFilterModalOpen(false)}
              >
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
