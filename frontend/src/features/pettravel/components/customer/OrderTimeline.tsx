"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { 
  Check, 
  ChevronRight, 
  Copy, 
  CreditCard, 
  MapPin, 
  Package, 
  PackageCheck, 
  QrCode, 
  Camera,
  MessageSquareQuote,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  History,
  LoaderCircle
} from "lucide-react";
import type { CustomerOrder, Product } from "@/lib/domain";
import { formatVnd } from "@/lib/money";
import { StatusPill } from "../ui/StatusPill";
import { Modal } from "../ui/Modal";
import { OrderRevisionHistoryModal } from "../shared/OrderRevisionHistoryModal";

interface OrderTimelineProps {
  isLoggedIn: boolean;
  mode: string;
  workingOrder: CustomerOrder;
  allProducts?: Product[];
  onPayNowClick: () => void;
  onUploadProof: (file: File) => Promise<boolean>;
  onAcceptQuote?: () => Promise<boolean>;
  onRequestOrderChange?: (reason: string) => Promise<boolean>;
  onUpdateRecipientInfo?: (info: {
    recipientName: string;
    recipientPhone: string;
    recipientAddress: string;
    customerTaxCode: string;
    customerNote: string;
  }) => Promise<boolean>;
}

export function OrderTimeline({
  isLoggedIn,
  mode,
  workingOrder,
  allProducts = [],
  onPayNowClick,
  onUploadProof,
  onAcceptQuote,
  onRequestOrderChange,
  onUpdateRecipientInfo
}: OrderTimelineProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isAcceptingQuote, setIsAcceptingQuote] = useState<boolean>(false);
  const [isUploadingProof, setIsUploadingProof] = useState<boolean>(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const handleAcceptQuoteClick = async () => {
    if (!onAcceptQuote) {
      onPayNowClick();
      return;
    }
    if (isAcceptingQuote) return;

    setIsAcceptingQuote(true);
    try {
      await onAcceptQuote();
    } finally {
      setIsAcceptingQuote(false);
    }
  };

  // Modal edit recipient info state
  const [isEditRecipientOpen, setIsEditRecipientOpen] = useState(false);
  const [editName, setEditName] = useState(workingOrder.recipientName || "");
  const [editPhone, setEditPhone] = useState(workingOrder.recipientPhone || "");
  const [editAddress, setEditAddress] = useState(workingOrder.recipientAddress || "");
  const [editTaxCode, setEditTaxCode] = useState(workingOrder.customerTaxCode || "");
  const [editNote, setEditNote] = useState(workingOrder.customerNote || "");
  const [isSavingRecipient, setIsSavingRecipient] = useState(false);

  // Modal request change state
  const [isRequestChangeOpen, setIsRequestChangeOpen] = useState(false);
  const [changeReason, setChangeReason] = useState("");
  const [isRequestingChange, setIsRequestingChange] = useState(false);

  // Modal order revision history state
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      alert("Không thể sao chép tự động. Vui lòng sao chép thủ công.");
    }
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

  // Lấy ghi chú / thông báo mới nhất từ Admin (kèm theo note trực tiếp trên order)
  const latestAdminNote = useMemo(() => {
    if (workingOrder.customerNote && workingOrder.commercialStatus === "quoted") {
      return workingOrder.customerNote;
    }
    const pubNote = workingOrder.comments?.find(
      (c) => c.audience === "customer_visible" && (c.id.startsWith("c_pub_note") || c.author === "Admin" || c.author === "Operator") && !c.message.startsWith("Nhân viên đã thẩm định")
    );
    return pubNote?.message || workingOrder.customerNote || null;
  }, [workingOrder.comments, workingOrder.customerNote, workingOrder.commercialStatus]);

  // Payment data must come from the authoritative request persisted by the backend.
  const activeReq = useMemo(() => {
    return [...(workingOrder.paymentRequests ?? [])]
      .reverse()
      .find(
        (request) =>
          request.status === "uploaded" ||
          (request.status === "active" && new Date(request.expiresAt).getTime() > nowMs)
      ) ?? null;
  }, [workingOrder.paymentRequests, nowMs]);

  const paymentDetails = useMemo(() => {
    if (!activeReq?.qrPayload) return null;
    try {
      const qrUrl = new URL(activeReq.qrPayload);
      if (qrUrl.protocol !== "https:" || qrUrl.hostname !== "img.vietqr.io") return null;
      const match = qrUrl.pathname.match(/^\/image\/[A-Z0-9]+-([A-Z0-9]+)-compact2\.png$/i);
      if (!match) return null;
      return {
        account: match[1],
        name: qrUrl.searchParams.get("accountName") || "Pet Travel Wholesale",
        qrImageUrl: qrUrl.toString()
      };
    } catch {
      return null;
    }
  }, [activeReq]);

  const handleOpenEditRecipient = () => {
    setEditName(workingOrder.recipientName || "");
    setEditPhone(workingOrder.recipientPhone || "");
    setEditAddress(workingOrder.recipientAddress || "");
    setEditTaxCode(workingOrder.customerTaxCode || "");
    setEditNote(workingOrder.customerNote || "");
    setIsEditRecipientOpen(true);
  };

  const handleSaveRecipient = async () => {
    if (!editName.trim() || !editPhone.trim() || !editAddress.trim()) {
      alert("Vui lòng điền đầy đủ Tên người nhận, Số điện thoại và Địa chỉ giao hàng.");
      return;
    }
    setIsSavingRecipient(true);
    try {
      if (onUpdateRecipientInfo) {
        const saved = await onUpdateRecipientInfo({
          recipientName: editName.trim(),
          recipientPhone: editPhone.trim(),
          recipientAddress: editAddress.trim(),
          customerTaxCode: editTaxCode.trim(),
          customerNote: editNote.trim()
        });
        if (saved) setIsEditRecipientOpen(false);
      }
    } catch {
      alert("Không thể lưu thông tin nhận hàng. Vui lòng thử lại.");
    } finally {
      setIsSavingRecipient(false);
    }
  };

  const handleSendChangeRequest = async () => {
    if (!changeReason.trim()) {
      alert("Vui lòng nhập nội dung hoặc lý do bạn cần điều chỉnh đơn sỉ.");
      return;
    }
    if (!onRequestOrderChange || isRequestingChange) return;
    setIsRequestingChange(true);
    try {
      const sent = await onRequestOrderChange(changeReason.trim());
      if (sent) {
        setIsRequestChangeOpen(false);
        setChangeReason("");
      }
    } finally {
      setIsRequestingChange(false);
    }
  };

  const handleUploadProof = async (file: File) => {
    if (isUploadingProof) return;
    setIsUploadingProof(true);
    try {
      await onUploadProof(file);
    } finally {
      setIsUploadingProof(false);
    }
  };

  const canEditShipping = !["customer_accepted", "locked", "cancelled"].includes(workingOrder.commercialStatus)
    && workingOrder.fulfillmentStatus === "not_started";

  return (
    <>
      <section className="grid-dashboard gap-4 md:gap-6">
        <div className="flex flex-col gap-4">
          {/* Step Timeline Card */}
          <div className="panel p-4 sm:p-6 bg-white border-2 border-orange-100 rounded-3xl flex flex-col gap-4 shadow-sm">
            <div className="section-title flex flex-wrap justify-between items-center pb-3 border-b border-dashed border-orange-100 gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold text-[#331B08] font-heading flex items-center gap-2">
                  <PackageCheck size={20} className="text-orange-500" /> Tiến độ đơn hàng sỉ #{workingOrder.number}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsHistoryModalOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-bold border border-orange-200 transition-colors cursor-pointer"
                  title="Xem lịch sử các lần trao đổi, chỉnh sửa báo giá và duyệt đơn"
                >
                  <History size={13} className="text-orange-600" />
                  <span>Lịch sử duyệt đơn</span>
                </button>
              </div>
              <StatusPill tone={workingOrder.commercialStatus === "quoted" ? "warning" : workingOrder.commercialStatus === "customer_accepted" ? "success" : "info"}>
                {workingOrder.commercialStatus === "submitted"
                  ? "Chờ thẩm định giá"
                  : workingOrder.commercialStatus === "admin_review"
                    ? "Admin đang sửa đơn"
                    : workingOrder.commercialStatus === "quoted"
                      ? "Đã có báo giá sỉ (Chờ duyệt)"
                      : workingOrder.commercialStatus === "customer_accepted"
                        ? "Đã duyệt báo giá"
                        : workingOrder.commercialStatus === "locked"
                          ? "Đã khóa - Đóng gói"
                          : workingOrder.commercialStatus === "cancelled"
                            ? "Đã hủy"
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
                    workingOrder.commercialStatus !== "submitted" && workingOrder.commercialStatus !== "admin_review"
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
                    activeReq || workingOrder.paymentStatus.includes("confirmed") || workingOrder.paymentStatus === "paid"
                      ? "bg-orange-500 text-white shadow-sm"
                      : "bg-orange-100 text-orange-800"
                  }`}
                >
                  3
                </span>
                <span className={`text-xs ${activeReq || workingOrder.paymentStatus.includes("uploaded") ? "text-orange-600 font-bold" : "text-gray-500 font-medium"}`}>
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

            {/* Thông báo trạng thái khóa / Note từ Admin */}
            {latestAdminNote && (
              <div className="p-4 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border-2 border-amber-300 rounded-2xl flex items-start gap-3 shadow-sm animate-fade-in">
                <MessageSquareQuote size={22} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1 w-full">
                  <span className="text-xs font-bold text-amber-950 uppercase tracking-wide flex items-center gap-1.5">
                    💬 Lời nhắn từ Quản lý / Báo giá Admin:
                  </span>
                  <p className="text-xs text-amber-900 leading-relaxed font-semibold m-0 bg-white/70 p-2.5 rounded-xl border border-amber-200/60 whitespace-pre-line">
                    {latestAdminNote}
                  </p>
                </div>
              </div>
            )}

            {/* Trạng thái đang chờ Admin thẩm định (Khóa không cho khách sửa đè) */}
            {(workingOrder.commercialStatus === "submitted" || workingOrder.commercialStatus === "admin_review") && (
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-center gap-2.5 text-xs text-blue-900 font-semibold">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping shrink-0" />
                <span>Đơn hàng đang trong tiến trình nhân viên Pet Travel kiểm kho & thẩm định giá. Hệ thống tạm khóa chỉnh sửa để xuất báo giá tối ưu nhất cho bạn.</span>
              </div>
            )}
          </div>

          {/* Danh sách mặt hàng sỉ với ảnh phân loại tương ứng */}
          <div className="panel p-4 sm:p-6 bg-white border-2 border-orange-100 rounded-3xl flex flex-col gap-3 shadow-sm">
            <h3 className="text-sm sm:text-base font-bold text-[#331B08] border-b border-dashed border-orange-100 pb-2.5 font-heading flex items-center gap-2">
              <Package size={18} className="text-orange-500" /> Danh mục sản phẩm trong đơn sỉ ({workingOrder.items?.length || 0} sản phẩm)
            </h3>

            <div className="overflow-x-auto">
              <table className="variant-table w-full">
                <thead>
                  <tr>
                    <th className="text-left">Sản phẩm & Phân loại sỉ</th>
                    <th className="text-center">Số lượng</th>
                    <th className="text-right">Đơn giá sỉ</th>
                    <th className="text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {workingOrder.items.map((item) => {
                    const prod = allProducts.find((p) => p.code === item.productCode || p.name === item.productName);
                    const variant = prod?.variants.find((v) => v.sku === item.variantSku || v.label === item.variantLabel);
                    const itemImg = item.variantImage || variant?.imageUrl || prod?.imageUrl || "/product-food.svg";

                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="relative w-10 h-10 rounded-xl bg-[#FFFBEB] overflow-hidden border border-orange-100 shrink-0 shadow-sm">
                              <Image src={itemImg} alt={item.variantLabel || item.productName} fill sizes="40px" className="object-cover" />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <strong className="text-xs sm:text-sm text-[#331B08] block truncate">{item.productName}</strong>
                              <span className="text-[10px] text-gray-500 font-mono font-bold">
                                {item.variantLabel} ({item.variantSku})
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="text-center text-xs font-bold text-[#331B08] font-mono">{item.quantity} cái</td>
                        <td className="text-right text-xs text-[#78350F] font-semibold font-mono">{formatVnd(item.unitPriceSnapshot)}</td>
                        <td className="text-right text-xs sm:text-sm font-bold text-orange-600 font-mono">
                          {formatVnd(item.quantity * item.unitPriceSnapshot)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Cột phải: Báo giá, Nút Xác nhận / Sửa đổi, và Thông tin nhận hàng */}
        <aside className="flex flex-col gap-4">
          {/* Thẻ báo giá */}
          <div className="panel p-4 sm:p-6 bg-white border-2 border-orange-100 rounded-3xl flex flex-col gap-4 shadow-sm">
            <div className="flex justify-between items-center border-b border-dashed border-orange-100 pb-3">
              <h3 className="text-base sm:text-lg font-bold text-[#331B08] font-heading flex items-center gap-2">
                <CreditCard size={18} className="text-orange-500" /> Chi tiết Báo giá ({quote.version > 0 ? `Lần ${quote.version}` : "Dự kiến"})
              </h3>
              <StatusPill tone={quote.status === "accepted" ? "success" : quote.status === "published" ? "warning" : "info"}>
                {quote.status === "published" ? "Pet Travel đã báo giá" : quote.status === "accepted" ? "Đại lý đã đồng ý" : "Bản thảo"}
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

            {/* Khách hàng xử lý báo giá (Chấp thuận hoặc Yêu cầu sửa) */}
            {mode === "customer" && workingOrder.commercialStatus === "quoted" && (
              <div className="flex flex-col gap-2.5 w-full mt-2 pt-3 border-t border-dashed border-orange-200">
                <button
                  className="primary-button text-xs sm:text-sm py-3.5 justify-center w-full font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-2xl shadow-lg cursor-pointer flex items-center gap-2 disabled:cursor-wait disabled:opacity-70"
                  type="button"
                  onClick={handleAcceptQuoteClick}
                  disabled={isAcceptingQuote}
                  aria-busy={isAcceptingQuote}
                >
                  {isAcceptingQuote ? (
                    <><LoaderCircle size={18} className="animate-spin" /><span>Đang xác nhận...</span></>
                  ) : (
                    <><CheckCircle2 size={18} /><span>Xác nhận chấp thuận báo giá & Đặt cọc</span></>
                  )}
                </button>

                <button
                  className="tab-button text-xs py-2.5 px-3 border border-amber-300 hover:bg-amber-50 text-amber-900 rounded-xl justify-center font-bold cursor-pointer flex items-center gap-1.5"
                  type="button"
                  onClick={() => setIsRequestChangeOpen(true)}
                >
                  <RotateCcw size={14} className="text-amber-600" />
                  <span>Yêu cầu điều chỉnh lại đơn sỉ</span>
                </button>

              </div>
            )}

            {mode === "customer" && workingOrder.commercialStatus === "customer_accepted" && (
              <div className="flex flex-col gap-2.5 w-full mt-1">
                {activeReq ? (
                  <button
                    className="primary-button text-sm py-3.5 justify-center w-full font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-2xl shadow-lg cursor-pointer flex items-center gap-2"
                    type="button"
                    onClick={onPayNowClick}
                  >
                    <QrCode size={18} />
                    <span>{activeReq.status === "uploaded" ? "Xem trạng thái đối soát" : "Thanh toán VietQR ngay"}</span>
                  </button>
                ) : workingOrder.paymentStatus !== "deposit_confirmed" && workingOrder.paymentStatus !== "paid" ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-center text-xs font-bold text-amber-900">
                    Yêu cầu thanh toán đã hết hạn hoặc chưa được phát hành. Bộ phận vận hành đang tạo mã mới.
                  </div>
                ) : null}
              </div>
            )}

            {/* Khung thanh toán VietQR với nút sao chép 1-chạm */}
            {isLoggedIn && activeReq && paymentDetails && (
              <div id="payment-request-panel" className="p-4 border-2 border-orange-200 bg-[#FFFDF9] rounded-2xl flex flex-col items-center gap-3 mt-1 shadow-sm">
                <div className="flex items-center gap-1.5 text-xs font-bold text-orange-950 border-b border-dashed border-orange-100 pb-2 w-full justify-center">
                  <QrCode size={16} className="text-orange-500" />
                  {activeReq.purpose === "remaining"
                    ? "Thanh toán phần COD còn lại sau giao hàng"
                    : activeReq.purpose === "deposit"
                      ? "Thanh toán khoản cọc đơn hàng"
                      : "Thanh toán toàn bộ đơn hàng"}
                </div>

                {/* Authoritative VietQR frame */}
                <div className="w-52 p-3 bg-gradient-to-b from-blue-50/90 to-orange-50/90 border-2 border-orange-200 rounded-2xl flex flex-col items-center text-center relative overflow-hidden shadow-sm">
                  <span className="text-[10px] text-blue-900 font-bold tracking-wider mb-2 bg-blue-100/80 px-3 py-0.5 rounded-full border border-blue-200">
                    VIETQR · NAPAS 247
                  </span>

                  <div className="w-36 h-36 bg-white border border-orange-100 rounded-xl flex items-center justify-center p-1 relative shadow-inner overflow-hidden">
                    <Image
                      src={paymentDetails.qrImageUrl}
                      alt="Mã VietQR thanh toán tự động"
                      width={144}
                      height={144}
                      sizes="144px"
                      className="h-full w-full object-contain"
                    />
                  </div>

                  <strong className="text-base text-orange-600 block mt-2.5 font-extrabold font-mono">{formatVnd(activeReq.amount)}</strong>
                  <span className="text-[10px] text-gray-600 font-mono mt-0.5 font-semibold">TK: {paymentDetails.account}</span>
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

                {/* Trạng thái minh chứng đã gửi */}
                {workingOrder.paymentStatus.includes("uploaded") && (
                  <div className="w-full p-3 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col gap-1.5 text-xs text-amber-900 shadow-sm animate-fade-in">
                    <div className="flex items-center gap-2 font-bold text-amber-950">
                      <CheckCircle2 size={16} className="text-amber-600 shrink-0" />
                      <span>Đã gửi minh chứng chuyển khoản</span>
                    </div>
                    <p className="text-[11px] text-amber-800 m-0">
                      Minh chứng chuyển khoản của bạn đã được tiếp nhận. Kế toán Pet Travel đang đối soát để xác nhận đơn hàng!
                    </p>
                    <p className="text-[11px] text-amber-800 m-0">
                      Để tránh đối soát trùng, hệ thống chỉ nhận một minh chứng cho mỗi lần duyệt. Nếu bị từ chối, nút tải lại sẽ tự mở.
                    </p>
                  </div>
                )}

                {/* Trạng thái kế toán đã xác nhận */}
                {(workingOrder.paymentStatus.includes("confirmed") || workingOrder.paymentStatus === "paid") && (
                  <div className="w-full p-3 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center gap-2 text-xs font-bold text-emerald-900 shadow-sm animate-fade-in">
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                    <span>Kế toán đã xác nhận thanh toán thành công! Đơn hàng sẵn sàng đóng gói.</span>
                  </div>
                )}

                {/* Nút gửi ảnh xác nhận chuyển khoản hỗ trợ mở camera trực tiếp */}
                {activeReq.status === "active" && (
                  <label
                    className={`tab-button text-xs py-3 w-full justify-center bg-orange-500 text-white border-orange-600 font-bold rounded-2xl mt-1 flex items-center gap-2 shadow-md ${isUploadingProof ? "cursor-wait opacity-70" : "hover:bg-orange-600 cursor-pointer"}`}
                    aria-disabled={isUploadingProof}
                    aria-busy={isUploadingProof}
                  >
                    {isUploadingProof ? <LoaderCircle size={16} className="animate-spin" /> : <Camera size={16} />}
                    {isUploadingProof ? "Đang tải và xác nhận minh chứng..." : "Tải ảnh, PDF / Chụp minh chứng chuyển khoản"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="sr-only"
                      disabled={isUploadingProof}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void handleUploadProof(file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            )}
          </div>

          {/* Thông tin giao nhận & Xuất hóa đơn (kèm nút sửa nếu chưa hoàn tất) */}
          <div className="panel p-4 sm:p-5 bg-white border-2 border-orange-100 rounded-3xl flex flex-col gap-3 shadow-sm">
            <div className="section-title pb-2 border-b border-dashed border-orange-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#331B08] flex items-center gap-1.5 font-heading">
                <MapPin size={16} className="text-orange-500" /> Thông tin nhận hàng & Xuất HĐ
              </h3>
              {canEditShipping && (
                <button
                  type="button"
                  onClick={handleOpenEditRecipient}
                  className="text-xs text-orange-600 hover:text-orange-700 font-bold flex items-center gap-1 cursor-pointer bg-orange-50 hover:bg-orange-100 px-2.5 py-1 rounded-xl transition"
                >
                  <Edit3 size={12} /> Sửa thông tin
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2 text-xs text-[#331B08]">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 font-medium">Người nhận:</span>
                <strong className="font-bold">{workingOrder.recipientName || "Chưa cập nhật"}</strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 font-medium">Số điện thoại:</span>
                <strong className="font-mono font-bold">{workingOrder.recipientPhone || "Chưa cập nhật"}</strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 font-medium">Mã số thuế:</span>
                <strong className="font-mono font-bold text-gray-700">{workingOrder.customerTaxCode || workingOrder.customerCompany || "—"}</strong>
              </div>
              {workingOrder.customerNote && (
                <div className="flex justify-between items-start">
                  <span className="text-gray-500 font-medium shrink-0">Ghi chú:</span>
                  <span className="font-semibold text-gray-700 text-right">{workingOrder.customerNote}</span>
                </div>
              )}
              <div className="border-t border-dashed border-orange-100 pt-2 mt-1">
                <span className="text-gray-500 text-[10px] font-bold uppercase block mb-1">Địa chỉ nhận hàng:</span>
                <p className="m-0 bg-[#FFFDF9] p-2.5 rounded-xl border border-orange-100 leading-relaxed font-semibold">
                  {workingOrder.recipientAddress || "Chưa có địa chỉ"}
                </p>
              </div>
            </div>
          </div>
        </aside>
      </section>

      {/* Modal Chỉnh Sửa Thông Tin Nhận Hàng */}
      <Modal
        isOpen={isEditRecipientOpen}
        onClose={() => {
          if (!isSavingRecipient) setIsEditRecipientOpen(false);
        }}
        title="Chỉnh sửa thông tin giao nhận & Xuất HĐ"
      >
        <div className="flex flex-col gap-3.5 text-xs">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-orange-950">Họ và tên người nhận: *</label>
            <input
              type="text"
              className="text-input text-xs py-2.5 px-3 rounded-xl border-orange-200"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Nguyễn Văn A"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-orange-950">Số điện thoại liên hệ: *</label>
            <input
              type="tel"
              className="text-input text-xs py-2.5 px-3 rounded-xl border-orange-200 font-mono"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              placeholder="0987654321"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-orange-950">Địa chỉ nhận hàng sỉ: *</label>
            <textarea
              className="text-input text-xs py-2.5 px-3 min-h-[70px] rounded-xl border-orange-200"
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
              placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-orange-950">Mã số thuế (nếu cần HĐ):</label>
              <input
                type="text"
                className="text-input text-xs py-2.5 px-3 rounded-xl border-orange-200 font-mono"
                value={editTaxCode}
                onChange={(e) => setEditTaxCode(e.target.value)}
                placeholder="MST doanh nghiệp"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-orange-950">Ghi chú giao hàng:</label>
              <input
                type="text"
                className="text-input text-xs py-2.5 px-3 rounded-xl border-orange-200"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Giao giờ hành chính..."
              />
            </div>
          </div>

          <div className="flex gap-2.5 justify-end mt-4 pt-3 border-t border-dashed border-orange-100">
            <button
              type="button"
              className="tab-button text-xs py-2.5 px-4 cursor-pointer font-bold rounded-xl"
              onClick={() => setIsEditRecipientOpen(false)}
              disabled={isSavingRecipient}
            >
              Hủy
            </button>
            <button
              type="button"
              className="primary-button text-xs py-2.5 px-5 font-bold bg-orange-500 text-white rounded-xl cursor-pointer flex items-center gap-1.5 shadow-md disabled:opacity-50"
              onClick={handleSaveRecipient}
              disabled={isSavingRecipient}
              aria-busy={isSavingRecipient}
            >
              {isSavingRecipient ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
              <span>{isSavingRecipient ? "Đang lưu..." : "Lưu thay đổi"}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Yêu Cầu Sửa Đơn Sỉ Cho Khách */}
      <Modal
        isOpen={isRequestChangeOpen}
        onClose={() => {
          if (!isRequestingChange) setIsRequestChangeOpen(false);
        }}
        title="Yêu cầu điều chỉnh đơn hàng sỉ"
      >
        <div className="flex flex-col gap-3.5 text-xs">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-amber-900 text-[11px]">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <span>Khi gửi yêu cầu, đơn hàng sẽ chuyển về trạng thái thẩm định để nhân viên Pet Travel xem xét và cập nhật lại báo giá cho bạn.</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-orange-950">Nội dung bạn muốn điều chỉnh: *</label>
            <textarea
              className="text-input text-xs py-2.5 px-3 min-h-[90px] rounded-xl border-orange-200"
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="Ví dụ: Cho mình đổi sang 20 cái màu Vàng thay vì màu Hồng, và hỗ trợ thêm phí ship giúp mình nhé..."
            />
          </div>

          <div className="flex gap-2.5 justify-end mt-3 pt-3 border-t border-dashed border-orange-100">
            <button
              type="button"
              className="tab-button text-xs py-2.5 px-4 cursor-pointer font-bold rounded-xl"
              onClick={() => setIsRequestChangeOpen(false)}
              disabled={isRequestingChange}
            >
              Đóng
            </button>
            <button
              type="button"
              className="primary-button text-xs py-2.5 px-5 font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl cursor-pointer flex items-center gap-1.5 shadow-md disabled:cursor-wait disabled:opacity-60"
              onClick={handleSendChangeRequest}
              disabled={isRequestingChange}
              aria-busy={isRequestingChange}
            >
              {isRequestingChange ? <LoaderCircle size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              <span>{isRequestingChange ? "Đang gửi yêu cầu..." : "Gửi yêu cầu điều chỉnh"}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal xem lịch sử duyệt đơn hàng */}
      <OrderRevisionHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        orderId={workingOrder.id}
        orderNumber={workingOrder.number}
        allProducts={allProducts}
      />
    </>
  );
}
