import { useMemo } from "react";
import { ChevronRight, MapPin, QrCode, Truck, Upload } from "lucide-react";
import type { CustomerOrder } from "@/lib/domain";
import type { ApiUser } from "../../types";
import { formatVnd } from "@/lib/money";
import { StatusPill } from "../ui/StatusPill";

interface OrderTimelineProps {
  isLoggedIn: boolean;
  mode: string;
  workingOrder: CustomerOrder;
  currentUser: ApiUser | null;
  onPayNowClick: () => void;
  onBuyMore: () => void;
  onUploadProof: () => void;
}

export function OrderTimeline({
  isLoggedIn,
  mode,
  workingOrder,
  currentUser,
  onPayNowClick,
  onBuyMore,
  onUploadProof
}: OrderTimelineProps) {
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

  return (
    <section className="grid-dashboard">
      <div className="flex flex-col gap-4">
        {/* Timeline đơn hàng */}
        <div className="panel flex flex-col gap-4">
          <div className="section-title">
            <h3 className="text-lg font-bold">🐾 Tiến độ đơn hàng sỉ</h3>
            <StatusPill tone="info">
              {workingOrder.commercialStatus === "submitted"
                ? "Chờ duyệt giá"
                : workingOrder.commercialStatus === "quoted"
                  ? "Đã báo giá sỉ"
                  : workingOrder.commercialStatus === "customer_accepted"
                    ? "Chờ thanh toán"
                    : workingOrder.commercialStatus === "locked"
                      ? "Đã khóa đóng gói"
                      : "Hoàn tất giao dịch"}
            </StatusPill>
          </div>

          <div className="flex items-center justify-between px-4 py-2 bg-orange-50/30 rounded-2xl border border-orange-100 overflow-x-auto">
            <div className="flex items-center gap-2 text-xs font-bold">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${
                  workingOrder.commercialStatus !== "submitted" ? "bg-orange-500 text-white" : "bg-orange-100 text-orange-700"
                }`}
              >
                1
              </span>
              <span className={workingOrder.commercialStatus === "submitted" ? "text-orange-600 font-bold" : "text-gray-500 font-medium"}>
                Nháp đề xuất
              </span>
            </div>
            <ChevronRight size={14} className="text-orange-300" />
            <div className="flex items-center gap-2 text-xs font-bold">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${
                  workingOrder.commercialStatus !== "submitted" && workingOrder.commercialStatus !== "quoted"
                    ? "bg-orange-500 text-white"
                    : "bg-orange-100 text-orange-700"
                }`}
              >
                2
              </span>
              <span className={workingOrder.commercialStatus === "quoted" ? "text-orange-600 font-bold" : "text-gray-500 font-medium"}>
                Thẩm định & QR
              </span>
            </div>
            <ChevronRight size={14} className="text-orange-300" />
            <div className="flex items-center gap-2 text-xs font-bold">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${
                  workingOrder.paymentStatus.includes("confirmed") || workingOrder.paymentStatus === "paid"
                    ? "bg-orange-500 text-white"
                    : "bg-orange-100 text-orange-700"
                }`}
              >
                3
              </span>
              <span className={workingOrder.paymentStatus.includes("uploaded") ? "text-orange-600 font-bold" : "text-gray-500 font-medium"}>
                Đối soát tiền
              </span>
            </div>
            <ChevronRight size={14} className="text-orange-300" />
            <div className="flex items-center gap-2 text-xs font-bold">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${
                  workingOrder.fulfillmentStatus === "shipped" ? "bg-orange-500 text-white" : "bg-orange-100 text-orange-700"
                }`}
              >
                4
              </span>
              <span
                className={
                  workingOrder.fulfillmentStatus === "packing" || workingOrder.fulfillmentStatus === "shipped"
                    ? "text-orange-600 font-bold"
                    : "text-gray-500 font-medium"
                }
              >
                Đóng hàng & Giao
              </span>
            </div>
          </div>
        </div>

        {/* Chi tiết đơn hàng */}
        <div className="panel p-4 flex flex-col gap-3">
          <h3 className="text-sm font-bold text-[#331B08] border-b border-dashed border-orange-100 pb-2">
            📦 Sản phẩm sỉ trong đơn hàng
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
                      <strong className="text-xs text-[#331B08]">{item.productName}</strong>
                      <br />
                      <span className="muted text-[10px]">
                        {item.variantLabel} ({item.variantSku})
                      </span>
                    </td>
                    <td className="text-center text-xs font-bold text-[#331B08]">{item.quantity} cái</td>
                    <td className="text-right text-xs text-[#78350F] font-semibold">{formatVnd(item.unitPriceSnapshot)}</td>
                    <td className="text-right text-xs font-bold text-[#331B08]">{formatVnd(item.quantity * item.unitPriceSnapshot)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        {/* Báo giá phòng sỉ */}
        <div className="panel flex flex-col gap-4">
          <div className="flex justify-between items-center border-b border-dashed border-orange-100 pb-2">
            <h3 className="text-lg font-bold">Báo giá lần {quote.version}</h3>
            <StatusPill tone={quote.status === "accepted" ? "success" : "warning"}>
              {quote.status === "published" ? "Nhân viên đề xuất" : "Đại lý đã đồng ý"}
            </StatusPill>
          </div>

          <div className="flex flex-col gap-2.5 text-xs text-[#331B08]">
            <div className="flex justify-between items-center p-1">
              <span>Tổng tiền sản phẩm:</span>
              <strong className="font-semibold">{formatVnd(quote.subtotal)}</strong>
            </div>

            {quote.adjustments &&
              quote.adjustments.map((adj) => (
                <div className="flex justify-between items-center p-1 text-orange-700 bg-orange-50/50 rounded px-2" key={adj.id}>
                  <span>{adj.label}:</span>
                  <strong className="font-bold">{formatVnd(adj.amount)}</strong>
                </div>
              ))}

            <div className="border-t border-dashed border-orange-100 my-1 pt-2 flex justify-between items-center text-sm font-bold">
              <span>Tổng giá cuối cùng:</span>
              <span className="text-lg text-orange-600">{formatVnd(quote.finalTotal)}</span>
            </div>

            <div className="flex justify-between items-center p-2 bg-orange-50/20 border border-orange-100 rounded-xl font-bold">
              <span>Khoản cọc cần thanh toán:</span>
              <span className="text-orange-700">{formatVnd(quote.depositAmount)}</span>
            </div>
          </div>

          {!isLoggedIn && (
            <button className="primary-button text-xs py-3 justify-center w-full" disabled type="button">
              Đăng nhập để giao dịch
            </button>
          )}

          {mode === "customer" && quote.status === "published" && (
            <div className="flex flex-col gap-2 w-full mt-1">
              <button
                className="primary-button text-xs py-3 justify-center w-full font-bold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-2xl shadow-lg cursor-pointer"
                type="button"
                onClick={onPayNowClick}
              >
                💳 Thanh toán ngay
              </button>

              <button
                className="tab-button text-xs py-2 px-3 border border-orange-200 hover:bg-orange-50 text-orange-800 rounded-xl justify-center font-bold cursor-pointer"
                type="button"
                onClick={onBuyMore}
              >
                🛍️ Mua thêm sản phẩm
              </button>
            </div>
          )}

          {/* Yêu cầu VietQR */}
          {isLoggedIn && activeReq && (
            <div className="p-4 border-2 border-orange-200 bg-white rounded-2xl flex flex-col items-center gap-3 mt-1 shadow-inner">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#78350F] border-b border-dashed border-orange-100 pb-2 w-full justify-center">
                <QrCode size={16} /> Quét VietQR chuyển khoản nhanh
              </div>

              {/* VietQR Mockup Frame */}
              <div className="w-48 p-3 bg-gradient-to-b from-blue-50 to-orange-50 border-2 border-orange-100 rounded-2xl flex flex-col items-center text-center relative overflow-hidden shadow-sm">
                <span className="text-[10px] text-blue-900 font-bold tracking-wider mb-2 bg-blue-100/50 px-2 py-0.5 rounded-full">
                  VIETQR · NAPAS247
                </span>

                <div className="w-32 h-32 bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center p-2 relative">
                  <div className="w-full h-full bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:8px_8px] opacity-80 flex items-center justify-center">
                    <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-[8px] text-white font-bold shadow-md">
                      PET
                    </div>
                  </div>
                  <div className="absolute top-1 left-1 w-4 h-4 border-t-2 border-l-2 border-blue-600"></div>
                  <div className="absolute top-1 right-1 w-4 h-4 border-t-2 border-r-2 border-blue-600"></div>
                  <div className="absolute bottom-1 left-1 w-4 h-4 border-b-2 border-l-2 border-blue-600"></div>
                  <div className="absolute bottom-1 right-1 w-4 h-4 border-b-2 border-r-2 border-blue-600"></div>
                </div>

                <strong className="text-sm text-orange-600 block mt-3 font-extrabold">{formatVnd(activeReq.amount)}</strong>
                <span className="text-[8px] text-gray-500 font-mono mt-1">Techcombank · 190356782390</span>
              </div>

              {/* Payment information details */}
              <div className="flex flex-col gap-2 w-full text-xs text-[#331B08] bg-orange-50/50 p-3 rounded-2xl border border-orange-100">
                <div className="flex justify-between">
                  <span className="muted font-semibold">Ngân hàng:</span>
                  <strong>Techcombank (TCB)</strong>
                </div>
                <div className="flex justify-between">
                  <span className="muted font-semibold">Chủ tài khoản:</span>
                  <strong>PET TRAVEL WHOLESALE</strong>
                </div>
                <div className="flex justify-between">
                  <span className="muted font-semibold">Số tài khoản:</span>
                  <strong>1903 5678 2390</strong>
                </div>
                <div className="flex justify-between items-center border-t border-dashed border-orange-200 pt-2 mt-1">
                  <span className="muted font-bold text-[10px] uppercase">Nội dung:</span>
                  <strong className="font-mono text-xs text-orange-950 bg-white border border-orange-200 px-2 py-0.5 rounded-lg select-all shadow-sm">
                    {activeReq.reference}
                  </strong>
                </div>
              </div>

              {workingOrder.paymentStatus.includes("requested") && (
                <button
                  type="button"
                  className="tab-button text-xs py-2 w-full justify-center bg-orange-500 text-white border-orange-600 hover:bg-orange-600 cursor-pointer font-bold rounded-xl mt-1 flex items-center gap-1.5"
                  onClick={onUploadProof}
                >
                  <Upload size={14} /> Gửi minh chứng chuyển khoản
                </button>
              )}
            </div>
          )}
        </div>

        {/* Địa chỉ giao nhận */}
        {workingOrder.recipientName && (
          <div className="panel flex flex-col gap-3">
            <div className="section-title">
              <h3 className="text-sm font-bold flex items-center gap-1">
                <MapPin size={15} /> Địa chỉ giao nhận
              </h3>
            </div>
            <div className="flex flex-col gap-2 text-xs text-[#331B08]">
              <div className="flex justify-between">
                <span className="muted font-semibold">Người nhận:</span>
                <strong>{workingOrder.recipientName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="muted font-semibold">Số điện thoại:</span>
                <strong>{workingOrder.recipientPhone}</strong>
              </div>
              <div className="border-t border-dashed border-orange-100 pt-2 mt-1">
                <span className="muted text-[10px] font-bold uppercase block mb-1">Địa chỉ nhận hàng:</span>
                <p className="m-0 bg-orange-50/50 p-2 rounded-xl border border-orange-100 leading-relaxed font-semibold">
                  {workingOrder.recipientAddress}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Vận chuyển */}
        {workingOrder.shipment && (
          <div className="panel flex flex-col gap-3">
            <div className="section-title">
              <h3 className="text-sm font-bold flex items-center gap-1">
                <Truck size={15} /> Thông tin Giao nhận sỉ
              </h3>
            </div>
            <div className="flex flex-col gap-2 text-xs text-[#331B08]">
              <div className="flex justify-between">
                <span>Đơn vị vận chuyển:</span>
                <strong>{workingOrder.shipment.carrier}</strong>
              </div>
              <div className="flex justify-between">
                <span>Mã vận đơn:</span>
                <strong className="text-orange-600">{workingOrder.shipment.trackingCode}</strong>
              </div>
              <div className="flex justify-between">
                <span>Thời gian nhận dự kiến:</span>
                <strong>{workingOrder.shipment.eta}</strong>
              </div>
              <p className="muted text-[10px] m-0 mt-2 bg-orange-50/50 p-2 rounded-xl border border-orange-100 leading-relaxed font-bold">
                Ghi chú vận chuyển: {workingOrder.shipment.note}
              </p>
            </div>
          </div>
        )}
      </aside>
    </section>
  );
}
