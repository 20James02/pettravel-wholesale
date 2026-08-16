"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { 
  History, 
  FileText, 
  MessageSquareQuote, 
  CheckCircle2, 
  RotateCcw, 
  MapPin, 
  Edit3, 
  User, 
  Clock, 
  Package, 
  ChevronDown, 
  ChevronUp, 
  Loader2,
  X
} from "lucide-react";
import type { OrderRevisionRecord, Product, OrderItem } from "@/lib/domain";
import { formatVnd } from "@/lib/money";
import { Modal } from "../ui/Modal";

interface OrderRevisionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  allProducts?: Product[];
}

export function OrderRevisionHistoryModal({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  allProducts = []
}: OrderRevisionHistoryModalProps) {
  const [history, setHistory] = useState<OrderRevisionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRevs, setExpandedRevs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen || !orderId) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetch(`/api/orders/history?order_id=${encodeURIComponent(orderId)}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Không thể tải lịch sử duyệt đơn.");
        }
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          const revs = (data.history || []) as OrderRevisionRecord[];
          setHistory(revs);
          // Expand the latest revision by default
          if (revs.length > 0) {
            setExpandedRevs({ [revs[revs.length - 1].id]: true });
          }
        }
      })
      .catch((err) => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, orderId]);

  const toggleExpand = (id: string) => {
    setExpandedRevs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getProductImage = (item: OrderItem) => {
    if (item.variantImage) return item.variantImage;
    const prod = allProducts.find(
      (p) => p.code === item.productCode || p.variants?.some((v) => v.sku === item.variantSku)
    );
    const variant = prod?.variants?.find((v) => v.sku === item.variantSku);
    return variant?.imageUrl || prod?.imageUrl || "/images/placeholder-product.svg";
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case "submit_proposal":
        return {
          label: "Khách gửi đơn ban đầu",
          color: "bg-blue-100 text-blue-800 border-blue-200",
          icon: <FileText size={14} className="text-blue-600" />
        };
      case "publish_quote":
        return {
          label: "Admin gửi báo giá sỉ",
          color: "bg-amber-100 text-amber-900 border-amber-300",
          icon: <MessageSquareQuote size={14} className="text-amber-700" />
        };
      case "accept_quote":
        return {
          label: "Khách đã chốt duyệt báo giá",
          color: "bg-emerald-100 text-emerald-800 border-emerald-300",
          icon: <CheckCircle2 size={14} className="text-emerald-600" />
        };
      case "request_changes":
        return {
          label: "Khách yêu cầu điều chỉnh đơn",
          color: "bg-rose-100 text-rose-800 border-rose-200",
          icon: <RotateCcw size={14} className="text-rose-600" />
        };
      case "update_shipping":
        return {
          label: "Cập nhật thông tin giao nhận",
          color: "bg-indigo-100 text-indigo-800 border-indigo-200",
          icon: <MapPin size={14} className="text-indigo-600" />
        };
      default:
        return {
          label: "Cập nhật đơn hàng",
          color: "bg-gray-100 text-gray-800 border-gray-200",
          icon: <Edit3 size={14} className="text-gray-600" />
        };
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Lịch sử duyệt đơn hàng qua lại #${orderNumber}`}
      maxWidth="max-w-3xl"
    >
      <div className="flex flex-col gap-4 max-h-[75vh] overflow-y-auto pr-1">
        <p className="text-xs text-gray-500">
          Toàn bộ lịch sử các lần điều chỉnh sản phẩm, cập nhật báo giá và trao đổi ghi chú giữa Khách hàng và Quản trị viên.
        </p>

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
            <Loader2 className="animate-spin text-orange-500" size={32} />
            <span className="text-sm font-medium">Đang tải lịch sử phiên bản đơn...</span>
          </div>
        )}

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm font-medium">
            {error}
          </div>
        )}

        {!isLoading && !error && history.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <History size={40} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Chưa có bản ghi lịch sử nào cho đơn hàng này.</p>
          </div>
        )}

        {!isLoading && !error && history.length > 0 && (
          <div className="relative pl-6 sm:pl-8 border-l-2 border-orange-200 flex flex-col gap-6 my-2">
            {history.map((rev) => {
              const badge = getActionBadge(rev.actionType);
              const isExpanded = !!expandedRevs[rev.id];
              const itemsCount = rev.itemsSnapshot?.length || 0;
              const activeQuote = rev.quoteSnapshot && rev.quoteSnapshot.length > 0
                ? rev.quoteSnapshot[rev.quoteSnapshot.length - 1]
                : null;

              return (
                <div key={rev.id} className="relative flex flex-col gap-2">
                  {/* Timeline Dot */}
                  <div className="absolute -left-[31px] sm:-left-[39px] top-1.5 w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-[10px] font-bold shadow-md border-2 border-white">
                    {rev.revisionNo}
                  </div>

                  {/* Header Box */}
                  <div className="p-3 sm:p-4 bg-white border border-orange-100 rounded-2xl shadow-xs hover:border-orange-300 transition-colors flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${badge.color}`}>
                          {badge.icon} {badge.label}
                        </span>
                        <span className="text-xs font-bold text-gray-700 flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-200">
                          <User size={12} className="text-gray-400" /> {rev.actorName} ({rev.actorRole === "admin" ? "Admin" : "Đại lý"})
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 flex items-center gap-1">
                        <Clock size={12} /> {rev.createdAt ? new Date(rev.createdAt).toLocaleString("vi-VN") : "Vừa xong"}
                      </div>
                    </div>

                    {/* Note/Reason */}
                    {rev.note && (
                      <div className="p-2.5 bg-amber-50/80 border border-amber-200/80 rounded-xl text-xs text-amber-900 font-medium leading-relaxed">
                        <span className="font-bold text-amber-800">Ghi chú:</span> {rev.note}
                      </div>
                    )}

                    {/* Quick Summary Info */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-gray-600 bg-[#FFFDF9] p-2.5 rounded-xl border border-orange-100">
                      <div>
                        <span className="text-gray-400 block text-[10px]">Sản phẩm:</span>
                        <span className="font-bold text-[#331B08]">{itemsCount} phân loại</span>
                      </div>
                      {activeQuote ? (
                        <>
                          <div>
                            <span className="text-gray-400 block text-[10px]">Tổng tiền báo giá:</span>
                            <span className="font-bold text-orange-600">{formatVnd(activeQuote.finalTotal)}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block text-[10px]">Tiền cọc yêu cầu:</span>
                            <span className="font-bold text-emerald-600">{formatVnd(activeQuote.depositAmount)}</span>
                          </div>
                        </>
                      ) : (
                        <div>
                          <span className="text-gray-400 block text-[10px]">Trạng thái:</span>
                          <span className="font-bold text-gray-700">{rev.toCommercialStatus}</span>
                        </div>
                      )}
                    </div>

                    {/* Expand/Collapse Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(rev.id)}
                      className="self-start text-xs text-orange-600 hover:text-orange-700 font-bold flex items-center gap-1 mt-1 transition-colors cursor-pointer"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp size={14} /> Thu gọn chi tiết sản phẩm & địa chỉ
                        </>
                      ) : (
                        <>
                          <ChevronDown size={14} /> Xem chi tiết ({itemsCount} sản phẩm)
                        </>
                      )}
                    </button>

                    {/* Expanded Snapshot Details */}
                    {isExpanded && (
                      <div className="flex flex-col gap-3 pt-2 border-t border-dashed border-orange-100 animate-fadeIn">
                        {/* Items list */}
                        <div className="flex flex-col gap-2">
                          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                            Danh sách sản phẩm tại lần duyệt này:
                          </span>
                          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                            {rev.itemsSnapshot?.map((item, idx) => (
                              <div
                                key={item.id || idx}
                                className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-100 gap-2"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="w-9 h-9 rounded-md overflow-hidden bg-gray-50 border border-gray-200 shrink-0 relative">
                                    <Image
                                      src={getProductImage(item)}
                                      alt={item.productName}
                                      fill
                                      className="object-cover"
                                      sizes="36px"
                                      unoptimized
                                    />
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-xs font-bold text-gray-800 line-clamp-1">
                                      {item.productName}
                                    </span>
                                    <span className="text-[10px] text-gray-400">
                                      Phân loại: {item.variantLabel} | SKU: {item.variantSku}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-xs font-bold text-orange-600 block">
                                    SL: {item.quantity}
                                  </span>
                                  <span className="text-[10px] text-gray-500">
                                    {formatVnd(item.unitPriceSnapshot)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Shipping snapshot */}
                        {rev.shippingSnapshot?.recipientName && (
                          <div className="p-2 bg-gray-50 rounded-xl border border-gray-200/70 text-[11px] text-gray-600 flex flex-col gap-0.5">
                            <span className="font-bold text-gray-700">Thông tin nhận hàng:</span>
                            <span>
                              {rev.shippingSnapshot.recipientName} ({rev.shippingSnapshot.recipientPhone}) - {rev.shippingSnapshot.recipientAddress}
                            </span>
                            {rev.shippingSnapshot.customerTaxCode && (
                              <span>MST: {rev.shippingSnapshot.customerTaxCode}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </Modal>
  );
}
