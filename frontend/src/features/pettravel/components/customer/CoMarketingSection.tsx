"use client";

import React from "react";
import { Sparkles, Store, Megaphone, RotateCcw, Zap, CheckCircle2, ArrowRight } from "lucide-react";

interface CoMarketingSectionProps {
  onOpenPartnerModal?: () => void;
}

export const CoMarketingSection: React.FC<CoMarketingSectionProps> = ({ onOpenPartnerModal }) => {
  const benefits = [
    {
      icon: Store,
      color: "bg-blue-50 text-blue-600 border-blue-200",
      title: "Kệ Trưng Bày & POSM Miễn Phí",
      desc: "Tài trợ 100% chi phí kệ mica chuyên dụng, Standee và bảng giá thương hiệu đặt tại điểm bán của đại lý.",
    },
    {
      icon: Megaphone,
      color: "bg-indigo-50 text-indigo-600 border-indigo-200",
      title: "Truyền Thông Đồng Thương Hiệu",
      desc: "Quảng bá điểm bán của đối tác trên hệ thống mạng xã hội & Website chính thức của Pet Travel Wholesale với hơn 50.000+ lượt tiếp cận/tháng.",
    },
    {
      icon: RotateCcw,
      color: "bg-emerald-50 text-emerald-600 border-emerald-200",
      title: "Bảo Vệ Vốn & Đổi Trả Linh Hoạt",
      desc: "Chính sách 1 đổi 1 trong 30 ngày cho lỗi kỹ thuật và hỗ trợ đổi mẫu chậm sang mẫu bán chạy để tối ưu hóa dòng tiền.",
    },
    {
      icon: Zap,
      color: "bg-amber-50 text-amber-600 border-amber-200",
      title: "Báo Giá 2 Chiều Real-Time",
      desc: "Hệ thống duyệt chiết khấu tự động, linh hoạt điều chỉnh số lượng và tạo mã VietQR đặt cọc Napas 247 tức thì.",
    },
  ];

  return (
    <section className="my-10 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden">
      {/* Decorative background glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

      <div className="relative z-10 max-w-5xl mx-auto space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> B2B Co-Marketing & Growth
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Chương Trình Đối Tác & Tài Trợ Bán Hàng Toàn Diện
          </h2>
          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto">
            Không chỉ phân phối sản phẩm, Pet Travel đồng hành cùng sự tăng trưởng doanh thu của từng Pet Shop, Phòng khám thú y và Spa Grooming trên toàn quốc.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {benefits.map((b, idx) => {
            const Icon = b.icon;
            return (
              <div
                key={idx}
                className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-5 sm:p-6 transition-all duration-300 hover:scale-[1.02] flex items-start gap-4 backdrop-blur-sm"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${b.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {b.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    {b.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
            <div className="text-xs sm:text-sm text-slate-200">
              <strong className="text-white font-semibold">Đã có hơn 350+ Đại lý & Spa</strong> tin tưởng hợp tác trên toàn quốc.
            </div>
          </div>
          {onOpenPartnerModal && (
            <button
              onClick={onOpenPartnerModal}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-blue-600/30 text-sm transition-all active:scale-95"
            >
              Đăng Ký Nhận Báo Giá Sỉ & Tài Trợ <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
