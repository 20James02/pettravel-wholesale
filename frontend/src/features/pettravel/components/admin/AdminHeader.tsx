"use client";

import { useState } from "react";
import type { TabKey, ApiUser } from "../../types";
import { formatVnd } from "@/lib/money";
import {
  ArrowLeft,
  SlidersHorizontal,
  Plus,
  AlertCircle,
  Calendar,
  Clock,
  Wallet,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Search,
  Bell,
  Settings,
  FileText,
  CreditCard,
  Grid,
  Layers,
  Sparkles,
  ChevronDown,
  LogOut
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
  setStatusFilter,
  customerFilter = "all",
  setCustomerFilter
}: AdminHeaderProps) {
  const [selectedChannel, setSelectedChannel] = useState<string>("vcb");
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState<boolean>(false);

  // Tab definitions matching the Finnova Capsule Pill dock
  const navTabs: { key: TabKey; label: string }[] = [
    { key: "admin_reports", label: "Overview" },
    { key: "admin", label: "Invoices / Orders" },
    { key: "admin_accounting", label: "Accounting & Ledger" },
    { key: "admin_products", label: "Inventory & ATP" },
    { key: "admin_promotions", label: "Pricing & Tiers" },
    { key: "admin_users", label: "Customers & Staff" }
  ];

  // Dynamic titles and subtitles per tab
  const tabHeadings: Record<string, { title: string; subtitle: string; action: string }> = {
    admin: {
      title: "Invoices & B2B Orders",
      subtitle: "Manage, review quotes, lock price snapshots and track payment status in one place.",
      action: "+ Create an invoice"
    },
    admin_accounting: {
      title: "Double-Entry General Ledger",
      subtitle: "Balanced double-entry journal lines, VAT split and deposit allocations audit.",
      action: "+ Post Journal Entry"
    },
    admin_products: {
      title: "Available-to-Promise Inventory",
      subtitle: "Multi-warehouse real-time ATP stock balances, FEFO lot tracking and reservations.",
      action: "+ Add Product SKU"
    },
    admin_reports: {
      title: "Financial Analytics & Reports",
      subtitle: "Revenue velocity, AR customer aging analysis, and category margin performance.",
      action: "+ Export Summary"
    },
    admin_promotions: {
      title: "Wholesale Pricing & Tiers",
      subtitle: "Volume discount tiers, deposit rate policies and manager approval thresholds.",
      action: "+ New Pricing Tier"
    },
    admin_users: {
      title: "B2B Accounts & Permissions",
      subtitle: "Wholesale buyer credit limits, verified dealer accounts and internal staff RBAC.",
      action: "+ Invite Customer"
    }
  };

  const currentHeading = tabHeadings[activeTab] || {
    title: "Wholesale Administration",
    subtitle: "Centralized B2B enterprise control panel for Pet Travel Wholesale.",
    action: newActionLabel
  };

  return (
    <div className="flex flex-col gap-6 mb-6">
      {/* 1. TOP FLOATING CAPSULE NAVBAR */}
      <header className="flex items-center justify-between gap-4 py-2 px-1">
        {/* Brand Logo & Notification Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-[0_8px_20px_rgba(79,70,229,0.35)]">
              <Sparkles size={20} className="animate-pulse" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-base tracking-tight text-gray-900 leading-none font-['Varela_Round']">
                FINNOVA
              </span>
              <span className="text-[10px] font-semibold tracking-wider text-gray-600 uppercase mt-0.5">
                Pet Travel Wholesale
              </span>
            </div>
          </div>

          <div className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-200 text-xs font-bold text-gray-700 shadow-sm">
            {totalOrdersCount}
          </div>
        </div>

        {/* Central Dark Capsule Pill Dock */}
        <nav className="hidden lg:flex items-center gap-1 bg-[#151829] p-1.5 rounded-full shadow-[0_10px_30px_rgba(21,24,41,0.25)] border border-[#232742]">
          {navTabs.map((tab) => {
            const isActive =
              activeTab === tab.key ||
              (tab.key === "admin_products" && ["admin_categories", "admin_suppliers", "admin_operations"].includes(activeTab)) ||
              (tab.key === "admin_accounting" && ["admin_invoices", "settings"].includes(activeTab));

            return (
              <button
                key={tab.key}
                type="button"
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? "bg-[#4f46e5] text-white shadow-[0_6px_18px_rgba(79,70,229,0.45)] scale-[1.02]"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
                onClick={() => setActiveTab(tab.key)}
              >
                {isActive && <span className="text-[11px] font-extrabold">+</span>}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Utility Actions */}
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1 bg-white p-1 rounded-2xl border border-gray-200 shadow-sm">
            <button
              type="button"
              className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
              title="Chứng từ"
            >
              <FileText size={16} />
            </button>
            <button
              type="button"
              className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
              title="Thẻ thanh toán"
            >
              <CreditCard size={16} />
            </button>
            <button
              type="button"
              className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
              title="Danh mục"
            >
              <Grid size={16} />
            </button>
            <button
              type="button"
              className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
              title="Lớp dữ liệu"
            >
              <Layers size={16} />
            </button>
            <button
              type="button"
              className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
              title="Bộ lọc nâng cao"
            >
              <SlidersHorizontal size={16} />
            </button>
          </div>

          {/* Notification Bell with Red Dot */}
          <div className="relative">
            <button
              type="button"
              className="w-9 h-9 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-600 hover:text-gray-900 transition"
              title="Thông báo"
            >
              <Bell size={17} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
            </button>
          </div>

          {/* Settings Button */}
          <button
            type="button"
            className="w-9 h-9 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-600 hover:text-gray-900 transition"
            title="Cài đặt hệ thống"
            onClick={() => setActiveTab("settings")}
          >
            <Settings size={17} />
          </button>

          {/* User Profile Avatar Pill */}
          <div className="flex items-center gap-2 pl-1">
            <div className="relative w-9 h-9 rounded-2xl overflow-hidden border border-indigo-200 bg-indigo-50 shadow-sm">
              <div className="w-full h-full flex items-center justify-center font-extrabold text-indigo-700 text-xs">
                {currentUser?.name?.charAt(0) || "A"}
              </div>
            </div>
            {onLogout && (
              <button
                type="button"
                className="hidden sm:flex w-8 h-8 rounded-xl items-center justify-center text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition"
                title="Đăng xuất"
                onClick={onLogout}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. SUB-HEADER & PRIMARY ACTION BAR */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBackClick && (
            <button
              type="button"
              className="w-10 h-10 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-700 hover:text-indigo-600 hover:border-indigo-200 transition cursor-pointer"
              onClick={onBackClick}
              title="Quay lại"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight leading-tight m-0">
              {currentHeading.title}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 font-medium mt-0.5 m-0">
              {currentHeading.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-stretch sm:self-auto justify-end">
          <button
            type="button"
            className="w-10 h-10 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-600 hover:text-gray-900 transition cursor-pointer"
            onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
            title="Lọc nhanh"
          >
            <SlidersHorizontal size={17} />
          </button>

          <button
            type="button"
            className="admin-pill-btn-primary flex-1 sm:flex-none text-xs sm:text-sm py-2.5 px-5 flex items-center justify-center gap-2"
            onClick={onNewActionClick}
          >
            <Plus size={16} />
            <span>{currentHeading.action}</span>
          </button>
        </div>
      </div>

      {/* 3. TOP 4-COLUMN KPI CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: Overdue & Approvals */}
        <div className="admin-kpi-card flex flex-col justify-between min-h-[160px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600">Overdue & Approvals</span>
            <div className="w-6 h-6 rounded-full bg-rose-50 flex items-center justify-center text-rose-500">
              <AlertCircle size={14} />
            </div>
          </div>

          <div className="my-2">
            <div className="text-2xl sm:text-[26px] font-black text-gray-900 font-mono tracking-tight">
              {formatVnd(overdueAmount)}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 text-rose-600 text-xs font-bold">
              <TrendingUp size={13} />
              <span>+12.5% from last month</span>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-600 font-semibold">
            <span>{pendingApprovalsCount} đơn cần duyệt giá</span>
            <span className="text-rose-600 font-bold">Cần xử lý</span>
          </div>
        </div>

        {/* Card 2: Due within next month (with Purple Gradient Bar Chart) */}
        <div className="admin-kpi-card flex flex-col justify-between min-h-[160px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600">Due within next month</span>
            <div className="w-6 h-6 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Calendar size={14} />
            </div>
          </div>

          <div className="flex items-end justify-between gap-2 mt-2">
            <div>
              <div className="text-2xl sm:text-[26px] font-black text-gray-900 font-mono tracking-tight">
                {formatVnd(142560000)}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 text-indigo-600 text-xs font-bold">
                <TrendingUp size={13} />
                <span>+8.2% from last month</span>
              </div>
            </div>

            {/* Mini SVG Bar Chart */}
            <div className="flex items-end gap-1.5 h-12 pb-1 shrink-0">
              {[35, 45, 30, 60, 50, 75, 95].map((h, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div
                    className={`w-2.5 rounded-full transition-all duration-300 ${
                      i === 6
                        ? "bg-indigo-600 shadow-[0_2px_8px_rgba(79,70,229,0.5)]"
                        : i >= 4
                        ? "bg-indigo-400"
                        : "bg-indigo-200"
                    }`}
                    style={{ height: `${h * 0.4}px` }}
                  ></div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-600 font-semibold">
            <span>Dự thu đơn sỉ tháng này</span>
            <span className="text-indigo-600 font-bold">Kế hoạch 100%</span>
          </div>
        </div>

        {/* Card 3: Average time to get paid (with Smooth Sparkline) */}
        <div className="admin-kpi-card flex flex-col justify-between min-h-[160px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600">Average time to get paid</span>
            <div className="w-6 h-6 rounded-full bg-sky-50 flex items-center justify-center text-sky-600">
              <Clock size={14} />
            </div>
          </div>

          <div className="flex items-end justify-between gap-2 mt-2">
            <div>
              <div className="text-2xl sm:text-[26px] font-black text-gray-900 tracking-tight">
                16 <span className="text-sm font-bold text-gray-600">days</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 text-emerald-600 text-xs font-bold">
                <TrendingDown size={13} />
                <span>-2 days from last month</span>
              </div>
            </div>

            {/* Smooth SVG Sparkline */}
            <div className="w-24 h-10 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 100 40">
                <path
                  d="M 0 35 Q 20 30, 35 25 T 65 18 T 85 10 T 100 5"
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle cx="0" cy="35" r="2.5" fill="#6366f1" />
                <circle cx="35" cy="25" r="2.5" fill="#6366f1" />
                <circle cx="65" cy="18" r="2.5" fill="#6366f1" />
                <circle cx="85" cy="10" r="2.5" fill="#6366f1" />
                <circle cx="100" cy="5" r="3.5" fill="#4f46e5" className="animate-ping" />
                <circle cx="100" cy="5" r="3" fill="#4f46e5" />
              </svg>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-600 font-semibold">
            <span>Tốc độ quay vòng vốn</span>
            <span className="text-emerald-600 font-bold">Nhanh hơn 12%</span>
          </div>
        </div>

        {/* Card 4: Available for Instant Payout (with Accounts Pills) */}
        <div className="admin-kpi-card flex flex-col justify-between min-h-[160px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600">Available for Instant Payout</span>
            <div className="flex items-center gap-1">
              <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Wallet size={14} />
              </div>
              <div className="w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-700 cursor-pointer">
                <ArrowUpRight size={14} />
              </div>
            </div>
          </div>

          <div className="my-1.5">
            <div className="text-2xl sm:text-[26px] font-black text-gray-900 font-mono tracking-tight">
              {formatVnd(totalRevenue)}
            </div>
            <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">
              Khả dụng giải ngân
            </span>
          </div>

          {/* Payment Method Selector & Payout Button */}
          <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-gray-100">
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                  selectedChannel === "vcb"
                    ? "bg-[#151829] text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                onClick={() => setSelectedChannel("vcb")}
              >
                VCB ••6789
              </button>
              <button
                type="button"
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                  selectedChannel === "tcb"
                    ? "bg-[#151829] text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                onClick={() => setSelectedChannel("tcb")}
              >
                TCB ••4242
              </button>
            </div>

            <button
              type="button"
              className="bg-[#151829] hover:bg-black text-white text-[11px] font-extrabold px-3 py-1.5 rounded-full shadow-sm cursor-pointer transition active:scale-95"
            >
              Payout
            </button>
          </div>
        </div>
      </div>

      {/* 4. ACTIVE FILTERS & SEARCH CAPSULE STRIP */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/70 backdrop-blur-md p-2.5 rounded-3xl border border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Active Filter Pill */}
          <div className="flex items-center gap-1.5 bg-[#151829] text-white text-xs font-bold py-2 px-3.5 rounded-full shadow-sm">
            <span>Active filters</span>
            <span className="w-4 h-4 rounded-full bg-indigo-500 text-[10px] flex items-center justify-center">
              2
            </span>
          </div>

          {/* Customer Filter Dropdown Pill */}
          <div className="relative">
            <select
              className="appearance-none bg-white border border-gray-200 text-xs font-bold text-gray-700 py-2 pl-3.5 pr-8 rounded-full shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              value={customerFilter}
              onChange={(e) => setCustomerFilter && setCustomerFilter(e.target.value)}
            >
              <option value="all">Tất cả khách hàng (All customers)</option>
              <option value="pet_spa">Pet Spa & Clinic</option>
              <option value="poodle_house">Poodle House VN</option>
              <option value="cat_kingdom">Vương Quốc Mèo</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-2.5 text-gray-400 pointer-events-none" />
          </div>

          {/* Status Filter Dropdown Pill */}
          <div className="relative">
            <select
              className="appearance-none bg-white border border-gray-200 text-xs font-bold text-gray-700 py-2 pl-3.5 pr-8 rounded-full shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              value={statusFilter}
              onChange={(e) => setStatusFilter && setStatusFilter(e.target.value)}
            >
              <option value="all">Tất cả trạng thái (All statuses)</option>
              <option value="customer_accepted">Đã duyệt (Accepted)</option>
              <option value="deposit_paid">Đã cọc (Deposit Paid)</option>
              <option value="shipped">Đã xuất kho (Shipped)</option>
              <option value="delivered">Đã giao hàng (Delivered)</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-2.5 text-gray-400 pointer-events-none" />
          </div>

          {/* Datepicker Pills */}
          <div className="hidden md:flex items-center gap-1.5 bg-white border border-gray-200 py-2 px-3.5 rounded-full text-xs font-bold text-gray-700 shadow-sm">
            <span>Từ: 01/11/2026</span>
            <Calendar size={13} className="text-gray-400" />
          </div>
          <div className="hidden md:flex items-center gap-1.5 bg-white border border-gray-200 py-2 px-3.5 rounded-full text-xs font-bold text-gray-700 shadow-sm">
            <span>Đến: 30/11/2026</span>
            <Calendar size={13} className="text-gray-400" />
          </div>
        </div>

        {/* Search Input Pill */}
        <div className="relative flex-1 sm:flex-none sm:w-64">
          <input
            type="text"
            className="w-full bg-white border border-gray-200 text-xs font-medium text-gray-900 py-2 pl-3.5 pr-9 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Enter invoice # / SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery && setSearchQuery(e.target.value)}
          />
          <Search size={14} className="absolute right-3.5 top-2.5 text-gray-400 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
