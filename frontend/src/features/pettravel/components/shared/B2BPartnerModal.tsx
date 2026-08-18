"use client";

import React, { useState } from "react";
import { Modal } from "../ui/Modal";
import { Building2, Phone, User, MapPin, CheckCircle2, Gift, Send, ShieldCheck } from "lucide-react";
import { useToast } from "../ui/Toast";

interface B2BPartnerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const B2BPartnerModal: React.FC<B2BPartnerModalProps> = ({ isOpen, onClose }) => {
  const { toastSuccess, toastError } = useToast();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    businessName: "",
    contactName: "",
    phone: "",
    city: "Hà Nội",
    businessType: "pet_shop",
    monthlyVolume: "10_50m",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.businessName.trim() || !formData.phone.trim() || !formData.contactName.trim()) {
      toastError("Thiếu thông tin", "Vui lòng nhập đầy đủ Tên đại lý, Người liên hệ và Số điện thoại/Zalo.");
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
      toastSuccess("Đăng ký thành công!", "Chuyên viên B2B Pet Travel sẽ gửi bảng giá sỉ qua Zalo trong 5 phút.");
    }, 600);
  };

  const handleReset = () => {
    setIsSubmitted(false);
    setFormData({
      businessName: "",
      contactName: "",
      phone: "",
      city: "Hà Nội",
      businessType: "pet_shop",
      monthlyVolume: "10_50m",
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Hợp Tác Đại Lý & Co-Marketing B2B" maxWidth="max-w-xl">
      {!isSubmitted ? (
        <div className="space-y-5">
          {/* Value Proposition Header */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl p-4 sm:p-5 flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md">
              <Gift className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                Nhận Gói Tài Trợ Đại Lý & Chiết Khấu Đến 45%
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
                Dành cho Pet Shop, Phòng khám thú y, Spa Grooming. Tặng bộ Standee + Kệ mica trưng bày & Hỗ trợ truyền thông đồng thương hiệu.
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Tên Shop / Phòng khám <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="VD: Pet Spa Sài Gòn"
                    value={formData.businessName}
                    onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Họ tên người đại diện <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="VD: Nguyễn Văn An"
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Số điện thoại / Zalo <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="tel"
                    required
                    placeholder="0988.xxx.xxx"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Tỉnh / Thành phố
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <select
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                  >
                    <option value="Hà Nội">Hà Nội</option>
                    <option value="TP. Hồ Chí Minh">TP. Hồ Chí Minh</option>
                    <option value="Đà Nẵng">Đà Nẵng</option>
                    <option value="Hải Phòng">Hải Phòng</option>
                    <option value="Cần Thơ">Cần Thơ</option>
                    <option value="Tỉnh thành khác">Tỉnh thành khác</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Mô hình kinh doanh
                </label>
                <select
                  value={formData.businessType}
                  onChange={(e) => setFormData({ ...formData, businessType: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                >
                  <option value="pet_shop">Pet Shop & Phụ Kiện</option>
                  <option value="vet_clinic">Phòng Khám Thú Y</option>
                  <option value="grooming_spa">Spa Grooming Chăm Sóc</option>
                  <option value="breeder">Trại Nhân Giống Thú Cưng</option>
                  <option value="online_seller">Kinh Doanh Online / TikTok Shop</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Quy mô dự kiến / tháng
                </label>
                <select
                  value={formData.monthlyVolume}
                  onChange={(e) => setFormData({ ...formData, monthlyVolume: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                >
                  <option value="5_10m">Từ 5 - 10 triệu VNĐ</option>
                  <option value="10_50m">Từ 10 - 50 triệu VNĐ (Ưu đãi Vàng)</option>
                  <option value="50m_plus">Trên 50 triệu VNĐ (Đại lý Kim Cương)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Cam kết bảo mật thông tin & Hỗ trợ kỹ thuật 24/7 không spam.</span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Để sau
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition-all text-sm disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {isSubmitting ? "Đang gửi..." : "Nhận Báo Giá Sỉ & Quà Tặng"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="text-center py-6 space-y-4">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <div>
            <h4 className="text-lg font-bold text-slate-900">Đăng Ký Đại Lý Thành Công!</h4>
            <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
              Cảm ơn quý đối tác <strong>{formData.businessName}</strong>. Mã ưu đãi đại lý độc quyền của bạn:
            </p>
          </div>

          <div className="inline-block bg-amber-50 border-2 border-dashed border-amber-300 rounded-2xl px-6 py-3 my-2 shadow-sm">
            <span className="text-xs uppercase tracking-wider text-amber-800 font-bold block mb-1">Mã Voucher Giảm Thêm 5% Đơn Đầu</span>
            <code className="text-xl font-mono font-black text-amber-900 tracking-widest select-all">VIP-PARTNER-2026</code>
          </div>

          <p className="text-xs text-slate-500">
            Chuyên viên tư vấn sỉ sẽ liên hệ Zalo qua số <strong>{formData.phone}</strong> trong vòng 5 phút để gửi catalog đầy đủ.
          </p>

          <div className="pt-3">
            <button
              type="button"
              onClick={handleReset}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-xl shadow-md text-sm transition-all active:scale-95"
            >
              Xem Danh Mục Sản Phẩm Sỉ
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};
