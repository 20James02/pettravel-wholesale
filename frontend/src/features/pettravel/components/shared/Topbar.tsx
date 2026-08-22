"use client";

import { ShoppingBag, ShoppingCart, Clock, FileText, ShieldCheck } from "lucide-react";
import type { TabKey, ApiUser } from "../../types";
import { prefetchRouteData } from "@/lib/prefetch/prefetch-engine";

interface TopbarProps {
  isLoggedIn: boolean;
  activeUser: ApiUser | null;
  isAdmin?: boolean;
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  onRequireLogin: (tab: TabKey) => void;
  cartItemsCount?: number;
}

export function Topbar({
  isLoggedIn,
  isAdmin = false,
  activeTab,
  setActiveTab,
  onRequireLogin,
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
          aria-current={activeTab === "catalog" ? "page" : undefined}
          onPointerEnter={() => prefetchRouteData("catalog")}
          onFocus={() => prefetchRouteData("catalog")}
          onTouchStart={() => prefetchRouteData("catalog")}
        >
          <ShoppingBag size={15} className="tab-icon-bag" />
          <span>Sản phẩm sỉ</span>
        </button>

        {/* Tab 2: Giỏ hàng & Báo giá */}
        <button
          type="button"
          data-cart-animation-target="true"
          className={`liquid-glass-tab ${activeTab === "cart" ? "active" : ""}`}
          onClick={() => (isLoggedIn ? setActiveTab("cart") : onRequireLogin("cart"))}
          aria-current={activeTab === "cart" ? "page" : undefined}
          onPointerEnter={() => prefetchRouteData("cart")}
          onFocus={() => prefetchRouteData("cart")}
          onTouchStart={() => prefetchRouteData("cart")}
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
          onClick={() => (isLoggedIn ? setActiveTab("order") : onRequireLogin("order"))}
          aria-current={activeTab === "order" ? "page" : undefined}
          onPointerEnter={() => prefetchRouteData("order")}
          onFocus={() => prefetchRouteData("order")}
          onTouchStart={() => prefetchRouteData("order")}
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
              onRequireLogin("profile");
            } else if (isAdmin) {
              setActiveTab("admin");
            } else {
              setActiveTab("profile");
            }
          }}
          aria-current={activeTab === "profile" ? "page" : undefined}
          onPointerEnter={() => prefetchRouteData("profile")}
          onFocus={() => prefetchRouteData("profile")}
          onTouchStart={() => prefetchRouteData("profile")}
        >
          <FileText size={15} className="tab-icon-file" />
          <span>{isAdmin ? "Hồ sơ Admin" : "Tài khoản & Lịch sử"}</span>
        </button>

        {/* Tab 5 (Admin Portal quick badge): Cổng Quản trị Admin */}
        {isAdmin && (
          <button
            type="button"
            className={`liquid-glass-tab font-extrabold ${activeTab.startsWith("admin") || activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("admin")}
            aria-current={activeTab.startsWith("admin") || activeTab === "settings" ? "page" : undefined}
            onPointerEnter={() => prefetchRouteData("admin")}
            onFocus={() => prefetchRouteData("admin")}
            onTouchStart={() => prefetchRouteData("admin")}
          >
            <ShieldCheck size={15} className="text-orange-600" />
            <span className="text-orange-950 font-bold">Cổng Quản Trị</span>
          </button>
        )}
      </nav>
    </header>
  );
}
