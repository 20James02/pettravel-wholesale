"use client";

import { Boxes, MessageSquare, PackageCheck, ShoppingCart, User, Menu } from "lucide-react";
import type { AppMode, TabKey } from "../../types";

interface MobileBottomNavProps {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  cartCount: number;
  commentsCount: number;
  isLoggedIn: boolean;
  isAdmin: boolean;
  mode?: AppMode;
  setIsSidebarOpen: (val: boolean) => void;
  setIsChatOpen: (val: boolean | ((prev: boolean) => boolean)) => void;
  setShowLoginModal: (val: boolean) => void;
}

export function MobileBottomNav({
  activeTab,
  setActiveTab,
  cartCount,
  commentsCount,
  isLoggedIn,
  isAdmin,
  setIsSidebarOpen,
  setIsChatOpen,
  setShowLoginModal
}: MobileBottomNavProps) {
  return (
    <nav className="mobile-bottom-nav lg:hidden" aria-label="Thanh điều hướng di động">
      {/* 1. Catalog / Trang chủ sỉ */}
      <button
        type="button"
        className="mobile-nav-item"
        data-active={activeTab === "catalog"}
        onClick={() => setActiveTab("catalog")}
      >
        <div className="nav-icon-container">
          <Boxes size={18} />
        </div>
        <span>Kho hàng</span>
      </button>

      {/* 2. Giỏ hàng sỉ (chỉ hiển thị cho Customer hoặc khi có items) */}
      {!isAdmin && (
        <button
          type="button"
          data-cart-animation-target="true"
          className="mobile-nav-item relative"
          data-active={activeTab === "cart"}
          onClick={() => {
            if (!isLoggedIn) {
              setShowLoginModal(true);
            } else {
              setActiveTab("cart");
            }
          }}
        >
          <div className="nav-icon-container">
            <ShoppingCart size={18} />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-orange-600 text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white animate-scale-in">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </div>
          <span>Đơn sỉ</span>
        </button>
      )}

      {/* 3. Tiến độ đơn hàng */}
      <button
        type="button"
        className="mobile-nav-item"
        data-active={activeTab === "order"}
        onClick={() => {
          if (!isLoggedIn) {
            setShowLoginModal(true);
          } else {
            setActiveTab("order");
          }
        }}
      >
        <div className="nav-icon-container">
          <PackageCheck size={18} />
        </div>
        <span>Tiến độ</span>
      </button>

      {/* 4. Trao đổi đơn */}
      {isLoggedIn && (
        <button
          type="button"
          className="mobile-nav-item relative"
          onClick={() => setIsChatOpen((prev) => !prev)}
        >
          <div className="nav-icon-container">
            <MessageSquare size={18} />
            {commentsCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">
                {commentsCount}
              </span>
            )}
          </div>
          <span>Trao đổi</span>
        </button>
      )}

      {/* 5. Menu / Tài khoản */}
      <button
        type="button"
        className="mobile-nav-item"
        onClick={() => {
          if (!isLoggedIn) {
            setShowLoginModal(true);
          } else {
            setIsSidebarOpen(true);
          }
        }}
      >
        <div className="nav-icon-container">
          {isLoggedIn ? <Menu size={18} /> : <User size={18} />}
        </div>
        <span>{isLoggedIn ? "Menu" : "Đăng nhập"}</span>
      </button>
    </nav>
  );
}
