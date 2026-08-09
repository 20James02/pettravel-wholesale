import type { ReactNode } from "react";
import { X } from "lucide-react";
import { SpringButton } from "./SpringButton";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-brand-ink/40 backdrop-blur-sm animate-fade-in" 
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative w-full max-w-2xl bg-white border-2 border-brand-line rounded-panel shadow-clay-card p-6 animate-scale-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-dashed border-brand-line pb-4 mb-4">
          <h3 className="text-xl font-['Varela_Round'] text-brand-ink m-0">{title}</h3>
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
