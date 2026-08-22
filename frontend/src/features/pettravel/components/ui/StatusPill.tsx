import type { ReactNode } from "react";

interface StatusPillProps {
  tone?: "success" | "warning" | "info";
  children: ReactNode;
}

export function StatusPill({ tone = "success", children }: StatusPillProps) {
  const styles = {
    success: "text-green-700 bg-green-100 border-green-200",
    warning: "text-amber-700 bg-amber-100 border-amber-200",
    info: "text-blue-700 bg-blue-100 border-blue-200"
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-extrabold font-heading ${styles[tone]}`}>
      {children}
    </span>
  );
}
