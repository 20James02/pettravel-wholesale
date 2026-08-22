import type { ButtonHTMLAttributes, ReactNode } from "react";

interface SpringButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger" | "icon";
  children: ReactNode;
}

export function SpringButton({ variant = "primary", children, className = "", ...props }: SpringButtonProps) {
  const baseStyle = "min-height-[46px] rounded-btn border-2 border-transparent inline-flex items-center justify-center gap-2 px-4 font-bold font-heading transition-all duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";
  
  const variants = {
    primary: "bg-primary text-white border-primary-strong shadow-clay-btn hover:bg-orange-600 hover:-translate-y-0.5",
    ghost: "bg-white border-brand-line text-brand-ink shadow-[inset_-2px_-2px_4px_rgba(120,53,15,0.03),0_4px_10px_rgba(120,53,15,0.03)] hover:border-primary hover:bg-orange-50/20 hover:text-primary-strong hover:-translate-y-0.5",
    danger: "bg-red-50 border-red-300 text-red-600 shadow-clay-btn hover:bg-red-100 hover:-translate-y-0.5",
    icon: "bg-white border-brand-line text-brand-ink shadow-[inset_-2px_-2px_4px_rgba(120,53,15,0.03),0_4px_10px_rgba(120,53,15,0.03)] hover:border-primary hover:bg-orange-50/20 hover:text-primary-strong hover:-translate-y-0.5 p-2"
  };

  return (
    <button
      className={`${baseStyle} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
