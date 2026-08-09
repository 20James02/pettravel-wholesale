import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import type { CustomerOrder, OrderItem, Product } from "@/lib/domain";
import { formatVnd } from "@/lib/money";

interface CartProps {
  cartItems: OrderItem[];
  allProducts: Product[];
  availableCategories: string[];
  cartCategoryFilter: string;
  setCartCategoryFilter: (cat: string) => void;
  cartTotalVal: number;
  workingOrder: CustomerOrder;
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
  onConfirmCheckout: () => void;
}

export function Cart({
  cartItems,
  allProducts,
  availableCategories,
  cartCategoryFilter,
  setCartCategoryFilter,
  cartTotalVal,
  workingOrder,
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

  return (
    <>
      <section className="grid-dashboard">
        <div className="panel flex flex-col gap-4">
          <div className="section-title flex justify-between items-center">
            <h3 className="text-lg font-bold">🛒 Danh sách hàng sỉ đề xuất</h3>
            <span className="bg-orange-100 text-orange-700 text-xs px-2.5 py-0.5 rounded-full font-bold">
              {cartItems.reduce((acc, curr) => acc + curr.quantity, 0)} sản phẩm
            </span>
          </div>

          {/* Lọc giỏ hàng theo category */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {availableCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`tab-button min-h-[32px] text-xs py-1 px-3 ${
                  cartCategoryFilter === cat ? "bg-orange-500 text-white border-orange-600" : "bg-white border-orange-100"
                }`}
                onClick={() => setCartCategoryFilter(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {groupedCartItems.length === 0 ? (
            <div className="text-center py-8 muted text-sm font-semibold">
              Giỏ hàng sỉ đang trống. Vui lòng quay lại Cửa hàng để thêm sản phẩm sỉ.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 max-h-[480px] overflow-y-auto pr-1">
                {groupedCartItems.map((group) => (
                  <div className="p-4 border-2 border-orange-100 rounded-3xl bg-white flex flex-col gap-3" key={group.productCode}>
                    {/* Header sản phẩm */}
                    <div className="flex items-center gap-3 pb-2 border-b border-dashed border-orange-100">
                      <div className="relative w-10 h-10 rounded-xl bg-orange-50 overflow-hidden flex items-center justify-center border border-orange-100 shrink-0">
                        <img src={group.productImage} alt={group.productName} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <strong className="text-xs text-[#331B08] block">{group.productName}</strong>
                        <span className="text-[9px] muted font-bold uppercase tracking-wider">
                          {group.category} · {group.brand}
                        </span>
                      </div>
                    </div>

                    {/* Danh sách phân loại của sản phẩm */}
                    <div className="flex flex-col gap-2.5">
                      {group.items.map((item) => (
                        <div className="flex items-center justify-between gap-4 text-xs pl-1" key={item.variantSku}>
                          <div className="flex-grow">
                            <span className="font-semibold text-orange-950">{item.variantLabel}</span>
                            <br />
                            <span className="text-[9px] muted">{item.variantSku}</span>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1 border border-orange-200 rounded-xl p-0.5 bg-orange-50/25">
                              <button
                                type="button"
                                className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-xs font-bold text-[#78350F] shadow-sm active:scale-90 cursor-pointer"
                                onClick={() => updateCartQty(item.variantSku, -1)}
                              >
                                -
                              </button>
                              <span className="text-xs font-bold text-[#331B08] min-w-[16px] text-center">{item.quantity}</span>
                              <button
                                type="button"
                                className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-xs font-bold text-[#78350F] shadow-sm active:scale-90 cursor-pointer"
                                onClick={() => updateCartQty(item.variantSku, 1)}
                              >
                                +
                              </button>
                            </div>

                            <div className="text-right min-w-[90px]">
                              <strong className="text-xs text-[#331B08] block">
                                {formatVnd(item.quantity * item.unitPriceSnapshot)}
                              </strong>
                              <span className="text-[9px] muted">{formatVnd(item.unitPriceSnapshot)}/cái</span>
                            </div>

                            <button
                              type="button"
                              title="Xóa khỏi giỏ"
                              className="w-5 h-5 rounded-full bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-500 hover:text-red-700 text-[10px] font-bold transition active:scale-90 cursor-pointer shrink-0"
                              onClick={() => removeCartItem(item.variantSku)}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-dashed border-orange-100 pt-3 flex justify-between items-center">
                <span className="text-sm font-bold text-[#331B08]">Tổng cộng tạm tính:</span>
                <strong className="text-lg text-orange-600 font-bold">{formatVnd(cartTotalVal)}</strong>
              </div>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <div className="panel flex flex-col gap-4">
            <div className="section-title">
              <h3 className="text-lg font-bold">💳 Đề xuất Phương án Thanh toán</h3>
            </div>

            <div className="flex flex-col gap-3">
              <label className="p-3 border-2 border-orange-100 rounded-2xl bg-white flex items-start gap-3 cursor-pointer hover:border-orange-300">
                <input
                  type="radio"
                  name="payment_intent"
                  className="mt-1 text-orange-500 focus:ring-orange-500"
                  checked={workingOrder.paymentIntent === "deposit_cod"}
                  onChange={() => changePaymentIntent("deposit_cod")}
                />
                <div>
                  <strong className="text-xs text-[#331B08] block">Đặt cọc 30% trước</strong>
                  <p className="muted text-[10px] m-0 mt-0.5 leading-relaxed">
                    Thanh toán 30% tiền hàng sau khi chốt giá. 70% còn lại thanh toán COD khi nhận hàng từ đơn vị vận chuyển.
                  </p>
                </div>
              </label>

              <label className="p-3 border-2 border-orange-100 rounded-2xl bg-white flex items-start gap-3 cursor-pointer hover:border-orange-300">
                <input
                  type="radio"
                  name="payment_intent"
                  className="mt-1 text-orange-500 focus:ring-orange-500"
                  checked={workingOrder.paymentIntent === "pay_full"}
                  onChange={() => changePaymentIntent("pay_full")}
                />
                <div>
                  <strong className="text-xs text-[#331B08] block">Thanh toán toàn bộ 100%</strong>
                  <p className="muted text-[10px] m-0 mt-0.5 leading-relaxed">
                    Thanh toán toàn bộ giá trị đơn hàng sau khi chốt báo giá chính thức. Nhận hàng không cần trả thêm phí.
                  </p>
                </div>
              </label>

              <div className="p-3 border border-orange-200 bg-orange-50/20 rounded-xl flex items-start gap-2">
                <AlertTriangle size={15} className="text-orange-600 shrink-0 mt-0.5" />
                <p className="text-[10px] text-orange-950 m-0 leading-relaxed font-bold">
                  Mọi sửa đổi về giỏ hàng hoặc phương thức thanh toán đều sẽ sinh ra phiên bản Bản báo giá nháp mới và cần chờ phê
                  duyệt.
                </p>
              </div>

              <button
                className="primary-button text-xs py-3 w-full justify-center mt-2 font-bold bg-orange-500 text-white border-orange-600 hover:bg-orange-600 rounded-xl cursor-pointer"
                type="button"
                disabled={cartItems.length === 0}
                onClick={onSubmitCartProposal}
              >
                {workingOrder.id ? `Cập nhật đơn hàng (lần ${workingOrder.quoteVersions.length + 1})` : "Xác nhận đặt hàng sỉ"}
              </button>
            </div>
          </div>
        </aside>
      </section>

      {/* Modal Checkout */}
      {showCheckoutModal && (
        <div
          className="fixed inset-0 z-1000 overflow-y-auto bg-black/60 backdrop-filter backdrop-blur-sm animate-fade-in flex items-start justify-center p-4 sm:p-6"
          onClick={() => setShowCheckoutModal(false)}
        >
          <div
            className="panel max-w-md w-full flex flex-col gap-4 p-6 relative bg-[#FFFDF9] animate-scale-in my-4 sm:my-8"
            onClick={(e) => e.stopPropagation()}
            style={{ borderRadius: "1.75rem" }}
          >
            <button
              type="button"
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold hover:bg-orange-200 transition active:scale-90 cursor-pointer"
              onClick={() => setShowCheckoutModal(false)}
            >
              ✕
            </button>

            <h3 className="text-lg font-bold text-[#331B08] flex items-center gap-1.5 font-['Varela_Round']">
              🚚 Thông tin Giao nhận sỉ & Thanh toán
            </h3>
            <p className="muted text-xs leading-relaxed">
              Vui lòng cung cấp chính xác thông tin giao nhận hàng. Đơn hàng sỉ sẽ được khóa và phát hành thông tin chuyển khoản VietQR
              ngay sau khi xác nhận.
            </p>

            <div className="flex flex-col gap-3 mt-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-orange-950/80">Họ và tên người nhận:</label>
                <input
                  type="text"
                  className="text-input text-xs py-2 px-3"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn A..."
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-orange-950/80">Số điện thoại liên hệ:</label>
                <input
                  type="text"
                  className="text-input text-xs py-2 px-3"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  placeholder="Ví dụ: 0987654321..."
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-orange-950/80">Địa chỉ giao hàng sỉ:</label>
                <textarea
                  className="text-input text-xs py-2 px-3 min-h-[80px]"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành phố..."
                />
              </div>

              <div className="flex gap-2 justify-end mt-4">
                <button
                  type="button"
                  className="tab-button text-xs py-2 px-4 cursor-pointer font-bold rounded-xl"
                  onClick={() => setShowCheckoutModal(false)}
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  className="primary-button text-xs py-2 px-6 font-bold bg-orange-500 text-white border-orange-600 hover:bg-orange-600 cursor-pointer rounded-xl"
                  onClick={onConfirmCheckout}
                >
                  Xác nhận & Thanh toán sỉ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
