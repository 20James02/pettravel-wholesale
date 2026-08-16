"use client";

import { useState } from "react";
import type { TabKey, ApiUser } from "../../types";
import {
  ArrowLeft,
  Search,
  Bell,
  Settings,
  LogOut,
  X,
  Sun,
  Moon
} from "lucide-react";

interface AdminHeaderProps {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  currentUser: ApiUser | null;
  totalOrdersCount?: number;
  pendingApprovalsCount?: number;
  lowStockCount?: number;
  onBackClick?: () => void;
  onLogout?: () => void;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  theme?: "light" | "dark";
  setTheme?: (theme: "light" | "dark") => void;
}

export function AdminHeader({
  activeTab,
  setActiveTab,
  currentUser,
  totalOrdersCount = 0,
  pendingApprovalsCount = 0,
  lowStockCount = 0,
  onBackClick,
  onLogout,
  searchQuery = "",
  setSearchQuery,
  theme = "light",
  setTheme
}: AdminHeaderProps) {
  const [isNotificationOpen, setIsNotificationOpen] = useState<boolean>(false);

  // Top Center Floating Pill Tabs in 100% Vietnamese
  const navTabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: "admin_reports", label: "Tổng quan" },
    { key: "admin", label: "Đơn hàng sỉ", badge: totalOrdersCount },
    { key: "admin_accounting", label: "Sổ cái kế toán" },
    { key: "admin_products", label: "Kho hàng & ATP" },
    { key: "admin_promotions", label: "Bảng giá & Chiết khấu" },
    { key: "admin_users", label: "Khách hàng & Nhân sự" }
  ];

  const toggleTheme = () => {
    if (setTheme) {
      setTheme(theme === "dark" ? "light" : "dark");
    }
  };

  return (
    <header className="w-full flex flex-col gap-3 sticky top-3 z-40 mb-4 animate-fade-in pointer-events-auto">
      {/* ========================================================================= */}
      {/* TOP-CENTER FLOATING CAPSULE NAVBAR (Finnova Pill Header) */}
      {/* ========================================================================= */}
      <div className={`w-full flex flex-col lg:flex-row items-center justify-between gap-3 px-3 py-2.5 rounded-[26px] border backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.04)] transition-colors duration-300 ${
        theme === "dark"
          ? "bg-[#14182b]/95 border-[#272e4e] text-white"
          : "bg-white/95 border-[#e8ecf4] text-[#16192b]"
      }`}>
        {/* Left: Brand Logo & Back to Wholesale Customer Catalog */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            className={`w-9 h-9 rounded-full flex items-center justify-center transition cursor-pointer active:scale-95 shadow-xs ${
              theme === "dark"
                ? "bg-[#1c223c] hover:bg-[#283154] text-gray-200"
                : "bg-gray-100 hover:bg-gray-200 text-gray-700"
            }`}
            onClick={onBackClick || (() => setActiveTab("catalog"))}
            title="Quay lại Cổng Khách hàng sỉ"
          >
            <ArrowLeft size={16} />
          </button>
          <div
            className="flex items-center gap-2.5 cursor-pointer group"
            onClick={() => setActiveTab("admin_reports")}
            title="Trang Tổng quan"
          >
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#16192b] to-[#2d3356] text-white flex items-center justify-center font-black text-xs shadow-md group-hover:scale-105 transition-transform">
              PT
            </div>
            <div className="flex flex-col">
              <span className={`font-extrabold text-xs tracking-tight leading-tight group-hover:text-indigo-500 transition-colors ${
                theme === "dark" ? "text-white" : "text-[#16192b]"
              }`}>
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
                {typeof tab.badge === "number" && (
                  <span className="min-w-4 h-4 px-1 rounded-full bg-white/20 text-[9px] font-mono flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right: Search, Theme Toggle, Notifications, Settings, Profile Avatar */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Quick Search */}
          <div className="relative hidden xl:block w-48">
            <input
              type="text"
              placeholder="Tìm đơn, SKU, đại lý..."
              value={searchQuery}
              onChange={(e) => setSearchQuery?.(e.target.value)}
              className={`w-full border rounded-full pl-8 pr-3 py-1.5 text-xs outline-none transition ${
                theme === "dark"
                  ? "bg-[#1c223c] border-[#2e375e] text-white placeholder-gray-400 focus:border-indigo-400 focus:bg-[#222846]"
                  : "bg-gray-100 border-gray-200 text-gray-800 placeholder-gray-400 focus:border-indigo-500 focus:bg-white"
              }`}
            />
            <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
            {searchQuery && (
              <button
                type="button"
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 cursor-pointer"
                onClick={() => setSearchQuery?.("")}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Theme Toggle Button (Light / Dark) */}
          <button
            type="button"
            className={`w-9 h-9 rounded-full flex items-center justify-center transition cursor-pointer active:scale-95 ${
              theme === "dark"
                ? "bg-[#1c223c] hover:bg-[#283154] text-amber-300"
                : "bg-gray-100 hover:bg-gray-200 text-gray-700"
            }`}
            onClick={toggleTheme}
            title={theme === "dark" ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối"}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Notification Bell with Badge & Dropdown */}
          <div className="relative">
            <button
              type="button"
              className={`w-9 h-9 rounded-full flex items-center justify-center transition cursor-pointer relative ${
                theme === "dark"
                  ? "bg-[#1c223c] hover:bg-[#283154] text-gray-300"
                  : "bg-gray-100 hover:bg-indigo-50 text-gray-600 hover:text-indigo-600"
              }`}
              onClick={() => setIsNotificationOpen(!isNotificationOpen)}
              title="Thông báo hệ thống"
            >
              <Bell size={16} />
              {(pendingApprovalsCount > 0 || lowStockCount > 0) && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white animate-pulse" />
              )}
            </button>

            {/* Notification Dropdown */}
            {isNotificationOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#16192b] border border-[#272f50] rounded-3xl p-4 shadow-2xl z-50 animate-scale-in text-white">
                <div className="flex items-center justify-between border-b border-[#242b4b] pb-3">
                  <div className="flex items-center gap-2">
                    <Bell size={16} className="text-indigo-400" />
                    <span className="font-extrabold text-xs">Trung tâm Cảnh báo Thời gian thực</span>
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
                        <span>Mới</span>
                      </div>
                      <p className="font-bold text-white mt-1 m-0">
                        Có {pendingApprovalsCount} đơn hàng sỉ đang ở trạng thái chờ duyệt báo giá hoặc cọc.
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
                        <span>Cần nhập</span>
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
            className={`w-9 h-9 rounded-full flex items-center justify-center transition cursor-pointer ${
              theme === "dark"
                ? "bg-[#1c223c] hover:bg-[#283154] text-gray-300"
                : "bg-gray-100 hover:bg-indigo-50 text-gray-600 hover:text-indigo-600"
            }`}
            onClick={() => setActiveTab("admin_promotions")}
            title="Cài đặt chính sách sỉ"
          >
            <Settings size={16} />
          </button>

          {/* User Profile Pill */}
          <div className="flex items-center gap-2 pl-1 border-l border-gray-200/50">
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
                className={`w-8 h-8 rounded-full flex items-center justify-center transition cursor-pointer ${
                  theme === "dark"
                    ? "bg-[#1c223c] hover:bg-rose-900/50 text-gray-400 hover:text-rose-300"
                    : "bg-gray-100 hover:bg-rose-50 text-gray-500 hover:text-rose-600"
                }`}
                title="Đăng xuất tài khoản"
                onClick={onLogout}
              >
                <LogOut size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
