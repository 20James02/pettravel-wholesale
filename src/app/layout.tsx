import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pet Travel WholeSale",
  description: "B2B wholesale ordering and supplier orchestration platform for Pet Travel."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
