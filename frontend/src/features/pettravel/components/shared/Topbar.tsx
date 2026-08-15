"use client";

import { useState } from "react";
import { Bell, LockKeyhole, Menu, Search, ShoppingCart, X, FileText, Clock, ShoppingBag } from "lucide-react";
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
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  return (
    <header className="topbar animate-fade-in flex flex-col md:flex-row items-center justify-between gap-3 p-3 bg-white/85 backdrop-blur-xl rounded-[24px] border border-orange-200 shadow-sm relative">
      {/* 1. Left: Brand & Greeting Area */}
      <div className="flex items-center gap-2.5 min-w-0 w-full md:w-auto justify-between md:justify-start">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="lg:hidden w-9 h-9 rounded-xl border border-orange-200 bg-[#FFFDF9] text-orange-950 flex items-center justify-center transition cursor-pointer active:scale-90 shrink-0 shadow-sm"
            onClick={() => setIsSidebarOpen(true)}
            title="Mở menu"
            aria-label="Mở menu"
          >
            <Menu size={17} />
          </button>
          
          <div className="min-w-0">
            <p className="muted m-0 text-[9px] font-mono font-bold uppercase tracking-wider truncate">
              Pet Travel · {!isLoggedIn ? "Khách ghé thăm" : isAdmin ? "Cổng quản trị" : "Cổng Đại lý sỉ"}
            </p>
            <h2 className="text-xs sm:text-sm font-bold text-[#331B08] mt-0.5 truncate font-['Varela_Round'] leading-tight">
              {!isLoggedIn ? "Chào mừng Đối tác Sỉ! 👋" : `Xin chào, ${activeUser?.name || "Đại lý"}! 👋`}
            </h2>
          </div>
        </div>

        {/* Mobile Cart / Login Button */}
        <div className="flex items-center gap-1.5 md:hidden">
          {!isLoggedIn ? (
            <button
              className="tab-button text-xs py-1.5 px-3 bg-orange-500 text-white font-bold rounded-xl flex items-center gap-1"
              type="button"
              onClick={() => setShowLoginModal(true)}
            >
              <LockKeyhole size={13} />
              <span>Đăng nhập</span>
            </button>
          ) : (
            <button
              className="tab-button text-xs py-1.5 px-2.5 bg-orange-100 text-orange-900 font-bold rounded-xl flex items-center gap-1"
              type="button"
              onClick={() => setActiveTab("cart")}
            >
              <ShoppingCart size={14} />
              <span className="font-mono text-[11px]">{formatVnd(cartTotalVal)}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. CENTER: TOP-CENTER FLOATING CAPSULE NAVIGATION MENU (Chính giữa trên cùng) */}
      <div className="hidden md:flex items-center gap-1 bg-[#16192b] p-1.5 rounded-full border border-[#262c4a] shadow-inner">
        <button
          type="button"
          className="px-3.5 py-1.5 rounded-full text-xs font-bold text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer flex items-center gap-1.5"
          onClick={() => setActiveTab("catalog")}
        >
          <ShoppingBag size={13} className="text-orange-400" />
          <span>Sản phẩm sỉ</span>
        </button>

        <button
          type="button"
          className="px-3.5 py-1.5 rounded-full text-xs font-bold text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer flex items-center gap-1.5"
          onClick={() => setActiveTab("cart")}
        >
          <ShoppingCart size={13} className="text-indigo-400" />
          <span>Giỏ hàng & Báo giá</span>
        </button>

        <button
          type="button"
          className="px-3.5 py-1.5 rounded-full text-xs font-bold text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer flex items-center gap-1.5"
          onClick={() => setActiveTab("order")}
        >
          <Clock size={13} className="text-amber-400" />
          <span>Theo dõi đơn</span>
        </button>

        <button
          type="button"
          className="px-3.5 py-1.5 rounded-full text-xs font-bold text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer flex items-center gap-1.5"
          onClick={() => setActiveTab("profile")}
        >
          <FileText size={13} className="text-emerald-400" />
          <span>Tài khoản & Lịch sử</span>
        </button>
      </div>

      {/* 3. Right: Search & Action Controls */}
      <div className="flex items-center gap-2 w-full md:w-auto justify-end">
        {/* Search input with clear button */}
        <div className="relative flex-1 md:flex-initial">
          <input
            type="text"
            className="text-input pl-8 pr-7 text-xs w-full md:w-[200px] py-1.5 rounded-full border-orange-200 bg-white"
            placeholder="Tìm tên, mã sản phẩm..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="absolute left-2.5 top-2 text-orange-400" size={14} />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 transition"
              onClick={() => setSearchQuery("")}
              aria-label="Xóa tìm kiếm"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {!isLoggedIn ? (
          <button
            className="hidden md:flex tab-button text-xs py-2 px-3.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-full items-center gap-1.5 cursor-pointer shadow-sm transition shrink-0"
            type="button"
            onClick={() => setShowLoginModal(true)}
          >
            <LockKeyhole size={14} />
            <span>Đăng nhập</span>
          </button>
        ) : (
          <div className="hidden md:flex items-center gap-2 shrink-0">
            {!isAdmin && mode === "customer" && (
              <button
                className="tab-button text-xs py-1.5 px-3.5 bg-orange-100 hover:bg-orange-200 border border-orange-200 font-bold rounded-full flex items-center gap-1.5 cursor-pointer text-orange-900 transition"
                type="button"
                onClick={() => setActiveTab("cart")}
              >
                <ShoppingCart size={14} />
                <span className="font-mono">{formatVnd(cartTotalVal)}</span>
              </button>
            )}

            {/* Functional Notifications Dropdown */}
            <div className="relative">
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center border border-orange-200 text-orange-900 bg-white hover:bg-orange-50 transition cursor-pointer"
                aria-label="Thông báo"
                type="button"
                onClick={() => setIsNotifOpen(!isNotifOpen)}
              >
                <Bell size={15} />
              </button>

              {isNotifOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white border border-orange-200 rounded-2xl p-3 shadow-xl z-50 animate-scale-in text-xs">
                  <div className="flex items-center justify-between border-b border-orange-100 pb-2">
                    <strong className="text-orange-950">Thông báo đại lý</strong>
                    <button
                      type="button"
                      className="text-gray-400 hover:text-gray-600"
                      onClick={() => setIsNotifOpen(false)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <div className="flex flex-col gap-2 mt-2">
                    <div className="p-2 bg-orange-50/60 rounded-xl text-orange-950">
                      <span className="font-bold block text-[11px]">Chiết khấu sỉ theo số lượng</span>
                      <span className="text-[10px] text-orange-800">Đặt từ 20 sản phẩm nhận ngay chiết khấu cấp 1.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
