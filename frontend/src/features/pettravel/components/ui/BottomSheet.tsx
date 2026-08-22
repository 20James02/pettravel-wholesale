"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
  showCloseButton?: boolean;
  tone?: "brand" | "dark";
  closeOnBackdropClick?: boolean;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = "max-w-2xl",
  showCloseButton = true,
  tone = "brand",
  closeOnBackdropClick = false
}: BottomSheetProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when open and scroll sheet body to top
  useEffect(() => {
    if (!isOpen) return;
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = "hidden";
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isDark = tone === "dark";

  return (
    <div className="fixed inset-0 z-[1000] flex items-end md:items-center justify-center overscroll-contain">
      {/* Backdrop (locked by default to prevent accidental closing) */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fade-in transition-opacity"
        onClick={closeOnBackdropClick ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Sheet Container */}
      <div
        className={`relative w-full ${maxWidth} ${
          isDark
            ? "bg-[#13172b] text-white border-t-2 md:border-2 border-[#232a48] shadow-[0_25px_60px_rgba(0,0,0,0.5)]"
            : "bg-[#FFFDF9] text-[#331B08] border-t-2 md:border-2 border-orange-200 shadow-2xl"
        } rounded-t-[2rem] md:rounded-[1.75rem] z-10 flex flex-col max-h-[92vh] md:max-h-[88vh] animate-slide-up-sheet md:animate-scale-in md:my-6 overflow-hidden overscroll-contain`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Mobile Drag Pill Handle */}
        <div className="md:hidden w-full flex items-center justify-center pt-3 pb-1 shrink-0">
          <div className={`w-12 h-1.5 rounded-full ${isDark ? "bg-white/20" : "bg-orange-200"}`} />
        </div>

        {/* Header */}
        {(title || showCloseButton) && (
          <div
            className={`flex items-center justify-between px-5 py-3.5 border-b ${
              isDark ? "border-[#232a48]" : "border-dashed border-orange-100"
            } shrink-0`}
          >
            <div className="pr-6">
              {typeof title === "string" ? (
                <h3
                  className={`text-base md:text-lg font-bold ${
                    isDark ? "text-white" : "text-[#331B08]"
                  } m-0 font-heading leading-tight`}
                >
                  {title}
                </h3>
              ) : (
                title
              )}
              {subtitle && (
                <p className={`text-xs ${isDark ? "text-gray-400" : "text-orange-900/70"} font-semibold m-0 mt-0.5`}>
                  {subtitle}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                type="button"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition active:scale-90 cursor-pointer shrink-0 ${
                  isDark
                    ? "bg-white/10 hover:bg-white/20 text-gray-200"
                    : "bg-orange-100 hover:bg-orange-200 text-orange-800 font-bold"
                }`}
                onClick={onClose}
                aria-label="Đóng"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {/* Body Content with smooth internal scroll */}
        <div ref={bodyRef} className={`p-4 md:p-6 overflow-y-auto overscroll-contain flex-1 ${isDark ? "admin-dark-scroll" : ""}`}>
          {children}
        </div>

        {/* Sticky Footer (if provided) */}
        {footer && (
          <div
            className={`p-4 md:p-5 border-t ${
              isDark ? "border-[#232a48] bg-[#0f1222]/90" : "border-orange-100 bg-white/90"
            } backdrop-blur-md shrink-0 pb-safe`}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
