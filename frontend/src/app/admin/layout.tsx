import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quản trị",
  robots: { index: false, follow: false, noarchive: true }
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
