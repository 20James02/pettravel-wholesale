"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, ArrowRight, X } from "lucide-react";

interface AnnouncementBannerProps {
  onOpenPartnerModal?: () => void;
}

export const AnnouncementBanner: React.FC<AnnouncementBannerProps> = ({ onOpenPartnerModal }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      const isDismissed = localStorage.getItem("pettravel_dismissed_announcement_v2") === "true";
      if (!isDismissed) {
        setIsVisible(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem("pettravel_dismissed_announcement_v2", "true");
  };

  if (!isVisible) return null;

  return (
    <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white px-4 py-2.5 text-xs sm:text-sm font-medium shadow-inner transition-all duration-300 relative z-40">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 justify-center text-center truncate">
          <span className="inline-flex items-center gap-1 bg-white/20 text-white px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase shrink-0">
            <Sparkles className="w-3 h-3 text-amber-300" /> B2B Partner
          </span>
          <span className="truncate">
            Chương trình đồng hành cùng đại lý: tư vấn danh mục, báo giá và hỗ trợ bán hàng theo nhu cầu thực tế.
          </span>
          {onOpenPartnerModal && (
            <button
              onClick={onOpenPartnerModal}
              className="hidden md:inline-flex items-center gap-1 bg-white text-blue-800 hover:bg-amber-300 hover:text-slate-900 font-bold px-2.5 py-0.5 rounded-full text-xs transition-colors shrink-0 shadow-sm ml-2"
            >
              Đăng ký ngay <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0 ml-2"
          aria-label="Đóng thông báo"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
