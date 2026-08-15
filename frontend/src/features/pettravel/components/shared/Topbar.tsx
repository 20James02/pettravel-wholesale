"use client";

import { ShoppingBag, ShoppingCart, Clock, FileText } from "lucide-react";
import type { TabKey, ApiUser } from "../../types";

interface TopbarProps {
  isLoggedIn: boolean;
  activeUser: ApiUser | null;
  isAdmin?: boolean;
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  setShowLoginModal: (val: boolean) => void;
  cartItemsCount?: number;
}

export function Topbar({
  isLoggedIn,
  activeTab,
  setActiveTab,
  setShowLoginModal,
  cartItemsCount = 0
}: TopbarProps) {
  return (
    <header className="w-full flex items-center justify-center sticky top-3.5 z-40 mb-6 pointer-events-auto px-2 animate-fade-in">
      {/* Centered Dynamic Liquid Glass Capsule Dock */}
      <nav
        className="liquid-glass-dock"
        aria-label="Khách hàng Navigation"
      >
        {/* Tab 1: Sản phẩm sỉ */}
        <button
          type="button"
          className={`liquid-glass-tab ${activeTab === "catalog" ? "active" : ""}`}
          onClick={() => setActiveTab("catalog")}
        >
          <ShoppingBag size={15} className="tab-icon-bag" />
          <span>Sản phẩm sỉ</span>
        </button>

        {/* Tab 2: Giỏ hàng & Báo giá */}
        <button
          type="button"
          className={`liquid-glass-tab ${activeTab === "cart" ? "active" : ""}`}
          onClick={() => setActiveTab("cart")}
        >
          <ShoppingCart size={15} className="tab-icon-cart" />
          <span>Giỏ hàng & Báo giá</span>
          {cartItemsCount > 0 && (
            <span className="liquid-cart-badge">{cartItemsCount}</span>
          )}
        </button>

        {/* Tab 3: Theo dõi đơn */}
        <button
          type="button"
          className={`liquid-glass-tab ${activeTab === "order" ? "active" : ""}`}
          onClick={() => setActiveTab("order")}
        >
          <Clock size={15} className="tab-icon-clock" />
          <span>Theo dõi đơn</span>
        </button>

        {/* Tab 4: Tài khoản & Lịch sử */}
        <button
          type="button"
          className={`liquid-glass-tab ${activeTab === "profile" ? "active" : ""}`}
          onClick={() => {
            if (!isLoggedIn) {
              setShowLoginModal(true);
            } else {
              setActiveTab("profile");
            }
          }}
        >
          <FileText size={15} className="tab-icon-file" />
          <span>Tài khoản & Lịch sử</span>
        </button>
      </nav>
    </header>
  );
}
