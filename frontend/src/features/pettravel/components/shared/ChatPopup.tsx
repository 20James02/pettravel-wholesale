import { MessageCircle, MessageSquare } from "lucide-react";
import type { CustomerOrder, OrderComment } from "@/lib/domain";

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
  if (!isLoggedIn) return null;

  // Lọc comment tùy thuộc vào quyền Admin
  const visibleComments = comments.filter((comment) => {
    return isAdmin || comment.audience === "customer_visible";
  });

  const handleSend = () => {
    if (!chatInput.trim()) return;
    onSendComment(chatInput.trim(), isInternalComment);
    setChatInput("");
  };

  return (
    <>
      {/* Chat Bubble Button */}
      <button
        type="button"
        className="fixed bottom-6 right-6 z-1000 w-14 h-14 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-2xl hover:bg-orange-600 transition active:scale-95 floating-mascot"
        onClick={() => setIsChatOpen((prev) => !prev)}
        aria-label="Thảo luận đơn sỉ"
      >
        {isChatOpen ? <span className="text-xl font-bold">✕</span> : <MessageCircle size={26} className="fill-white/20" />}
      </button>

      {/* Chat Window Popup */}
      {isChatOpen && (
        <div
          className="fixed bottom-24 right-6 z-1000 w-[380px] max-w-[calc(100vw-32px)] panel shadow-2xl flex flex-col p-4 border-2 border-orange-200 bg-[#FFFDF9] animate-scale-in"
          style={{ borderRadius: "1.75rem" }}
        >
          {/* Chat Header */}
          <div className="flex items-center justify-between border-b border-dashed border-orange-100 pb-3 mb-3">
            <div>
              <h3 className="m-0 text-sm font-bold text-[#331B08] flex items-center gap-1.5">
                <MessageSquare size={16} className="text-orange-500" /> Trực tuyến Đơn sỉ
              </h3>
              <span className="text-[11px] muted font-mono font-bold">Mã đơn: {workingOrder.number || "Chưa tạo"}</span>
            </div>
            <span className="text-[10px] font-bold bg-orange-100 text-orange-800 rounded-full px-2.5 py-0.5">
              {visibleComments.length} tin nhắn
            </span>
          </div>

          {/* Message List */}
          <div className="flex flex-col gap-2.5 max-h-[260px] overflow-y-auto pr-1 mb-3">
            {visibleComments.length === 0 ? (
              <p className="text-xs text-center muted py-4 m-0 font-medium">Chưa có bình luận nào cho đơn hàng này.</p>
            ) : (
              visibleComments.map((comment) => {
                const isMe = (isAdmin && comment.author.includes("Quản trị")) || (!isAdmin && !comment.author.includes("Quản trị"));
                return (
                  <div
                    className={`flex flex-col max-w-[85%] ${isMe ? "self-end items-end" : "self-start items-start"}`}
                    key={comment.id}
                  >
                    <span className="text-[9px] muted font-bold mb-0.5 px-1">{comment.author}</span>
                    <div
                      className={`p-2.5 rounded-2xl border text-xs font-semibold ${
                        isMe
                          ? comment.audience === "internal"
                            ? "bg-blue-600 text-white border-blue-700 rounded-tr-none"
                            : "bg-orange-500 text-white border-orange-600 rounded-tr-none"
                          : comment.audience === "internal"
                            ? "bg-blue-50 text-blue-900 border-blue-200 rounded-tl-none"
                            : "bg-orange-50/50 text-[#331B08] border-orange-100 rounded-tl-none"
                      }`}
                    >
                      {comment.audience === "internal" && (
                        <span className="block text-[8px] uppercase tracking-wider font-bold mb-1 opacity-70">
                          🔒 Ghi chú Nội bộ Admin
                        </span>
                      )}
                      <p className="m-0 leading-relaxed break-words">{comment.message}</p>
                    </div>
                    <span className="text-[9px] muted font-mono mt-0.5 px-1">
                      {new Date(comment.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Chat Input & Controls */}
          <div className="border-t border-dashed border-orange-100 pt-3 flex flex-col gap-2">
            {isAdmin && (
              <label className="flex items-center gap-1.5 text-[11px] text-[#78350F] font-bold cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-orange-200 text-orange-500 focus:ring-orange-500"
                  checked={isInternalComment}
                  onChange={(e) => setIsInternalComment(e.target.checked)}
                />
                <span>Gửi dưới dạng Ghi chú Nội bộ Admin</span>
              </label>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                className="text-input text-xs py-2 px-3 flex-1"
                placeholder="Nhập nội dung lời nhắn..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend();
                }}
              />
              <button
                type="button"
                className="primary-button text-xs py-2 px-4 shrink-0 min-h-[38px] rounded-xl font-bold bg-orange-500 hover:bg-orange-600 text-white cursor-pointer active:scale-95 transition"
                onClick={handleSend}
              >
                Gửi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
