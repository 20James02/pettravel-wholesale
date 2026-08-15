"use client";

import { useState, useMemo } from "react";
import { 
  Check, 
  ChevronRight, 
  Copy, 
  CreditCard, 
  MapPin, 
  Package, 
  PackageCheck, 
  QrCode, 
  Camera
} from "lucide-react";
import type { CustomerOrder } from "@/lib/domain";
import { formatVnd } from "@/lib/money";
import { StatusPill } from "../ui/StatusPill";

interface OrderTimelineProps {
  isLoggedIn: boolean;
  mode: string;
  workingOrder: CustomerOrder;
  onPayNowClick: () => void;
  onBuyMore: () => void;
  onUploadProof: (file: File) => void;
}

export function OrderTimeline({
  isLoggedIn,
  mode,
  workingOrder,
  onPayNowClick,
  onBuyMore,
  onUploadProof
}: OrderTimelineProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Lấy bản báo giá mới nhất của đơn hàng
  const quote = useMemo(() => {
    if (!workingOrder.quoteVersions || workingOrder.quoteVersions.length === 0) {
      return {
        id: "",
        version: 0,
        status: "draft" as const,
        subtotal: 0,
        adjustments: [],
        finalTotal: 0,
        depositAmount: 0,
        codRemaining: 0,
        expiresAt: ""
      };
    }
    return workingOrder.quoteVersions[workingOrder.quoteVersions.length - 1];
  }, [workingOrder.quoteVersions]);

  // Lấy payment request hoạt động cuối cùng
  const activeReq = useMemo(() => {
    if (!workingOrder.paymentRequests || workingOrder.paymentRequests.length === 0) {
      return null;
    }
    return workingOrder.paymentRequests[workingOrder.paymentRequests.length - 1];
  }, [workingOrder.paymentRequests]);

  const paymentDetails = useMemo(() => {
    const fields = new Map(
      (activeReq?.qrPayload ?? "")
        .split("|")
        .slice(1)
        .map((part) => {
          const separator = part.indexOf("=");
          return separator > 0 ? [part.slice(0, separator), part.slice(separator + 1)] : [part, ""];
        })
    );
    return {
      account: fields.get("account") || "1903688888888",
      name: fields.get("name") || "PET TRAVEL WHOLESALE"
    };
  }, [activeReq?.qrPayload]);

  return (
    <section className="grid-dashboard gap-4 md:gap-6">
      <div className="flex flex-col gap-4">
        {/* Step Timeline Card */}
        <div className="panel p-4 sm:p-6 bg-white border-2 border-orange-100 rounded-3xl flex flex-col gap-4 shadow-sm">
          <div className="section-title flex justify-between items-center pb-3 border-b border-dashed border-orange-100">
            <h3 className="text-base sm:text-lg font-bold text-[#331B08] font-['Varela_Round'] flex items-center gap-2">
              <PackageCheck size={20} className="text-orange-500" /> Tiến độ đơn hàng sỉ #{workingOrder.number || "001"}
            </h3>
            <StatusPill tone="info">
              {workingOrder.commercialStatus === "submitted"
                ? "Chờ duyệt giá"
                : workingOrder.commercialStatus === "quoted"
                  ? "Đã có báo giá sỉ"
                  : workingOrder.commercialStatus === "customer_accepted"
                    ? "Chờ thanh toán"
                    : workingOrder.commercialStatus === "locked"
                      ? "Đang đóng gói"
                      : "Hoàn tất giao dịch"}
            </StatusPill>
          </div>

          {/* 5-Step Visual Stepper Bar */}
          <div className="flex items-center justify-between p-3 bg-[#FFFDF9] rounded-2xl border border-orange-200/80 overflow-x-auto gap-2 overscroll-contain">
            {/* Step 1 */}
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  workingOrder.commercialStatus !== "submitted" ? "bg-orange-500 text-white shadow-sm" : "bg-orange-100 text-orange-800"
                }`}
              >
                1
              </span>
              <span className={`text-xs ${workingOrder.commercialStatus === "submitted" ? "text-orange-600 font-bold" : "text-gray-500 font-medium"}`}>
                Gửi yêu cầu
              </span>
            </div>
            <ChevronRight size={14} className="text-orange-300 shrink-0" />

            {/* Step 2 */}
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  workingOrder.commercialStatus !== "submitted" && workingOrder.commercialStatus !== "quoted"
                    ? "bg-orange-500 text-white shadow-sm"
                    : "bg-orange-100 text-orange-800"
                }`}
              >
                2
              </span>
              <span className={`text-xs ${workingOrder.commercialStatus === "quoted" ? "text-orange-600 font-bold" : "text-gray-500 font-medium"}`}>
                Báo giá sỉ
              </span>
            </div>
            <ChevronRight size={14} className="text-orange-300 shrink-0" />

            {/* Step 3 */}
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  workingOrder.paymentStatus.includes("confirmed") || workingOrder.paymentStatus === "paid"
                    ? "bg-orange-500 text-white shadow-sm"
                    : "bg-orange-100 text-orange-800"
                }`}
              >
                3
              </span>
              <span className={`text-xs ${workingOrder.paymentStatus.includes("uploaded") ? "text-orange-600 font-bold" : "text-gray-500 font-medium"}`}>
                Thanh toán
              </span>
            </div>
            <ChevronRight size={14} className="text-orange-300 shrink-0" />

            {/* Step 4 */}
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  workingOrder.fulfillmentStatus === "shipped" ? "bg-orange-500 text-white shadow-sm" : "bg-orange-100 text-orange-800"
                }`}
              >
                4
              </span>
              <span
                className={`text-xs ${
                  workingOrder.fulfillmentStatus === "packing" || workingOrder.fulfillmentStatus === "shipped"
                    ? "text-orange-600 font-bold"
                    : "text-gray-500 font-medium"
                }`}
              >
                Giao hàng
              </span>
            </div>
          </div>
        </div>

        {/* Danh sách mặt hàng sỉ */}
        <div className="panel p-4 sm:p-6 bg-white border-2 border-orange-100 rounded-3xl flex flex-col gap-3 shadow-sm">
          <h3 className="text-sm sm:text-base font-bold text-[#331B08] border-b border-dashed border-orange-100 pb-2.5 font-['Varela_Round'] flex items-center gap-2">
            <Package size={18} className="text-orange-500" /> Danh mục sản phẩm trong đơn sỉ
          </h3>

          <div className="overflow-x-auto">
            <table className="variant-table w-full">
              <thead>
                <tr>
                  <th className="text-left">Sản phẩm sỉ</th>
                  <th className="text-center">Số lượng</th>
                  <th className="text-right">Đơn giá sỉ</th>
                  <th className="text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {workingOrder.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong className="text-xs sm:text-sm text-[#331B08] block">{item.productName}</strong>
                      <span className="text-[10px] text-gray-400 font-mono font-semibold">
                        {item.variantLabel} ({item.variantSku})
                      </span>
                    </td>
                    <td className="text-center text-xs font-bold text-[#331B08] font-mono">{item.quantity} cái</td>
                    <td className="text-right text-xs text-[#78350F] font-semibold font-mono">{formatVnd(item.unitPriceSnapshot)}</td>
                    <td className="text-right text-xs sm:text-sm font-bold text-orange-600 font-mono">
                      {formatVnd(item.quantity * item.unitPriceSnapshot)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Cột phải: Báo giá & QR Thanh toán */}
      <aside className="flex flex-col gap-4">
        {/* Thẻ báo giá */}
        <div className="panel p-4 sm:p-6 bg-white border-2 border-orange-100 rounded-3xl flex flex-col gap-4 shadow-sm">
          <div className="flex justify-between items-center border-b border-dashed border-orange-100 pb-3">
            <h3 className="text-base sm:text-lg font-bold text-[#331B08] font-['Varela_Round'] flex items-center gap-2">
              <CreditCard size={18} className="text-orange-500" /> Chi tiết Báo giá ({quote.version > 0 ? `Lần ${quote.version}` : "Dự kiến"})
            </h3>
            <StatusPill tone={quote.status === "accepted" ? "success" : "warning"}>
              {quote.status === "published" ? "Pet Travel đã báo giá" : "Đại lý đã đồng ý"}
            </StatusPill>
          </div>

          <div className="flex flex-col gap-2.5 text-xs text-[#331B08]">
            <div className="flex justify-between items-center p-1">
              <span className="text-gray-600 font-medium">Tổng tiền hàng sỉ:</span>
              <strong className="font-bold font-mono text-sm">{formatVnd(quote.subtotal)}</strong>
            </div>

            {quote.adjustments &&
              quote.adjustments.map((adj) => (
                <div className="flex justify-between items-center p-2 text-orange-800 bg-[#FFFBEB] rounded-xl border border-orange-100" key={adj.id}>
                  <span className="font-semibold">{adj.label}:</span>
                  <strong className="font-bold font-mono">{formatVnd(adj.amount)}</strong>
                </div>
              ))}

            <div className="border-t-2 border-dashed border-orange-100 my-1 pt-3 flex justify-between items-center">
              <span className="text-sm font-bold text-[#331B08]">Tổng thanh toán:</span>
              <span className="text-lg sm:text-xl text-orange-600 font-extrabold font-mono">{formatVnd(quote.finalTotal)}</span>
            </div>

            {quote.depositAmount > 0 && (
              <div className="flex justify-between items-center p-3 bg-orange-50/60 border border-orange-200 rounded-2xl font-bold">
                <span className="text-xs text-orange-950">Khoản cọc 30% cần chuyển:</span>
                <span className="text-base text-orange-700 font-mono font-extrabold">{formatVnd(quote.depositAmount)}</span>
              </div>
            )}
          </div>

          {mode === "customer" && quote.status === "published" && (
            <div className="flex flex-col gap-2.5 w-full mt-1">
              <button
                className="primary-button text-sm py-3.5 justify-center w-full font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-2xl shadow-lg cursor-pointer flex items-center gap-2"
                type="button"
                onClick={onPayNowClick}
              >
                <QrCode size={18} />
                <span>Thanh toán VietQR ngay</span>
              </button>

              <button
                className="tab-button text-xs py-2.5 px-3 border border-orange-200 hover:bg-orange-50 text-orange-900 rounded-xl justify-center font-bold cursor-pointer"
                type="button"
                onClick={onBuyMore}
              >
                🛍️ Chọn thêm hàng sỉ khác
              </button>
            </div>
          )}

          {/* Khung thanh toán VietQR với nút sao chép 1-chạm */}
          {isLoggedIn && activeReq && (
            <div className="p-4 border-2 border-orange-200 bg-[#FFFDF9] rounded-2xl flex flex-col items-center gap-3 mt-1 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs font-bold text-orange-950 border-b border-dashed border-orange-100 pb-2 w-full justify-center">
                <QrCode size={16} className="text-orange-500" /> Quét VietQR Chuyển khoản Tự động
              </div>

              {/* VietQR Mockup Frame */}
              <div className="w-48 p-3.5 bg-gradient-to-b from-blue-50/80 to-orange-50/80 border-2 border-orange-100 rounded-2xl flex flex-col items-center text-center relative overflow-hidden shadow-sm">
                <span className="text-[10px] text-blue-900 font-bold tracking-wider mb-2 bg-blue-100/70 px-2.5 py-0.5 rounded-full">
                  VIETQR · NAPAS 247
                </span>

                <div className="w-32 h-32 bg-white border border-orange-100 rounded-xl flex flex-col items-center justify-center p-2 relative shadow-inner">
                  <div className="w-full h-full bg-[radial-gradient(#000_1.5px,transparent_1.5px)] [background-size:7px_7px] opacity-80 flex items-center justify-center">
                    <div className="w-9 h-9 bg-orange-500 rounded-lg flex items-center justify-center text-[9px] text-white font-extrabold shadow-md">
                      PET
                    </div>
                  </div>
                </div>

                <strong className="text-base text-orange-600 block mt-3 font-extrabold font-mono">{formatVnd(activeReq.amount)}</strong>
                <span className="text-[10px] text-gray-500 font-mono mt-0.5">TK: {paymentDetails.account}</span>
              </div>

              {/* Chi tiết tài khoản với nút Copy nhanh */}
              <div className="flex flex-col gap-2.5 w-full text-xs bg-white p-3.5 rounded-2xl border border-orange-100 shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-medium">Chủ tài khoản:</span>
                  <strong className="font-bold text-[#331B08]">{paymentDetails.name}</strong>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-medium">Số tài khoản:</span>
                  <div className="flex items-center gap-1.5">
                    <strong className="font-mono text-sm text-[#331B08]">{paymentDetails.account}</strong>
                    <button
                      type="button"
                      className="p-1 rounded-lg hover:bg-orange-100 text-orange-600 transition active:scale-90 cursor-pointer"
                      onClick={() => copyToClipboard(paymentDetails.account, "acc")}
                      title="Sao chép số tài khoản"
                      aria-label="Sao chép số tài khoản"
                    >
                      {copiedKey === "acc" ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-medium">Số tiền cần chuyển:</span>
                  <div className="flex items-center gap-1.5">
                    <strong className="font-mono text-sm text-orange-600">{formatVnd(activeReq.amount)}</strong>
                    <button
                      type="button"
                      className="p-1 rounded-lg hover:bg-orange-100 text-orange-600 transition active:scale-90 cursor-pointer"
                      onClick={() => copyToClipboard(String(activeReq.amount), "amt")}
                      title="Sao chép số tiền"
                      aria-label="Sao chép số tiền"
                    >
                      {copiedKey === "amt" ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center border-t border-dashed border-orange-100 pt-2 mt-1">
                  <span className="text-gray-500 font-bold text-[10px] uppercase">Nội dung CK:</span>
                  <div className="flex items-center gap-1.5">
                    <strong className="font-mono text-xs text-orange-950 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-lg select-all">
                      {activeReq.reference}
                    </strong>
                    <button
                      type="button"
                      className="p-1 rounded-lg hover:bg-orange-100 text-orange-600 transition active:scale-90 cursor-pointer"
                      onClick={() => copyToClipboard(activeReq.reference, "ref")}
                      title="Sao chép nội dung chuyển khoản"
                      aria-label="Sao chép nội dung"
                    >
                      {copiedKey === "ref" ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Nút gửi ảnh xác nhận chuyển khoản hỗ trợ mở camera trực tiếp */}
              {workingOrder.paymentStatus.includes("requested") && (
                <label
                  className="tab-button text-xs py-3 w-full justify-center bg-orange-500 text-white border-orange-600 hover:bg-orange-600 cursor-pointer font-bold rounded-2xl mt-1 flex items-center gap-2 shadow-md"
                >
                  <Camera size={16} /> Tải ảnh / Chụp hóa đơn chuyển khoản
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) onUploadProof(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          )}
        </div>

        {/* Thông tin giao nhận */}
        {workingOrder.recipientName && (
          <div className="panel p-4 sm:p-5 bg-white border-2 border-orange-100 rounded-3xl flex flex-col gap-3 shadow-sm">
            <div className="section-title pb-2 border-b border-dashed border-orange-100">
              <h3 className="text-sm font-bold text-[#331B08] flex items-center gap-1.5 font-['Varela_Round']">
                <MapPin size={16} className="text-orange-500" /> Địa chỉ giao nhận hàng sỉ
              </h3>
            </div>
            <div className="flex flex-col gap-2 text-xs text-[#331B08]">
              <div className="flex justify-between">
                <span className="text-gray-500 font-medium">Người nhận:</span>
                <strong className="font-bold">{workingOrder.recipientName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 font-medium">Số điện thoại:</span>
                <strong className="font-mono font-bold">{workingOrder.recipientPhone}</strong>
              </div>
              <div className="border-t border-dashed border-orange-100 pt-2 mt-1">
                <span className="text-gray-500 text-[10px] font-bold uppercase block mb-1">Địa chỉ:</span>
                <p className="m-0 bg-[#FFFDF9] p-2.5 rounded-xl border border-orange-100 leading-relaxed font-semibold">
                  {workingOrder.recipientAddress}
                </p>
              </div>
            </div>
          </div>
        )}
      </aside>
    </section>
  );
}
