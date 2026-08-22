import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Đơn hàng",
  robots: { index: false, follow: false, noarchive: true }
};

export default function OrdersLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
