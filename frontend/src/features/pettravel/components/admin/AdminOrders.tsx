import { useMemo } from "react";
import Image from "next/image";
import { AlertTriangle, CheckCircle2, LockKeyhole, ShieldCheck, Truck } from "lucide-react";
import type { CustomerOrder, Supplier, Product } from "@/lib/domain";
import type { ApiUser } from "../../types";
import { formatVnd } from "@/lib/money";
import { StatusPill } from "../ui/StatusPill";

interface AdminOrdersProps {
  allOrders: CustomerOrder[];
  workingOrder: CustomerOrder;
  currentUser: ApiUser | null;
  suppliers: Supplier[];
  allProducts: Product[];
  allCategories: string[];
  adminDiscount: number;
  setAdminDiscount: (val: number) => void;
  adminShippingFee: number;
  setAdminShippingFee: (val: number) => void;
  shippingFeeOption: "included" | "separate_cod";
  setShippingFeeOption: (val: "included" | "separate_cod") => void;
  customDepositInput: string;
  setCustomDepositInput: (val: string) => void;
  isManagerApproved: boolean;
  setIsManagerApproved: (val: boolean) => void;
  adminCategoryFilter: string;
  setAdminCategoryFilter: (val: string) => void;
  adminSupplierFilter: string;
  setAdminSupplierFilter: (val: string) => void;
  isOrderModified: boolean;
  isOrderFrozen: boolean;
  requiresManagerApproval: boolean;
  selectOrder: (id: string) => void;
  setSelectedOrderId: (id: string | null) => void;
  setWorkingOrder: (order: CustomerOrder) => void;
  handleAdminQtyChange: (itemId: string, qty: number) => void;
  handlePublishQuote: () => void;
  confirmDeposit: () => void;
  attachShipment: () => void;
  handleStockReservationAction: (action: string) => void;
  handlePostOrderAccounting: (action: "post_all" | "post_confirmed_payments") => void;
  addComment: (audience: "customer_visible" | "internal", message: string) => void;
}

export function AdminOrders({
  allOrders,
  workingOrder,
  currentUser,
  suppliers,
  allProducts,
  allCategories,
  adminDiscount,
  setAdminDiscount,
  adminShippingFee,
  setAdminShippingFee,
  shippingFeeOption,
  setShippingFeeOption,
  customDepositInput,
  setCustomDepositInput,
  isManagerApproved,
  setIsManagerApproved,
  adminCategoryFilter,
  setAdminCategoryFilter,
  adminSupplierFilter,
  setAdminSupplierFilter,
  isOrderModified,
  isOrderFrozen,
  requiresManagerApproval,
  selectOrder,
  setSelectedOrderId,
  setWorkingOrder,
  handleAdminQtyChange,
  handlePublishQuote,
  confirmDeposit,
  attachShipment,
  handleStockReservationAction,
  handlePostOrderAccounting,
  addComment
}: AdminOrdersProps) {
  // Lấy bản báo giá cuối cùng
  const quote = useMemo(() => {
    if (!workingOrder.quoteVersions || workingOrder.quoteVersions.length === 0) {
      return null;
    }
    return workingOrder.quoteVersions[workingOrder.quoteVersions.length - 1];
  }, [workingOrder.quoteVersions]);

  // Map supplier ID sang Name để hiển thị
  const visibleSupplierName = (supplierId: string) => {
    const found = suppliers.find((s) => s.id === supplierId);
    return found ? found.name : "Nhà cung cấp nội bộ";
  };

  // Tạo danh mục động dùng lọc
  const availableCategories = useMemo(() => {
    const catsFromProducts = allProducts.map((p) => p.category).filter(Boolean);
    const catsFromDb = allCategories.filter(Boolean);
    return ["Tất cả", ...Array.from(new Set([...catsFromProducts, ...catsFromDb]))];
  }, [allProducts, allCategories]);

  // Lọc sản phẩm sỉ của đơn hàng cho Admin
  const filteredAdminOrderItems = useMemo(() => {
    if (!workingOrder.items) return [];
    return workingOrder.items.filter((item) => {
      const parent = allProducts.find((p) => p.code === item.productCode);
      const category = parent?.category ?? "Tất cả";

      const matchCategory = adminCategoryFilter === "Tất cả" || category === adminCategoryFilter;
      const matchSupplier = adminSupplierFilter === "Tất cả" || item.supplierId === adminSupplierFilter;

      return matchCategory && matchSupplier;
    });
  }, [workingOrder.items, allProducts, adminCategoryFilter, adminSupplierFilter]);

  // Kiểm tra gán quyền cho Admin
  const isLockedByOther = useMemo(() => {
    if (!workingOrder.id) return false;
    return (
      workingOrder.assignedStaffId &&
      workingOrder.assignedStaffId !== currentUser?.id &&
      currentUser?.role !== "super_admin"
    );
  }, [workingOrder.id, workingOrder.assignedStaffId, currentUser]);

  const latestQuote = (ord: CustomerOrder) => {
    if (!ord.quoteVersions || ord.quoteVersions.length === 0) {
      return { finalTotal: 0 };
    }
    return ord.quoteVersions[ord.quoteVersions.length - 1];
  };

  if (workingOrder.id === "") {
    return (
      <div className="panel flex flex-col gap-6 w-full animate-fade-in">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold text-[#331B08] flex items-center gap-2 font-['Varela_Round']">
            📋 Danh sách Đơn hàng sỉ
          </h2>
          <p className="muted text-xs">
            Chọn một đơn hàng từ danh sách dưới đây để tiến hành thẩm định chi phí, báo giá, phát hành VietQR hoặc đối soát dòng tiền
            thực tế.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {allOrders.length === 0 ? (
            <div className="p-8 text-center muted text-sm font-semibold border-2 border-dashed border-orange-100 rounded-2xl bg-[#FFFDF9]">
              Chưa có đơn sỉ nào được đề xuất.
            </div>
          ) : (
            allOrders.map((ord) => {
              const q = latestQuote(ord);
              return (
                <div
                  key={ord.id}
                  className="p-5 border-2 border-orange-100 hover:border-orange-500 rounded-2xl bg-white hover:-translate-y-0.5 transition flex flex-col md:flex-row justify-between items-start md:items-center gap-4 cursor-pointer"
                  onClick={() => selectOrder(ord.id)}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-[#331B08]">{ord.number}</span>
                      <span
                        className={`status-pill text-[10px] ${ord.commercialStatus === "locked" ? "success" : ord.commercialStatus === "quoted" ? "info" : "warning"}`}
                      >
                        {ord.commercialStatus === "submitted"
                          ? "Chờ duyệt giá"
                          : ord.commercialStatus === "quoted"
                            ? "Đã báo giá"
                            : ord.commercialStatus === "customer_accepted"
                              ? "Chờ cọc"
                              : ord.commercialStatus === "locked"
                                ? "Chờ đóng hàng"
                                : "Hoàn tất"}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-[#78350F]">
                      {ord.customerName} · {ord.customerCompany}
                    </span>
                    <span className="muted text-[10px]">
                      {ord.items.length} mặt hàng sỉ · Cập nhật:{" "}
                      {new Date(ord.updatedAt).toLocaleTimeString("vi-VN")} {new Date(ord.updatedAt).toLocaleDateString("vi-VN")}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                    <div className="text-right flex flex-col">
                      <span className="text-[10px] muted font-bold">TỔNG ĐƠN SỈ</span>
                      <strong className="text-sm text-orange-950 font-extrabold">{formatVnd(q.finalTotal)}</strong>
                    </div>
                    <button
                      type="button"
                      className="tab-button bg-orange-500 text-white border-orange-600 hover:bg-orange-600 text-xs py-2 px-4 cursor-pointer font-bold rounded-xl"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectOrder(ord.id);
                      }}
                    >
                      Xử lý đơn
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full animate-fade-in">
      {/* Back to list and quick switcher */}
      <div className="panel p-4 bg-orange-50/50 border border-orange-100 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="tab-button text-xs py-1.5 px-3 bg-white hover:bg-orange-100 font-bold border-orange-200 rounded-xl"
            onClick={() => {
              setSelectedOrderId(null);
              setWorkingOrder({
                id: "",
                number: "",
                customerName: "",
                customerCompany: "",
                customerId: "",
                commercialStatus: "draft",
                paymentStatus: "unrequested",
                fulfillmentStatus: "not_started",
                paymentIntent: "deposit_cod",
                invoiceRequested: false,
                updatedAt: new Date().toISOString(),
                items: [],
                quoteVersions: [],
                paymentRequests: [],
                paymentProofs: [],
                fulfillmentGroups: [],
                comments: []
              });
            }}
          >
            ← Quay lại danh sách
          </button>
          <span className="text-sm font-bold text-[#331B08]">
            Đang xử lý đơn: <span className="text-orange-600">{workingOrder.number}</span> ({workingOrder.customerName})
          </span>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold text-orange-950 shrink-0">Chuyển nhanh đơn:</span>
          <select
            className="text-input text-xs py-1.5 px-2 bg-white border border-orange-200 rounded-xl flex-grow sm:flex-none sm:w-[200px] font-semibold"
            value={workingOrder.id}
            onChange={(e) => selectOrder(e.target.value)}
          >
            {allOrders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.number} - {o.customerName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* WARNING BANNER FOR LOCKED ORDER */}
      {isLockedByOther ? (
        <div className="p-4 bg-red-50 border-2 border-red-200 text-red-950 rounded-2xl flex items-center gap-3 animate-fade-in">
          <span className="text-2xl">🔒</span>
          <div>
            <h4 className="font-extrabold text-sm m-0">Đơn hàng này đã bị khóa thao tác!</h4>
            <p className="m-0 text-xs mt-1">
              Đơn hàng này đã được gán cho nhân viên <strong>{workingOrder.assignedStaffName || "khác"}</strong> phụ trách. Bạn chỉ
              có quyền xem chi tiết và trao đổi nội bộ, không thể thay đổi số lượng, báo giá hay xác nhận giao dịch.
            </p>
          </div>
        </div>
      ) : workingOrder.assignedStaffId ? (
        <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-950 rounded-2xl flex items-center gap-2.5 animate-fade-in">
          <span className="text-lg">👤</span>
          <p className="m-0 text-xs font-bold">Đơn hàng được gán cho bạn phụ trách xử lý ({workingOrder.assignedStaffName}).</p>
        </div>
      ) : null}

      <section className="grid-dashboard">
        <div className="flex flex-col gap-4">
          {/* Danh sách sản phẩm sỉ trong đơn */}
          <div className="panel flex flex-col gap-4">
            <div className="section-title flex justify-between items-center">
              <h3 className="text-lg font-bold">📦 Sản phẩm sỉ trong đơn hàng</h3>
              {isOrderModified && (
                <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">
                  Đã chỉnh sửa (Chưa lưu)
                </span>
              )}
            </div>

            {/* Bộ lọc sản phẩm sỉ dành cho Admin */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-orange-50/30 rounded-2xl border border-orange-100">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-orange-950/80 uppercase">Lọc theo phân loại</label>
                <select
                  className="text-input text-xs py-1.5 px-2 bg-white border border-orange-200 rounded-xl"
                  value={adminCategoryFilter}
                  onChange={(e) => setAdminCategoryFilter(e.target.value)}
                >
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat === "Tất cả" ? "Tất cả phân loại" : cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-orange-950/80 uppercase">Lọc theo nhà cung cấp</label>
                <select
                  className="text-input text-xs py-1.5 px-2 bg-white border border-orange-200 rounded-xl"
                  value={adminSupplierFilter}
                  onChange={(e) => setAdminSupplierFilter(e.target.value)}
                >
                  <option value="Tất cả">Tất cả nhà cung cấp</option>
                  {suppliers.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="variant-table w-full">
                <thead>
                  <tr>
                    <th>Ảnh/Mã</th>
                    <th>Sản phẩm sỉ & Nhà cung cấp</th>
                    <th className="text-center w-28">Số lượng</th>
                    <th className="text-right">Đơn giá sỉ</th>
                    <th className="text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdminOrderItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-6 muted text-xs font-semibold">
                        Không tìm thấy sản phẩm sỉ phù hợp với bộ lọc.
                      </td>
                    </tr>
                  ) : (
                    filteredAdminOrderItems.map((item) => {
                      const parent = allProducts.find((p) => p.code === item.productCode);
                      const image = parent?.imageUrl ?? "/product-food.svg";
                      return (
                        <tr key={item.id} className={item.quantity === 0 ? "opacity-50 bg-gray-50/50" : ""}>
                          <td className="w-16">
                            <div className="relative w-10 h-10 rounded-xl overflow-hidden border bg-orange-50 flex items-center justify-center p-1 shrink-0">
                              <Image src={image} alt={item.productName} fill sizes="40px" className="object-cover" />
                            </div>
                            <span className="text-[8px] font-mono font-bold text-orange-900 block mt-1 text-center">
                              {item.variantSku}
                            </span>
                          </td>
                          <td>
                            <strong className="text-xs text-[#331B08] block">{item.productName}</strong>
                            <span className="text-[10px] text-gray-500 font-semibold block">{item.variantLabel}</span>
                            <span className="text-[9px] bg-blue-50 text-blue-800 px-2 py-0.5 rounded-full font-bold inline-block mt-1">
                              🏭 {visibleSupplierName(item.supplierId)}
                            </span>
                          </td>
                          <td className="text-center">
                            <div className="flex items-center justify-center gap-1 border border-orange-200 rounded-xl p-0.5 bg-orange-50/25 max-w-[100px] mx-auto">
                              <button
                                type="button"
                                className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-xs font-bold text-[#78350F] shadow-sm active:scale-90 cursor-pointer disabled:opacity-40"
                                disabled={isOrderFrozen}
                                onClick={() => handleAdminQtyChange(item.id, item.quantity - 1)}
                              >
                                -
                              </button>
                              <input
                                type="number"
                                className="w-8 text-center text-xs font-bold bg-transparent border-0 focus:ring-0 p-0"
                                disabled={isOrderFrozen}
                                value={item.quantity}
                                onChange={(e) => handleAdminQtyChange(item.id, parseInt(e.target.value, 10) || 0)}
                              />
                              <button
                                type="button"
                                className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-xs font-bold text-[#78350F] shadow-sm active:scale-90 cursor-pointer disabled:opacity-40"
                                disabled={isOrderFrozen}
                                onClick={() => handleAdminQtyChange(item.id, item.quantity + 1)}
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="text-right text-xs text-[#78350F] font-semibold">{formatVnd(item.unitPriceSnapshot)}</td>
                          <td className="text-right text-xs font-bold text-[#331B08]">
                            {formatVnd(item.quantity * item.unitPriceSnapshot)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          {/* Thẩm định Chi phí, Báo giá & Đặt cọc */}
          <div className="panel flex flex-col gap-4">
            <div className="section-title">
              <h3 className="text-lg font-bold">1. Chi phí & Báo giá</h3>
              <StatusPill tone={isOrderFrozen ? "warning" : "info"}>
                {isOrderFrozen ? "Đơn đã khóa" : "Thẩm định sỉ"}
              </StatusPill>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-orange-950/80">Chiết khấu sỉ giảm giá (VND)</label>
                <input
                  type="number"
                  className="text-input text-xs py-2 px-3"
                  disabled={isOrderFrozen}
                  value={adminDiscount}
                  onChange={(e) => setAdminDiscount(parseInt(e.target.value, 10) || 0)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-orange-950/80">Phí vận chuyển (VND)</label>
                  <input
                    type="number"
                    className="text-input text-xs py-2 px-3"
                    disabled={isOrderFrozen || shippingFeeOption === "separate_cod"}
                    value={shippingFeeOption === "separate_cod" ? 0 : adminShippingFee}
                    onChange={(e) => setAdminShippingFee(parseInt(e.target.value, 10) || 0)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-orange-950/80">Phương thức tính phí</label>
                  <div className="flex flex-col gap-1 mt-1">
                    <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                      <input
                        type="radio"
                        name="ship_opt"
                        disabled={isOrderFrozen}
                        checked={shippingFeeOption === "included"}
                        onChange={() => setShippingFeeOption("included")}
                      />
                      Cộng vào đơn
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                      <input
                        type="radio"
                        name="ship_opt"
                        disabled={isOrderFrozen}
                        checked={shippingFeeOption === "separate_cod"}
                        onChange={() => {
                          setShippingFeeOption("separate_cod");
                          setAdminShippingFee(0);
                        }}
                      />
                      Khách trả COD
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1 border-t border-dashed border-orange-100 pt-3">
                <label className="text-xs font-bold text-orange-950/80">Số tiền cọc gửi (VND)</label>
                <input
                  type="number"
                  className="text-input text-xs py-2 px-3"
                  disabled={isOrderFrozen}
                  placeholder={formatVnd(quote?.depositAmount || 0)}
                  value={customDepositInput}
                  onChange={(e) => setCustomDepositInput(e.target.value)}
                />
                <span className="text-[10px] muted">Mặc định: 30% tổng đơn nếu bỏ trống.</span>
              </div>

              {requiresManagerApproval && !isManagerApproved && (
                <div className="p-3 border-2 border-dashed border-red-200 bg-red-50/20 rounded-2xl flex flex-col gap-2 mt-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={16} />
                    <div>
                      <strong className="text-xs text-red-950 block">Vượt hạn mức chiết khấu Operator!</strong>
                      <p className="text-[10px] text-red-900 m-0 mt-0.5 leading-relaxed font-bold">
                        Cần Quản lý ký số phê duyệt để tiếp tục áp dụng mức giảm giá này.
                      </p>
                    </div>
                  </div>
                  <button
                    className="tab-button text-xs py-2 w-max text-red-700 border-red-300 hover:bg-red-50 cursor-pointer"
                    type="button"
                    onClick={() => {
                      setIsManagerApproved(true);
                      addComment("internal", "Quản lý (Manager) đã kiểm tra và phê duyệt mức chiết khấu sỉ đặc biệt cho đơn này.");
                    }}
                  >
                    <ShieldCheck size={14} /> Ký phê duyệt
                  </button>
                </div>
              )}

              {isManagerApproved && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-xs text-green-800 font-bold">
                  <CheckCircle2 size={16} className="text-green-600" /> Quản lý đã duyệt hạn mức!
                </div>
              )}

              <button
                className={`primary-button text-xs py-3 justify-center w-full mt-2 font-bold cursor-pointer transition rounded-xl ${
                  isOrderModified
                    ? "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-md"
                    : "bg-orange-500 text-white border-orange-600 hover:bg-orange-600"
                }`}
                type="button"
                disabled={isOrderFrozen || (requiresManagerApproval && !isManagerApproved)}
                onClick={handlePublishQuote}
              >
                📬 Gửi khách xác nhận
              </button>
            </div>
          </div>

          {/* Kế toán đối soát */}
          <div className="panel flex flex-col gap-4">
            <div className="section-title">
              <h3 className="text-lg font-bold">2. Đối soát dòng tiền</h3>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <div className="p-3 border-2 border-orange-100 rounded-2xl bg-[#FFFDF9] flex flex-col gap-2">
                <strong className="text-xs text-[#331B08] block">Trạng thái dòng tiền sỉ:</strong>
                <div className="flex justify-between items-center py-1 border-b border-dashed border-orange-100">
                  <span>Yêu cầu chuyển khoản:</span>
                  <strong>{formatVnd(workingOrder.paymentRequests[workingOrder.paymentRequests.length - 1]?.amount || 0)}</strong>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span>Trạng thái chứng từ:</span>
                  <div>
                    {workingOrder.paymentStatus === "deposit_uploaded" || workingOrder.paymentStatus === "full_uploaded" ? (
                      <span className="status-pill warning text-[9px]">Chờ đối soát biên lai</span>
                    ) : workingOrder.paymentStatus.includes("confirmed") || workingOrder.paymentStatus === "paid" ? (
                      <span className="status-pill success text-[9px]">Đã nhận tiền sỉ</span>
                    ) : (
                      <span className="status-pill info text-[9px]">Chờ thanh toán</span>
                    )}
                  </div>
                </div>
              </div>

              {workingOrder.paymentProofs && workingOrder.paymentProofs.length > 0 && (
                <div className="p-3 border-2 border-orange-100 rounded-2xl bg-[#FFFDF9] flex flex-col gap-3">
                  <div>
                    <strong className="text-xs text-[#331B08] block">Ảnh biên lai đại lý gửi:</strong>
                    <p className="muted text-[10px] m-0 mt-0.5">{workingOrder.paymentProofs[0].fileName}</p>
                  </div>

                  <div className="aspect-video w-full rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center font-bold text-orange-950/70 text-xs">
                    [ HÌNH ẢNH BIÊN LAI ]
                  </div>

                  {workingOrder.paymentProofs[0].status === "pending_admin_confirmation" ? (
                    <button
                      type="button"
                      className="tab-button py-2 w-full justify-center bg-green-500 text-white border-green-600 hover:bg-green-600 font-bold cursor-pointer"
                      onClick={confirmDeposit}
                    >
                      Xác nhận Nhận đủ tiền
                    </button>
                  ) : (
                    <div className="p-2.5 bg-green-50 border border-green-200 rounded-xl text-green-800 font-bold text-center">
                      ✓ Giao dịch đã xác nhận thành công
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Bàn giao vận chuyển */}
          <div className="panel flex flex-col gap-4">
            <div className="section-title">
              <h3 className="text-lg font-bold">3. Kho hàng & Vận chuyển</h3>
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                className="tab-button text-xs py-3 justify-center w-full bg-blue-600 text-white border-blue-700 hover:bg-blue-700 cursor-pointer font-bold rounded-xl flex items-center justify-center gap-1.5"
                disabled={
                  workingOrder.fulfillmentStatus === "shipped" ||
                  (!workingOrder.paymentStatus.includes("confirmed") && workingOrder.paymentStatus !== "paid")
                }
                onClick={attachShipment}
              >
                <Truck size={15} /> Bàn giao GHN (Mã vận đơn)
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="tab-button text-[10px] py-2 justify-center border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 cursor-pointer font-bold rounded-xl flex items-center justify-center gap-1"
                  disabled={!["customer_accepted", "locked"].includes(workingOrder.commercialStatus)}
                  onClick={() => handleStockReservationAction("reserve_order")}
                >
                  <LockKeyhole size={13} /> Giữ hàng 72h
                </button>
                <button
                  type="button"
                  className="tab-button text-[10px] py-2 justify-center border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100 cursor-pointer font-bold rounded-xl"
                  onClick={() => handleStockReservationAction("release_order")}
                >
                  Nhả giữ hàng
                </button>
                <button
                  type="button"
                  className="tab-button text-[10px] py-2 justify-center border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 cursor-pointer font-bold rounded-xl"
                  onClick={() => handleStockReservationAction("expire_order")}
                >
                  Hết hạn giữ
                </button>
                <button
                  type="button"
                  className="tab-button text-[10px] py-2 justify-center border-green-200 bg-green-50 text-green-800 hover:bg-green-100 cursor-pointer font-bold rounded-xl"
                  onClick={() => handleStockReservationAction("consume_order")}
                >
                  Chốt đã xuất
                </button>
              </div>
              <div className="p-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 flex flex-col gap-2">
                <div>
                  <strong className="text-xs text-emerald-950 block">Ghi sổ kế toán đơn hiện tại</strong>
                  <p className="text-[10px] muted m-0 mt-0.5">
                    Tự post thu tiền đã xác nhận, công nợ phải thu, doanh thu và giá vốn nếu đơn đã chốt xuất kho.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    className="tab-button text-[10px] py-2 justify-center border-emerald-200 bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer font-bold rounded-xl"
                    disabled={
                      !workingOrder.id ||
                      !["deposit_confirmed", "paid", "cod_remaining"].includes(workingOrder.paymentStatus)
                    }
                    onClick={() => handlePostOrderAccounting("post_all")}
                  >
                    Ghi sổ toàn bộ đơn
                  </button>
                  <button
                    type="button"
                    className="tab-button text-[10px] py-2 justify-center border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50 cursor-pointer font-bold rounded-xl"
                    disabled={
                      !workingOrder.id ||
                      !["deposit_confirmed", "paid", "cod_remaining"].includes(workingOrder.paymentStatus)
                    }
                    onClick={() => handlePostOrderAccounting("post_confirmed_payments")}
                  >
                    Chỉ ghi nhận tiền đã thu
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
