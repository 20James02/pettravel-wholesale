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
  TrendingUp,
  Search,
  Bell,
  Settings,
  ChevronDown,
  LogOut,
  X,
  CheckCircle2,
  Copy,
  Filter,
  Clock
} from "lucide-react";

interface AdminHeaderProps {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  currentUser: ApiUser | null;
  totalOrdersCount?: number;
  totalRevenue?: number;
  overdueAmount?: number;
  pendingApprovalsCount?: number;
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
  totalOrdersCount = 80,
  totalRevenue = 186540000,
  overdueAmount = 24850000,
  pendingApprovalsCount = 3,
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

  // Top Center Floating Pill Tabs
  const navTabs: { key: TabKey; label: string }[] = [
    { key: "admin_reports", label: "Overview" },
    { key: "admin", label: "Invoices / Orders" },
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
      <div className="w-full flex flex-col md:flex-row items-center justify-between gap-3 bg-white/85 backdrop-blur-xl p-2.5 sm:p-3 rounded-[26px] border border-[#e8ecf4] shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
        {/* Left: Brand Logo & Back */}
        <div className="flex items-center gap-3 shrink-0">
          {onBackClick && (
            <button
              type="button"
              className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition cursor-pointer active:scale-95"
              onClick={onBackClick}
              title="Quay lại"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#16192b] to-[#2d3356] text-white flex items-center justify-center font-black text-xs shadow-md">
              PT
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-xs text-[#16192b] tracking-tight leading-tight">
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
                  <span className="w-4 h-4 rounded-full bg-white/20 text-[9px] flex items-center justify-center">
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
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
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
                  <div
                    className="p-3 bg-[#1e2440] hover:bg-[#252c4e] rounded-2xl border border-[#2e375e] transition cursor-pointer"
                    onClick={() => {
                      setActiveTab("admin");
                      setIsNotificationOpen(false);
                    }}
                  >
                    <div className="flex items-center justify-between text-[10px] text-amber-400 font-bold">
                      <span>CẦN DUYỆT CỌC</span>
                      <span>5 phút trước</span>
                    </div>
                    <p className="font-bold text-white mt-1 m-0">
                      Đơn hàng sỉ #DH-1003 vừa được đại lý chấp thuận báo giá, chờ kế toán đối soát cọc 30%.
                    </p>
                  </div>

                  <div
                    className="p-3 bg-[#1e2440] hover:bg-[#252c4e] rounded-2xl border border-[#2e375e] transition cursor-pointer"
                    onClick={() => {
                      setActiveTab("admin_products");
                      setIsNotificationOpen(false);
                    }}
                  >
                    <div className="flex items-center justify-between text-[10px] text-rose-400 font-bold">
                      <span>CẢNH BÁO TỒN KHO ATP</span>
                      <span>1 giờ trước</span>
                    </div>
                    <p className="font-bold text-white mt-1 m-0">
                      Pate Mèo Royal Canin 85g còn 12 túi sẵn bán (ATP chạm ngưỡng tối thiểu).
                    </p>
                  </div>

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
                      Trial Balance đã kiểm tra tự động: 100% cân Nợ = Có (0 VND sai lệch).
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
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white text-xs shadow-sm">
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
      {/* 3. 4-COLUMN KPI METRICS CARDS WITH LIVE INTERACTIVE DRILLDOWNS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD 1: OVERDUE */}
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
              Overdue / Chờ duyệt
            </span>
            <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full flex items-center gap-1 border border-rose-100">
              <span>14% ▲</span>
            </span>
          </div>

          <div className="my-2">
            <div className="text-2xl font-black text-[#121528] font-mono tracking-tight">
              {formatVnd(overdueAmount)}
            </div>
            <span className="text-[11px] text-gray-400 font-medium">
              {pendingApprovalsCount} đơn cần xử lý ngay
            </span>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
            <span className="text-indigo-600 font-bold hover:underline flex items-center gap-1">
              Xem chi tiết công nợ <ArrowUpRight size={13} />
            </span>
          </div>
        </div>

        {/* CARD 2: DUE + PURPLE GRADIENT BAR CHART */}
        <div
          className="admin-kpi-card p-5 flex flex-col justify-between cursor-pointer hover:scale-[1.01] transition"
          onClick={() => setIsCashflowModalOpen(true)}
          title="Nhấn để xem phân tích dòng tiền 4 tuần"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Due / Dự kiến thu
            </span>
            <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
              4 tuần
            </span>
          </div>

          <div className="flex items-end justify-between gap-3 my-1">
            <div>
              <div className="text-2xl font-black text-[#121528] font-mono tracking-tight">
                {formatVnd(totalRevenue * 0.75)}
              </div>
              <span className="text-[11px] text-emerald-600 font-bold">
                +18.2% tuần này
              </span>
            </div>

            {/* SVG Purple Bar Chart */}
            <div className="flex items-end gap-1.5 h-12 pb-1">
              <div className="w-2.5 h-6 rounded-t-md bg-indigo-300" title="Tuần 1: 25%" />
              <div className="w-2.5 h-9 rounded-t-md bg-indigo-400" title="Tuần 2: 55%" />
              <div className="w-2.5 h-12 rounded-t-md bg-gradient-to-t from-indigo-600 to-purple-500 shadow-sm" title="Tuần 3: 100%" />
              <div className="w-2.5 h-7 rounded-t-md bg-indigo-300" title="Tuần 4: 40%" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
            <span className="text-gray-400 font-medium text-[11px]">Dự báo dòng tiền</span>
            <ArrowUpRight size={13} className="text-gray-400" />
          </div>
        </div>

        {/* CARD 3: AVERAGE TURNAROUND + SPARKLINE AREA */}
        <div
          className="admin-kpi-card p-5 flex flex-col justify-between cursor-pointer hover:scale-[1.01] transition"
          onClick={() => setIsTurnaroundModalOpen(true)}
          title="Nhấn để xem biểu đồ tốc độ hoàn tất đơn"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Avg Turnaround
            </span>
            <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
              +3 ngày
            </span>
          </div>

          <div className="flex items-end justify-between gap-3 my-1">
            <div>
              <div className="text-2xl font-black text-[#121528] tracking-tight font-mono">
                16 days
              </div>
              <span className="text-[11px] text-gray-400 font-medium">
                Từ báo giá đến giao hàng
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
            <span className="text-gray-400 font-medium text-[11px]">Tốc độ hoàn tất đơn</span>
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
                  <Copy size={13} /> Sao chép
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
              <div className="flex items-center gap-2">
                <TrendingUp size={18} className="text-indigo-400" />
                <h3 className="font-extrabold text-white text-base m-0">Dự báo Dòng tiền B2B (4 Tuần tới)</h3>
              </div>
              <button
                type="button"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 cursor-pointer"
                onClick={() => setIsCashflowModalOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-[#1c223c] rounded-2xl border border-[#2e375e]">
                <span className="text-gray-400 text-[10px] uppercase font-bold">Tuần 1 (Đến hạn)</span>
                <div className="text-base font-black text-indigo-300 font-mono mt-1">{formatVnd(45000000)}</div>
                <span className="text-[10px] text-emerald-400">8 đơn chốt</span>
              </div>
              <div className="p-3 bg-[#1c223c] rounded-2xl border border-[#2e375e]">
                <span className="text-gray-400 text-[10px] uppercase font-bold">Tuần 2 (Đến hạn)</span>
                <div className="text-base font-black text-indigo-300 font-mono mt-1">{formatVnd(68000000)}</div>
                <span className="text-[10px] text-emerald-400">12 đơn chốt</span>
              </div>
              <div className="p-3 bg-[#1c223c] rounded-2xl border border-[#2e375e]">
                <span className="text-gray-400 text-[10px] uppercase font-bold">Tuần 3 (Đến hạn)</span>
                <div className="text-base font-black text-indigo-300 font-mono mt-1">{formatVnd(92000000)}</div>
                <span className="text-[10px] text-emerald-400">15 đơn chốt</span>
              </div>
              <div className="p-3 bg-[#1c223c] rounded-2xl border border-[#2e375e]">
                <span className="text-gray-400 text-[10px] uppercase font-bold">Tuần 4 (Đến hạn)</span>
                <div className="text-base font-black text-indigo-300 font-mono mt-1">{formatVnd(38000000)}</div>
                <span className="text-[10px] text-emerald-400">6 đơn chốt</span>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 mt-2 border-t border-[#232a48] pt-3 text-xs">
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

      {/* C. TURNAROUND ANALYTICS MODAL */}
      {isTurnaroundModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#14182b] border border-[#272e4e] rounded-3xl p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4 text-white">
            <div className="flex items-center justify-between border-b border-[#232a48] pb-3">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-indigo-400" />
                <h3 className="font-extrabold text-white text-base m-0">Thời Gian Xử Lý & Hoàn Tất Đơn Sỉ</h3>
              </div>
              <button
                type="button"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 cursor-pointer"
                onClick={() => setIsTurnaroundModalOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <div className="p-3 bg-[#1c223c] rounded-2xl border border-[#2e375e] flex justify-between items-center">
                <span className="text-gray-300">Từ yêu cầu đến chốt báo giá:</span>
                <strong className="text-emerald-400 font-mono">1.2 ngày</strong>
              </div>
              <div className="p-3 bg-[#1c223c] rounded-2xl border border-[#2e375e] flex justify-between items-center">
                <span className="text-gray-300">Từ đặt cọc đến điều phối kho ATP:</span>
                <strong className="text-sky-400 font-mono">2.5 ngày</strong>
              </div>
              <div className="p-3 bg-[#1c223c] rounded-2xl border border-[#2e375e] flex justify-between items-center">
                <span className="text-gray-300">Vận chuyển & giao nhận đại lý:</span>
                <strong className="text-indigo-300 font-mono">12.3 ngày</strong>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 mt-2 border-t border-[#232a48] pt-3 text-xs">
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

      {/* D. MULTI-FILTER ADVANCED MODAL */}
      {isFilterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#14182b] border border-[#272e4e] rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 text-white text-xs">
            <div className="flex items-center justify-between border-b border-[#232a48] pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={18} className="text-indigo-400" />
                <h3 className="font-extrabold text-white text-base m-0">Bộ lọc Giao dịch Nâng cao</h3>
              </div>
              <button
                type="button"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 cursor-pointer"
                onClick={() => setIsFilterModalOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-bold text-gray-300">Trạng thái thanh toán</label>
                <select
                  className="w-full mt-1 bg-[#1c223c] border border-[#2c365c] rounded-xl py-2 px-3 text-white text-xs"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter?.(e.target.value)}
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="unpaid">Chưa thanh toán</option>
                  <option value="paid">Đã thanh toán đủ</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-300">Tìm kiếm theo tên / Mã đơn</label>
                <input
                  type="text"
                  placeholder="Nhập mã đơn, tên đại lý..."
                  className="w-full mt-1 bg-[#1c223c] border border-[#2c365c] rounded-xl py-2 px-3 text-white text-xs"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery?.(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 mt-2 border-t border-[#232a48] pt-3 text-xs">
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-gray-300 hover:text-white cursor-pointer"
                onClick={() => setIsFilterModalOpen(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="admin-pill-btn-primary py-2 px-5 text-xs"
                onClick={() => setIsFilterModalOpen(false)}
              >
                Áp dụng bộ lọc
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy Toast Alert */}
      {copyFeedback && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#16192b] text-white px-4 py-3 rounded-2xl border border-indigo-500/50 shadow-2xl flex items-center gap-2 animate-slide-up-sheet text-xs font-bold">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>{copyFeedback}</span>
        </div>
      )}
    </div>
  );
}
