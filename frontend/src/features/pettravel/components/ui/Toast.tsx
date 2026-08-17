"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (toast: Omit<ToastItem, "id">) => void;
  toastSuccess: (title: string, message?: string) => void;
  toastError: (title: string, message?: string) => void;
  toastInfo: (title: string, message?: string) => void;
  toastWarning: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, title, message, duration = 3500 }: Omit<ToastItem, "id">) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      setToasts((prev) => [...prev.slice(-4), { id, type, title, message, duration }]);

      setTimeout(() => {
        removeToast(id);
      }, duration);
    },
    [removeToast]
  );

  const toastSuccess = useCallback(
    (title: string, message?: string) => showToast({ type: "success", title, message }),
    [showToast]
  );
  const toastError = useCallback(
    (title: string, message?: string) => showToast({ type: "error", title, message, duration: 5000 }),
    [showToast]
  );
  const toastInfo = useCallback(
    (title: string, message?: string) => showToast({ type: "info", title, message }),
    [showToast]
  );
  const toastWarning = useCallback(
    (title: string, message?: string) => showToast({ type: "warning", title, message, duration: 4000 }),
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, toastSuccess, toastError, toastInfo, toastWarning }}>
      {children}
      <div
        className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4 sm:px-0"
        aria-live="polite"
        role="region"
        aria-label="Thông báo hệ thống"
      >
        {toasts.map((toast) => {
          const typeStyles = {
            success: "bg-emerald-900/95 text-emerald-100 border-emerald-700/60",
            error: "bg-rose-900/95 text-rose-100 border-rose-700/60",
            warning: "bg-amber-900/95 text-amber-100 border-amber-700/60",
            info: "bg-slate-900/95 text-slate-100 border-slate-700/60",
          }[toast.type];

          const IconComponent = {
            success: CheckCircle2,
            error: AlertCircle,
            warning: AlertTriangle,
            info: Info,
          }[toast.type];

          const iconColor = {
            success: "text-emerald-400",
            error: "text-rose-400",
            warning: "text-amber-400",
            info: "text-blue-400",
          }[toast.type];

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl shadow-2xl border backdrop-blur-md transition-all duration-300 animate-slide-up ${typeStyles}`}
            >
              <IconComponent className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight">{toast.title}</p>
                {toast.message && (
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed break-words">{toast.message}</p>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
                aria-label="Đóng thông báo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
