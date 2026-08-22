"use client";

import { useMemo } from "react";
import Image from "next/image";
import { AlertCircle, ArrowRight, CheckCircle2, ShieldCheck, ShoppingCart, Trash2, Truck } from "lucide-react";
import type { OrderItem, Product } from "@/lib/domain";
import { formatVnd } from "@/lib/money";
import { BottomSheet } from "../ui/BottomSheet";

interface CartProps {
  cartItems: OrderItem[];
  allProducts: Product[];
  availableCategories: string[];
  cartCategoryFilter: string;
  setCartCategoryFilter: (cat: string) => void;
  cartTotalVal: number;
  paymentIntent: "deposit_cod" | "pay_full";
  changePaymentIntent: (intent: "deposit_cod" | "pay_full") => void;
  updateCartQty: (sku: string, delta: number) => void;
  removeCartItem: (sku: string) => void;
  onSubmitCartProposal: () => void;
  showCheckoutModal: boolean;
  setShowCheckoutModal: (val: boolean) => void;
  recipientName: string;
  setRecipientName: (val: string) => void;
  recipientPhone: string;
  setRecipientPhone: (val: string) => void;
  recipientAddress: string;
  setRecipientAddress: (val: string) => void;
  customerTaxCode: string;
  setCustomerTaxCode: (val: string) => void;
  customerNote: string;
  setCustomerNote: (val: string) => void;
  onConfirmCheckout: () => void;
}

export function Cart({
  cartItems,
  allProducts,
  availableCategories,
  cartCategoryFilter,
  setCartCategoryFilter,
  cartTotalVal,
  paymentIntent,
  changePaymentIntent,
  updateCartQty,
  removeCartItem,
  onSubmitCartProposal,
  showCheckoutModal,
  setShowCheckoutModal,
  recipientName,
  setRecipientName,
  recipientPhone,
  setRecipientPhone,
  recipientAddress,
  setRecipientAddress,
  customerTaxCode,
  setCustomerTaxCode,
  customerNote,
  setCustomerNote,
  onConfirmCheckout
}: CartProps) {
  // Nhóm các items trong giỏ hàng theo code sản phẩm
  const groupedCartItems = useMemo(() => {
    const groups: Record<
      string,
      {
        productCode: string;
        productName: string;
        productImage: string;
        category: string;
        brand: string;
        items: OrderItem[];
      }
    > = {};

    cartItems.forEach((item) => {
      const parent = allProducts.find((p) => p.code === item.productCode);
      const category = parent?.category ?? "Tất cả";
      const brand = parent?.brand ?? "";
      const image = parent?.imageUrl ?? "/product-food.svg";

      if (!groups[item.productCode]) {
        groups[item.productCode] = {
          productCode: item.productCode,
          productName: item.productName,
          productImage: image,
          category,
          brand,
          items: []
        };
      }
      groups[item.productCode].items.push(item);
    });

    return Object.values(groups).filter((group) => {
      return cartCategoryFilter === "Tất cả" || group.category === cartCategoryFilter;
    });
  }, [cartItems, allProducts, cartCategoryFilter]);

  const totalQuantity = cartItems.reduce((acc, curr) => acc + curr.quantity, 0);

  return (
    <>
      <section className="grid-dashboard gap-4 md:gap-6">
        {/* Cột trái: Danh sách hàng sỉ */}
        <div className="panel flex flex-col gap-4 p-4 sm:p-6 bg-white border-2 border-orange-100 rounded-3xl">
          <div className="section-title flex justify-between items-center pb-3 border-b border-dashed border-orange-100">
            <h3 className="text-base sm:text-lg font-bold text-[#331B08] font-heading flex items-center gap-2">
              <ShoppingCart size={20} className="text-orange-500" /> Danh sách hàng sỉ đã chọn
            </h3>
            <span className="bg-orange-100 text-orange-800 text-xs px-2.5 py-0.5 rounded-full font-bold font-mono">
              {totalQuantity} món
            </span>
          </div>

          {/* Lọc giỏ hàng theo category */}
          {availableCategories.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none snap-x touch-pan-x -mx-1 px-1">
              {availableCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`tab-button min-h-[34px] text-xs py-1 px-3 whitespace-nowrap snap-start rounded-xl cursor-pointer ${
                    cartCategoryFilter === cat
                      ? "bg-orange-500 text-white border-orange-600 font-bold"
                      : "bg-[#FFFDF9] border-orange-200 text-orange-950/80"
                  }`}
                  onClick={() => setCartCategoryFilter(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {groupedCartItems.length === 0 ? (
            <div className="text-center py-12 flex flex-col items-center justify-center gap-2 text-brand-ink/60">
              <ShoppingCart size={40} className="text-orange-200" />
              <p className="text-sm font-semibold m-0">Giỏ hàng sỉ đang trống.</p>
              <p className="text-xs text-orange-900/60 m-0">Hãy quay lại mục Kho hàng để chọn các mặt hàng sỉ cần nhập.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-1 overscroll-contain">
                {groupedCartItems.map((group) => (
                  <div
                    className="p-3.5 sm:p-4 border border-orange-200/80 rounded-2xl bg-[#FFFDF9] flex flex-col gap-3 shadow-sm"
                    key={group.productCode}
                  >
                    {/* Header sản phẩm */}
                    <div className="flex items-center gap-3 pb-2 border-b border-dashed border-orange-100">
                      <div className="relative w-11 h-11 rounded-xl bg-[#FFFBEB] overflow-hidden flex items-center justify-center border border-orange-100 shrink-0">
                        <Image src={group.productImage} alt={group.productName} fill sizes="44px" className="object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <strong className="text-xs sm:text-sm text-[#331B08] block truncate font-heading">
                          {group.productName}
                        </strong>
                        <span className="text-[10px] text-orange-900/60 font-mono font-bold uppercase">
                          Mã: {group.productCode} · {group.category}
                        </span>
                      </div>
                    </div>

                    {/* Danh sách phân loại */}
                    <div className="flex flex-col gap-2.5">
                      {group.items.map((item) => {
                        const prod = allProducts.find((p) => p.code === item.productCode);
                        const variant = prod?.variants.find((v) => v.sku === item.variantSku);
                        const itemImg = item.variantImage || variant?.imageUrl || prod?.imageUrl || group.productImage;

                        return (
                          <div
                            className="flex items-center justify-between gap-2 sm:gap-4 text-xs bg-white p-2.5 rounded-xl border border-orange-100"
                            key={item.variantSku}
                          >
                            <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-1">
                              {/* Variant Specific Image Thumbnail */}
                              <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-orange-100 bg-[#FFFBEB] shrink-0 shadow-inner">
                                <Image src={itemImg} alt={item.variantLabel} fill sizes="40px" className="object-cover" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="font-bold text-orange-950 block truncate">{item.variantLabel}</span>
                                <span className="text-[10px] font-mono text-gray-400 font-semibold">SKU: {item.variantSku}</span>
                              </div>
                            </div>

                            {/* Cụm tăng giảm số lượng chuẩn touch target */}
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex items-center border border-orange-200 rounded-xl p-0.5 bg-[#FFFBEB]">
                                <button
                                  type="button"
                                  className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-sm font-extrabold text-[#78350F] shadow-sm active:scale-90 cursor-pointer disabled:opacity-40"
                                  onClick={() => updateCartQty(item.variantSku, -1)}
                                  aria-label="Giảm 1"
                                >
                                  -
                                </button>
                                <span className="text-xs font-extrabold text-[#331B08] min-w-[28px] text-center font-mono">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-sm font-extrabold text-[#78350F] shadow-sm active:scale-90 cursor-pointer"
                                  onClick={() => updateCartQty(item.variantSku, 1)}
                                  aria-label="Tăng 1"
                                >
                                  +
                                </button>
                              </div>

                              <div className="text-right min-w-[80px] sm:min-w-[95px]">
                                <strong className="text-xs sm:text-sm text-orange-600 block font-bold font-mono">
                                  {formatVnd(item.quantity * item.unitPriceSnapshot)}
                                </strong>
                                <span className="text-[9px] text-gray-400 font-mono font-medium">
                                  {formatVnd(item.unitPriceSnapshot)}/cái
                                </span>
                              </div>

                              <button
                                type="button"
                                title="Xóa mẫu này"
                                className="w-7 h-7 rounded-xl bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-500 hover:text-red-700 transition active:scale-90 cursor-pointer shrink-0 border border-red-100"
                                onClick={() => removeCartItem(item.variantSku)}
                                aria-label="Xóa mẫu"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Tổng cộng Desktop view */}
              <div className="hidden sm:flex border-t-2 border-dashed border-orange-100 pt-4 justify-between items-center">
                <span className="text-sm font-bold text-[#331B08]">Tổng tạm tính ({totalQuantity} món):</span>
                <strong className="text-xl text-orange-600 font-extrabold font-mono">{formatVnd(cartTotalVal)}</strong>
              </div>
            </div>
          )}
        </div>

        {/* Cột phải: Thông tin giao nhận + Phương án thanh toán */}
        <aside className="flex flex-col gap-4">
          <div className="panel flex flex-col gap-4 p-4 sm:p-6 bg-white border-2 border-orange-100 rounded-3xl shadow-sm">
            {/* 1. Form Nhập Thông Tin Giao Nhận Ngay Tại Giỏ Hàng */}
            <div className="section-title pb-2 border-b border-dashed border-orange-100">
              <h3 className="text-base sm:text-lg font-bold text-[#331B08] font-heading flex items-center gap-2">
                <Truck size={20} className="text-orange-500" /> Thông tin Nhận hàng & Xuất HĐ
              </h3>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-orange-950">Họ và tên người nhận: *</label>
                  <input
                    type="text"
                    className="text-input text-xs py-2 px-3 rounded-xl border-orange-200"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Ví dụ: Nguyễn Văn A"
                    autoComplete="name"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-orange-950">Số điện thoại liên hệ: *</label>
                  <input
                    type="tel"
                    inputMode="tel"
                    className="text-input text-xs py-2 px-3 rounded-xl border-orange-200 font-mono"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    placeholder="Ví dụ: 0987654321"
                    autoComplete="tel"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-orange-950">Địa chỉ giao nhận hàng sỉ: *</label>
                <textarea
                  className="text-input text-xs py-2 px-3 min-h-[60px] rounded-xl border-orange-200"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành phố..."
                  autoComplete="street-address"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-orange-950">Mã số thuế (nếu cần xuất HĐ):</label>
                  <input
                    type="text"
                    className="text-input text-xs py-2 px-3 rounded-xl border-orange-200 font-mono"
                    value={customerTaxCode}
                    onChange={(e) => setCustomerTaxCode(e.target.value)}
                    placeholder="MST doanh nghiệp / hộ KD"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-orange-950">Ghi chú đơn sỉ (tùy chọn):</label>
                  <input
                    type="text"
                    className="text-input text-xs py-2 px-3 rounded-xl border-orange-200"
                    value={customerNote}
                    onChange={(e) => setCustomerNote(e.target.value)}
                    placeholder="Giao giờ hành chính, gọi trước..."
                  />
                </div>
              </div>
            </div>

            {/* 2. Phương án thanh toán */}
            <div className="section-title pb-2 pt-2 border-b border-t border-dashed border-orange-100">
              <h3 className="text-sm sm:text-base font-bold text-[#331B08] font-heading flex items-center gap-2">
                <ShieldCheck size={18} className="text-orange-500" /> Chọn Hình thức Thanh toán
              </h3>
            </div>

            <div className="flex flex-col gap-3">
              {/* Option 1: Cọc 30% + COD */}
              <label
                className={`p-3.5 border-2 rounded-2xl flex items-start gap-3 cursor-pointer transition-all ${
                  paymentIntent === "deposit_cod"
                    ? "border-orange-500 bg-orange-50/40 shadow-sm"
                    : "border-orange-100 bg-[#FFFDF9] hover:border-orange-200"
                }`}
              >
                <input
                  type="radio"
                  name="payment_intent"
                  className="mt-1 text-orange-500 focus:ring-orange-500 h-4 w-4"
                  checked={paymentIntent === "deposit_cod"}
                  onChange={() => changePaymentIntent("deposit_cod")}
                />
                <div>
                  <strong className="text-xs sm:text-sm text-[#331B08] block font-bold">
                    Đặt cọc trước 30% + Thu hộ COD khi nhận
                  </strong>
                  <p className="text-gray-500 text-[11px] m-0 mt-1 leading-relaxed">
                    Chuyển khoản 30% tiền hàng sau khi chốt báo giá. 70% còn lại thanh toán cho shipper khi giao tới kho của bạn.
                  </p>
                </div>
              </label>

              {/* Option 2: Thanh toán 100% */}
              <label
                className={`p-3.5 border-2 rounded-2xl flex items-start gap-3 cursor-pointer transition-all ${
                  paymentIntent === "pay_full"
                    ? "border-orange-500 bg-orange-50/40 shadow-sm"
                    : "border-orange-100 bg-[#FFFDF9] hover:border-orange-200"
                }`}
              >
                <input
                  type="radio"
                  name="payment_intent"
                  className="mt-1 text-orange-500 focus:ring-orange-500 h-4 w-4"
                  checked={paymentIntent === "pay_full"}
                  onChange={() => changePaymentIntent("pay_full")}
                />
                <div>
                  <strong className="text-xs sm:text-sm text-[#331B08] block font-bold">
                    Thanh toán 100% (Ưu tiên xuất kho ngay)
                  </strong>
                  <p className="text-gray-500 text-[11px] m-0 mt-1 leading-relaxed">
                    Thanh toán toàn bộ giá trị đơn sỉ qua VietQR ngay sau khi duyệt giá. Giao hàng không thu thêm phí tiền mặt.
                  </p>
                </div>
              </label>

              <div className="p-3 border border-orange-200 bg-orange-50/30 rounded-xl flex items-start gap-2.5">
                <AlertCircle size={16} className="text-orange-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-orange-950 m-0 leading-relaxed font-semibold">
                  Pet Travel sẽ xem xét điều chỉnh giảm giá sỉ, phí vận chuyển và gửi lại bản báo giá chính thức cho bạn duyệt trước khi thanh toán.
                </p>
              </div>

              <button
                className="primary-button text-xs sm:text-sm py-3.5 w-full justify-center mt-2 font-bold bg-orange-500 text-white border-orange-600 hover:bg-orange-600 rounded-xl cursor-pointer shadow-lg flex items-center gap-2"
                type="button"
                disabled={cartItems.length === 0}
                onClick={onSubmitCartProposal}
              >
                <span>Gửi yêu cầu báo giá sỉ</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </aside>
      </section>

      {/* Sticky Bottom Bar for Mobile Cart Summary */}
      {cartItems.length > 0 && (
        <div className="sm:hidden fixed bottom-14 left-0 right-0 z-[980] bg-white/95 backdrop-blur-md border-t-2 border-orange-200 p-3 shadow-2xl flex items-center justify-between gap-3 animate-slide-up-sheet">
          <div>
            <span className="text-[10px] text-gray-500 font-bold block">Tổng tạm tính ({totalQuantity} món):</span>
            <strong className="text-base text-orange-600 font-extrabold font-mono">{formatVnd(cartTotalVal)}</strong>
          </div>
          <button
            type="button"
            className="primary-button text-xs py-2.5 px-4 font-bold bg-orange-500 text-white rounded-xl cursor-pointer flex items-center gap-1.5 shadow-md"
            onClick={onSubmitCartProposal}
          >
            <span>Tiến hành đặt sỉ</span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Mobile-First BottomSheet for Checkout Information */}
      <BottomSheet
        isOpen={showCheckoutModal}
        onClose={() => setShowCheckoutModal(false)}
        title={
          <span className="flex items-center gap-2">
            <Truck className="text-orange-500" size={20} /> Thông tin Nhận hàng & Báo giá
          </span>
        }
        subtitle="Vui lòng cung cấp địa chỉ nhận hàng để Pet Travel tính toán chi phí vận chuyển tối ưu."
        maxWidth="max-w-lg"
      >
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-orange-950">Họ và tên người nhận hàng: *</label>
            <input
              type="text"
              className="text-input text-sm py-2.5 px-3 rounded-xl border-orange-200"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Ví dụ: Nguyễn Văn A"
              autoComplete="name"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-orange-950">Số điện thoại liên hệ: *</label>
            <input
              type="tel"
              inputMode="tel"
              className="text-input text-sm py-2.5 px-3 rounded-xl border-orange-200"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              placeholder="Ví dụ: 0987654321"
              autoComplete="tel"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-orange-950">Địa chỉ nhận hàng sỉ: *</label>
            <textarea
              className="text-input text-sm py-2.5 px-3 min-h-[90px] rounded-xl border-orange-200"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành phố..."
              autoComplete="street-address"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-orange-950">Mã số thuế (nếu cần HĐ):</label>
              <input
                type="text"
                className="text-input text-xs py-2 px-3 rounded-xl border-orange-200 font-mono"
                value={customerTaxCode}
                onChange={(e) => setCustomerTaxCode(e.target.value)}
                placeholder="MST doanh nghiệp"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-orange-950">Ghi chú đơn hàng:</label>
              <input
                type="text"
                className="text-input text-xs py-2 px-3 rounded-xl border-orange-200"
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                placeholder="Ghi chú thêm..."
              />
            </div>
          </div>

          <div className="flex gap-2.5 justify-end mt-4 pt-3 border-t border-dashed border-orange-100">
            <button
              type="button"
              className="tab-button text-xs py-2.5 px-4 cursor-pointer font-bold rounded-xl"
              onClick={() => setShowCheckoutModal(false)}
            >
              Quay lại
            </button>
            <button
              type="button"
              className="primary-button text-xs py-2.5 px-6 font-bold bg-orange-500 text-white border-orange-600 hover:bg-orange-600 cursor-pointer rounded-xl flex items-center gap-1.5 shadow-md"
              onClick={onConfirmCheckout}
            >
              <CheckCircle2 size={16} />
              <span>Xác nhận & Gửi yêu cầu</span>
            </button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
