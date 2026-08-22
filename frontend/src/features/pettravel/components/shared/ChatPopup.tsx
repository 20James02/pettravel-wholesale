"use client";

import { useEffect, useRef } from "react";
import { MessageCircle, MessageSquare, Send, X, ShieldAlert } from "lucide-react";
import type { CustomerOrder, OrderComment } from "@/lib/domain";
import { BottomSheet } from "../ui/BottomSheet";

interface ChatPopupProps {
  isLoggedIn: boolean;
  isAdmin: boolean;
  workingOrder: CustomerOrder;
  comments: OrderComment[];
  isChatOpen: boolean;
  setIsChatOpen: (val: boolean | ((prev: boolean) => boolean)) => void;
  chatInput: string;
  setChatInput: (val: string) => void;
  isInternalComment: boolean;
  setIsInternalComment: (val: boolean) => void;
  onSendComment: (message: string, isInternal: boolean) => void;
}

export function ChatPopup({
  isLoggedIn,
  isAdmin,
  workingOrder,
  comments,
  isChatOpen,
  setIsChatOpen,
  chatInput,
  setChatInput,
  isInternalComment,
  setIsInternalComment,
  onSendComment
}: ChatPopupProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Lọc comment tùy thuộc vào quyền Admin
  const visibleComments = comments.filter((comment) => {
    return isAdmin || comment.audience === "customer_visible";
  });

  const handleSend = () => {
    if (!chatInput.trim()) return;
    onSendComment(chatInput.trim(), isInternalComment);
    setChatInput("");
  };

  // Tự động cuộn xuống tin nhắn mới nhất
  useEffect(() => {
    if (isChatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [visibleComments, isChatOpen]);

  if (!isLoggedIn) return null;

  return (
    <>
      {/* Desktop Floating Bubble Button */}
      <button
        type="button"
        className="hidden md:flex fixed bottom-6 right-6 z-1000 w-14 h-14 rounded-full bg-orange-500 text-white items-center justify-center shadow-2xl hover:bg-orange-600 transition active:scale-95 cursor-pointer floating-mascot"
        onClick={() => setIsChatOpen((prev) => !prev)}
        aria-label="Thảo luận đơn sỉ"
      >
        {isChatOpen ? <span className="text-xl font-bold">✕</span> : <MessageCircle size={26} className="fill-white/20" />}
      </button>

      {/* Desktop Floating Popup Window */}
      {isChatOpen && (
        <div
          className="hidden md:flex fixed bottom-24 right-6 z-1000 w-[380px] panel shadow-2xl flex-col p-4 border-2 border-orange-200 bg-[#FFFDF9] animate-scale-in rounded-[1.75rem]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-dashed border-orange-100 pb-3 mb-3">
            <div>
              <h3 className="m-0 text-sm font-bold text-[#331B08] flex items-center gap-1.5 font-heading">
                <MessageSquare size={16} className="text-orange-500" /> Trao đổi Đơn sỉ #{workingOrder.number || "001"}
              </h3>
              <span className="text-[11px] text-orange-900/60 font-mono font-bold">
                Trực tuyến với Pet Travel
              </span>
            </div>
            <button
              type="button"
              className="w-7 h-7 rounded-full bg-orange-100 hover:bg-orange-200 text-orange-800 flex items-center justify-center transition active:scale-90"
              onClick={() => setIsChatOpen(false)}
            >
              <X size={14} />
            </button>
          </div>

          {/* Message List */}
          <div className="flex flex-col gap-2.5 max-h-[280px] overflow-y-auto pr-1 mb-3 overscroll-contain">
            {visibleComments.length === 0 ? (
              <p className="text-xs text-center text-gray-400 py-6 m-0 font-medium">
                Chưa có trao đổi nào. Hãy để lại lời nhắn để Pet Travel hỗ trợ bạn.
              </p>
            ) : (
              visibleComments.map((comment) => {
                const isMe = (isAdmin && comment.author.includes("Quản trị")) || (!isAdmin && !comment.author.includes("Quản trị"));
                return (
                  <div
                    className={`flex flex-col max-w-[85%] ${isMe ? "self-end items-end" : "self-start items-start"}`}
                    key={comment.id}
                  >
                    <span className="text-[9px] text-gray-500 font-bold mb-0.5 px-1">{comment.author}</span>
                    <div
                      className={`p-2.5 rounded-2xl border text-xs font-semibold ${
                        isMe
                          ? comment.audience === "internal"
                            ? "bg-blue-600 text-white border-blue-700 rounded-tr-none"
                            : "bg-orange-500 text-white border-orange-600 rounded-tr-none"
                          : comment.audience === "internal"
                            ? "bg-blue-50 text-blue-900 border-blue-200 rounded-tl-none"
                            : "bg-white text-[#331B08] border-orange-100 rounded-tl-none shadow-sm"
                      }`}
                    >
                      {comment.audience === "internal" && (
                        <span className="block text-[8px] uppercase tracking-wider font-bold mb-1 opacity-80 flex items-center gap-1">
                          <ShieldAlert size={10} /> Ghi chú nội bộ
                        </span>
                      )}
                      <p className="m-0 leading-relaxed break-words">{comment.message}</p>
                    </div>
                    <span className="text-[9px] text-gray-400 font-mono mt-0.5 px-1">
                      {new Date(comment.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box */}
          <div className="border-t border-dashed border-orange-100 pt-3 flex flex-col gap-2">
            {isAdmin && (
              <label className="flex items-center gap-1.5 text-[11px] text-[#78350F] font-bold cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-orange-200 text-orange-500 focus:ring-orange-500"
                  checked={isInternalComment}
                  onChange={(e) => setIsInternalComment(e.target.checked)}
                />
                <span>Ghi chú nội bộ Pet Travel</span>
              </label>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                className="text-input text-xs py-2 px-3 flex-1 rounded-xl"
                placeholder="Nhập lời nhắn cho đơn này..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend();
                }}
              />
              <button
                type="button"
                className="primary-button text-xs py-2 px-4 shrink-0 min-h-[38px] rounded-xl font-bold bg-orange-500 hover:bg-orange-600 text-white cursor-pointer active:scale-95 transition flex items-center gap-1"
                onClick={handleSend}
              >
                <Send size={13} />
                <span>Gửi</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Drawer (BottomSheet on Mobile Devices) */}
      <div className="md:hidden">
        <BottomSheet
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          title={
            <span className="flex items-center gap-2">
              <MessageSquare className="text-orange-500" size={18} /> Trao đổi Đơn sỉ #{workingOrder.number || "001"}
            </span>
          }
          subtitle="Trò chuyện trực tiếp với chuyên viên hỗ trợ Pet Travel"
          maxWidth="max-w-lg"
        >
          <div className="flex flex-col gap-3 h-[60vh] max-h-[450px]">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-1 overscroll-contain">
              {visibleComments.length === 0 ? (
                <p className="text-xs text-center text-gray-400 py-12 m-0 font-medium">
                  Chưa có lời nhắn nào. Hãy gửi phản hồi để Pet Travel hỗ trợ bạn.
                </p>
              ) : (
                visibleComments.map((comment) => {
                  const isMe = (isAdmin && comment.author.includes("Quản trị")) || (!isAdmin && !comment.author.includes("Quản trị"));
                  return (
                    <div
                      className={`flex flex-col max-w-[85%] ${isMe ? "self-end items-end" : "self-start items-start"}`}
                      key={comment.id}
                    >
                      <span className="text-[9px] text-gray-500 font-bold mb-0.5 px-1">{comment.author}</span>
                      <div
                        className={`p-2.5 rounded-2xl border text-xs font-semibold ${
                          isMe
                            ? comment.audience === "internal"
                              ? "bg-blue-600 text-white border-blue-700 rounded-tr-none"
                              : "bg-orange-500 text-white border-orange-600 rounded-tr-none"
                            : comment.audience === "internal"
                              ? "bg-blue-50 text-blue-900 border-blue-200 rounded-tl-none"
                              : "bg-white text-[#331B08] border-orange-100 rounded-tl-none shadow-sm"
                        }`}
                      >
                        {comment.audience === "internal" && (
                          <span className="block text-[8px] uppercase tracking-wider font-bold mb-1 opacity-80 flex items-center gap-1">
                            <ShieldAlert size={10} /> Ghi chú nội bộ
                          </span>
                        )}
                        <p className="m-0 leading-relaxed break-words">{comment.message}</p>
                      </div>
                      <span className="text-[9px] text-gray-400 font-mono mt-0.5 px-1">
                        {new Date(comment.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Footer */}
            <div className="border-t border-dashed border-orange-100 pt-3 flex flex-col gap-2 shrink-0">
              {isAdmin && (
                <label className="flex items-center gap-1.5 text-[11px] text-[#78350F] font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-orange-200 text-orange-500 focus:ring-orange-500"
                    checked={isInternalComment}
                    onChange={(e) => setIsInternalComment(e.target.checked)}
                  />
                  <span>Ghi chú nội bộ Pet Travel</span>
                </label>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  className="text-input text-sm py-2.5 px-3 flex-1 rounded-xl"
                  placeholder="Nhập lời nhắn trao đổi..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSend();
                  }}
                />
                <button
                  type="button"
                  className="primary-button text-xs py-2.5 px-4 shrink-0 rounded-xl font-bold bg-orange-500 hover:bg-orange-600 text-white cursor-pointer active:scale-95 transition flex items-center gap-1 shadow-md"
                  onClick={handleSend}
                >
                  <Send size={14} />
                  <span>Gửi</span>
                </button>
              </div>
            </div>
          </div>
        </BottomSheet>
      </div>
    </>
  );
}
