import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hồ sơ",
  robots: { index: false, follow: false, noarchive: true }
};

export default function ProfileLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
