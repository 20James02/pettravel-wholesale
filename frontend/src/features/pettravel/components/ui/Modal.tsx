"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { SpringButton } from "./SpringButton";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  closeOnBackdropClick?: boolean;
  maxWidth?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  closeOnBackdropClick = false,
  maxWidth = "max-w-2xl"
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when open and scroll to top of modal
  useEffect(() => {
    if (!isOpen) return;
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = "hidden";
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      {/* Overlay (locked by default to prevent accidental form closing) */}
      <div 
        className="absolute inset-0 bg-brand-ink/40 backdrop-blur-sm animate-fade-in" 
        onClick={closeOnBackdropClick ? onClose : undefined}
      />
      
      {/* Modal Content */}
      <div 
        ref={contentRef}
        className={`relative w-full ${maxWidth} bg-white border-2 border-brand-line rounded-panel shadow-clay-card p-6 animate-scale-in max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-dashed border-brand-line pb-4 mb-4">
          <h3 className="text-xl font-heading text-brand-ink m-0">{title}</h3>
          <SpringButton variant="icon" onClick={onClose} className="min-h-[32px] p-1">
            <X className="w-5 h-5" />
          </SpringButton>
        </div>
        
        {/* Body */}
        <div>{children}</div>
      </div>
    </div>
  );
}
