import {
  Boxes,
  Building2,
  LogOut,
  PackageCheck,
  Percent,
  Search,
  ShoppingCart,
  SplitSquareVertical,
  UserRound,
  Users,
  WalletCards,
  ReceiptText,
  BarChart3,
  X,
  MessageSquare
} from "lucide-react";
import type { AppMode, TabKey, ApiUser } from "../../types";
import { formatVnd } from "@/lib/money";

interface SidebarProps {
  isLoggedIn: boolean;
  activeUser: ApiUser | null;
  activeTab: TabKey;
  mode: AppMode;
  cartItemsCount: number;
  cartTotalVal: number;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (val: boolean) => void;
  setActiveTab: (tab: TabKey) => void;
  setShowLoginModal: (val: boolean) => void;
  handleLogout: () => void;
  fetchUsers?: () => void;
  fetchPromotions?: () => void;
  fetchReportsOverview?: () => void;
  fetchOperationsOverview?: () => void;
  fetchAccountingOverview?: () => void;
  fetchAccountingJournalEntries?: () => void;
}

export function Sidebar({
  isLoggedIn,
  activeUser,
  activeTab,
  mode,
  cartItemsCount,
  cartTotalVal,
  isSidebarOpen,
  setIsSidebarOpen,
  setActiveTab,
  setShowLoginModal,
  handleLogout,
  fetchUsers,
  fetchPromotions,
  fetchReportsOverview,
  fetchOperationsOverview,
  fetchAccountingOverview,
  fetchAccountingJournalEntries
}: SidebarProps) {
  return (
    <aside className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
      {/* Mobile Header with close button */}
      <div className="flex justify-between items-center w-full lg:hidden mb-2">
        <div className="flex items-center gap-3">
          <div className="brand-mark">🐾</div>
          <div>
            <h1 className="text-lg font-bold leading-none">Pet Travel</h1>
            <p className="muted text-xs font-semibold mt-1">Cổng Bán Sỉ Đối Tác</p>
          </div>
        </div>
        <button
          type="button"
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-orange-100 text-orange-950 transition cursor-pointer"
          onClick={() => setIsSidebarOpen(false)}
        >
          <X size={18} />
        </button>
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:flex items-center gap-3">
        <div className="brand-mark">🐾</div>
        <div>
          <h1 className="text-lg font-bold leading-none">Pet Travel</h1>
          <p className="muted text-xs font-semibold mt-1">Cổng Bán Sỉ Đối Tác</p>
        </div>
      </div>

      {/* LOGGED IN ACCOUNT CARD */}
      {!isLoggedIn ? (
        <div className="panel p-4 bg-[#FFFDF9] border border-orange-100 rounded-2xl flex flex-col gap-2">
          <p className="m-0 text-xs font-bold text-[#331B08]/70">Chào mừng khách ghé thăm!</p>
          <button
            type="button"
            className="w-full text-xs font-bold py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl cursor-pointer"
            onClick={() => setShowLoginModal(true)}
          >
            Đăng nhập Đại lý
          </button>
        </div>
      ) : (
        <div className="panel p-4 bg-[#FFFDF9] border border-orange-100 rounded-2xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-sm">
              {activeUser?.name?.charAt(0) || "U"}
            </div>
            <div>
              <p className="m-0 text-sm font-bold text-[#331B08]">{activeUser?.name}</p>
              <p className="muted m-0 text-xs">{activeUser?.company} · {activeUser?.role}</p>
            </div>
          </div>
          <button
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-red-50 text-red-500 hover:text-red-600 transition"
            title="Đăng xuất"
            type="button"
            onClick={handleLogout}
          >
            <LogOut size={16} />
          </button>
        </div>
      )}

      {/* NAVIGATION TABS */}
      <nav className="tabs flex flex-col gap-2 mt-2" aria-label="Điều hướng">
        {!isLoggedIn ? (
          <button
            className="tab-button w-full justify-start"
            type="button"
            data-active={activeTab === "catalog"}
            onClick={() => {
              setActiveTab("catalog");
              setIsSidebarOpen(false);
            }}
          >
            <Search size={18} />
            Cửa hàng bán sỉ
          </button>
        ) : mode === "customer" ? (
          <>
            <button
              className="tab-button w-full justify-start"
              type="button"
              data-active={activeTab === "catalog"}
              onClick={() => {
                setActiveTab("catalog");
                setIsSidebarOpen(false);
              }}
            >
              <Boxes size={18} />
              Cửa hàng bán sỉ
            </button>
            <button
              className="tab-button w-full justify-start"
              type="button"
              data-active={activeTab === "cart"}
              onClick={() => {
                setActiveTab("cart");
                setIsSidebarOpen(false);
              }}
            >
              <ShoppingCart size={18} />
              Giỏ hàng của tôi
              {cartItemsCount > 0 && (
                <span className="ml-auto bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                  {formatVnd(cartTotalVal)}
                </span>
              )}
            </button>
            <button
              className="tab-button w-full justify-start"
              type="button"
              data-active={activeTab === "order"}
              onClick={() => {
                setActiveTab("order");
                setIsSidebarOpen(false);
              }}
            >
              <MessageSquare size={18} />
              Trực phòng đơn hàng
            </button>
            <button
              className="tab-button w-full justify-start"
              type="button"
              data-active={activeTab === "profile"}
              onClick={() => {
                setActiveTab("profile");
                setIsSidebarOpen(false);
              }}
            >
              <UserRound size={18} />
              Hồ sơ & Đơn sỉ của tôi
            </button>
          </>
        ) : (
          <>
            <button
              className="tab-button w-full justify-start"
              type="button"
              data-active={activeTab === "admin"}
              onClick={() => {
                setActiveTab("admin");
                setIsSidebarOpen(false);
              }}
            >
              <SplitSquareVertical size={18} />
              Quản lý đơn hàng
            </button>
            <button
              className="tab-button w-full justify-start"
              type="button"
              data-active={activeTab === "admin_products"}
              onClick={() => {
                setActiveTab("admin_products");
                setIsSidebarOpen(false);
              }}
            >
              <Boxes size={18} />
              Quản lý sản phẩm
            </button>
            <button
              className="tab-button w-full justify-start"
              type="button"
              data-active={activeTab === "admin_suppliers"}
              onClick={() => {
                setActiveTab("admin_suppliers");
                setIsSidebarOpen(false);
              }}
            >
              <Building2 size={18} />
              Quản lý nhà cung cấp
            </button>
            <button
              className="tab-button w-full justify-start"
              type="button"
              data-active={activeTab === "admin_categories"}
              onClick={() => {
                setActiveTab("admin_categories");
                setIsSidebarOpen(false);
              }}
            >
              <Boxes size={18} />
              Quản lý danh mục
            </button>
            <button
              className="tab-button w-full justify-start"
              type="button"
              data-active={activeTab === "admin_users"}
              onClick={() => {
                setActiveTab("admin_users");
                if (fetchUsers) fetchUsers();
                setIsSidebarOpen(false);
              }}
            >
              <Users size={18} />
              Quản lý tài khoản
            </button>
            <button
              className="tab-button w-full justify-start"
              type="button"
              data-active={activeTab === "admin_promotions"}
              onClick={() => {
                setActiveTab("admin_promotions");
                if (fetchPromotions) fetchPromotions();
                setIsSidebarOpen(false);
              }}
            >
              <Percent size={18} />
              Cấu hình ưu đãi
            </button>
            <button
              className="tab-button w-full justify-start"
              type="button"
              data-active={activeTab === "admin_reconciliation"}
              onClick={() => {
                setActiveTab("admin_reconciliation");
                if (fetchReportsOverview) fetchReportsOverview();
                setIsSidebarOpen(false);
              }}
            >
              <WalletCards size={18} />
              Đối soát & Sao kê
            </button>
            <button
              className="tab-button w-full justify-start"
              type="button"
              data-active={activeTab === "admin_operations"}
              onClick={() => {
                setActiveTab("admin_operations");
                if (fetchOperationsOverview) fetchOperationsOverview();
                setIsSidebarOpen(false);
              }}
            >
              <PackageCheck size={18} />
              Kho & Mua hàng
            </button>
            <button
              className="tab-button w-full justify-start"
              type="button"
              data-active={activeTab === "admin_accounting"}
              onClick={() => {
                setActiveTab("admin_accounting");
                if (fetchAccountingOverview) fetchAccountingOverview();
                if (fetchAccountingJournalEntries) fetchAccountingJournalEntries();
                setIsSidebarOpen(false);
              }}
            >
              <ReceiptText size={18} />
              Kế toán tổng hợp
            </button>
            <button
              className="tab-button w-full justify-start"
              type="button"
              data-active={activeTab === "admin_reports"}
              onClick={() => {
                setActiveTab("admin_reports");
                if (fetchReportsOverview) fetchReportsOverview();
                setIsSidebarOpen(false);
              }}
            >
              <BarChart3 size={18} />
              Báo cáo quản trị
            </button>
          </>
        )}
      </nav>
    </aside>
  );
}
