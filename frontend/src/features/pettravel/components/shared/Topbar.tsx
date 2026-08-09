import { Bell, LockKeyhole, Menu, Search, ShoppingCart } from "lucide-react";
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
    <header className="topbar animate-fade-in">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="lg:hidden p-2 rounded-xl border-2 border-orange-100 hover:border-orange-200 bg-[#FFFDF9] text-orange-950 flex items-center justify-center transition cursor-pointer active:scale-95 mr-1"
          onClick={() => setIsSidebarOpen(true)}
          title="Mở menu quản trị"
        >
          <Menu size={20} />
        </button>
        <div>
          <p className="muted m-0 text-[10px] font-mono font-bold uppercase tracking-wider">
            Cửa hàng sỉ Pet Travel / {!isLoggedIn ? "Khách ghé thăm" : isAdmin ? "Cổng quản trị" : "Cổng Đại lý"}
          </p>
          <h2 className="text-xl font-bold text-[#331B08] mt-1">
            {!isLoggedIn ? "Xin chào đối tác sỉ đáng yêu! 👋" : `Xin chào, ${activeUser?.name || "Đại lý"}! 👋`}
          </h2>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <input
            type="text"
            className="text-input pl-10 text-sm max-w-[200px] pr-4 py-2"
            placeholder="Tìm sản phẩm, SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="absolute left-3 top-3 text-orange-400" size={16} />
        </div>

        {!isLoggedIn ? (
          <>
            <button
              className="tab-button text-xs py-2 px-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl flex items-center gap-1 cursor-pointer transition"
              type="button"
              onClick={() => setShowLoginModal(true)}
            >
              <LockKeyhole size={14} />
              Đăng nhập
            </button>
          </>
        ) : (
          <>
            {!isAdmin && mode === "customer" && (
              <button
                className="tab-button text-xs py-2 px-3 bg-orange-100 hover:bg-orange-200 border-orange-200 font-bold rounded-xl flex items-center gap-1.5 cursor-pointer text-orange-800 transition"
                type="button"
                onClick={() => setActiveTab("cart")}
              >
                <ShoppingCart size={15} />
                <span>Giỏ hàng: {formatVnd(cartTotalVal)}</span>
              </button>
            )}
            <button className="icon-button" aria-label="Thông báo" type="button">
              <Bell size={18} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
