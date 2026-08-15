"use client";

import { Bell, LockKeyhole, Menu, Search, ShoppingCart, X } from "lucide-react";
import type { AppMode, TabKey, ApiUser } from "../../types";
import { formatVnd } from "@/lib/money";

interface TopbarProps {
  isLoggedIn: boolean;
  activeUser: ApiUser | null;
  isAdmin: boolean;
  mode: AppMode;
  cartTotalVal: number;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  setIsSidebarOpen: (val: boolean) => void;
  setShowLoginModal: (val: boolean) => void;
  setActiveTab: (tab: TabKey) => void;
}

export function Topbar({
  isLoggedIn,
  activeUser,
  isAdmin,
  mode,
  cartTotalVal,
  searchQuery,
  setSearchQuery,
  setIsSidebarOpen,
  setShowLoginModal,
  setActiveTab
}: TopbarProps) {
  return (
    <header className="topbar animate-fade-in flex-wrap sm:flex-nowrap gap-3">
      {/* Brand & Greeting Area */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <button
          type="button"
          className="lg:hidden w-10 h-10 rounded-xl border border-orange-200 bg-[#FFFDF9] text-orange-950 flex items-center justify-center transition cursor-pointer active:scale-90 shrink-0 shadow-sm"
          onClick={() => setIsSidebarOpen(true)}
          title="Mở menu quản trị"
          aria-label="Mở menu"
        >
          <Menu size={18} />
        </button>
        
        <div className="min-w-0">
          <p className="muted m-0 text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider truncate">
            Pet Travel · {!isLoggedIn ? "Khách ghé thăm" : isAdmin ? "Cổng quản trị" : "Cổng Đại lý sỉ"}
          </p>
          <h2 className="text-sm sm:text-lg font-bold text-[#331B08] mt-0.5 truncate font-['Varela_Round'] leading-tight">
            {!isLoggedIn ? "Chào mừng Đối tác Sỉ! 👋" : `Xin chào, ${activeUser?.name || "Đại lý"}! 👋`}
          </h2>
        </div>
      </div>

      {/* Action Controls & Search */}
      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
        {/* Search input with clear button */}
        <div className="relative flex-1 sm:flex-initial">
          <input
            type="text"
            className="text-input pl-9 pr-8 text-xs sm:text-sm w-full sm:w-[220px] py-2 rounded-xl border-orange-200 bg-white"
            placeholder="Tìm tên, mã sản phẩm..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="absolute left-3 top-2.5 text-orange-400" size={15} />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 transition"
              onClick={() => setSearchQuery("")}
              aria-label="Xóa tìm kiếm"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {!isLoggedIn ? (
          <button
            className="tab-button text-xs py-2 px-3.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md transition shrink-0"
            type="button"
            onClick={() => setShowLoginModal(true)}
          >
            <LockKeyhole size={14} />
            <span>Đăng nhập</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            {!isAdmin && mode === "customer" && (
              <button
                className="hidden sm:flex tab-button text-xs py-2 px-3 bg-orange-100 hover:bg-orange-200 border-orange-200 font-bold rounded-xl items-center gap-1.5 cursor-pointer text-orange-900 transition"
                type="button"
                onClick={() => setActiveTab("cart")}
              >
                <ShoppingCart size={15} />
                <span className="font-mono">{formatVnd(cartTotalVal)}</span>
              </button>
            )}
            <button
              className="icon-button w-9 h-9 rounded-xl flex items-center justify-center border border-orange-200 text-orange-900/80 hover:text-orange-900"
              aria-label="Thông báo"
              type="button"
            >
              <Bell size={16} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
