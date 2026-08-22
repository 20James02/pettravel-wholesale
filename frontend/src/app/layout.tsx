import type { Metadata, Viewport } from "next";
import { Nunito_Sans, Varela_Round } from "next/font/google";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";

const siteUrl = getSiteUrl();
const nunitoSans = Nunito_Sans({
  subsets: ["latin", "vietnamese"],
  variable: "--font-nunito-sans",
  display: "swap"
});
const varelaRound = Varela_Round({
  weight: "400",
  subsets: ["latin", "vietnamese"],
  variable: "--font-varela-round",
  display: "swap"
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#2563eb",
};

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "Đặt Hàng Sỉ Phụ Kiện Thú Cưng | Pet Travel",
    template: "%s | Pet Travel Wholesale"
  },
  description: "Nền tảng đặt hàng sỉ phụ kiện thú cưng cho đại lý, pet shop và spa: duyệt catalog, gửi yêu cầu báo giá, trao đổi và theo dõi đơn trực tuyến.",
  keywords: [
    "sỉ phụ kiện thú cưng",
    "bán buôn đồ dùng thú cưng",
    "túi vận chuyển chó mèo giá sỉ",
    "phụ kiện du lịch thú cưng",
    "pet travel wholesale",
    "nhà phân phối phụ kiện pet",
    "đại lý đồ dùng chó mèo",
    "bát ăn gấp gọn thú cưng sỉ"
  ],
  authors: [{ name: "Pet Travel Wholesale Vietnam", url: "https://pettravel.vn" }],
  creator: "Pet Travel Wholesale Team",
  publisher: "Pet Travel Wholesale",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "vi_VN",
    url: siteUrl,
    siteName: "Pet Travel Wholesale Vietnam",
    title: "Đặt Hàng Sỉ Phụ Kiện Thú Cưng | Pet Travel",
    description: "Duyệt catalog, gửi yêu cầu báo giá, trao đổi với đội vận hành và theo dõi đơn hàng sỉ trực tuyến.",
    images: [
      {
        url: "/product-bag.svg",
        width: 800,
        height: 600,
        alt: "Pet Travel Wholesale Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Đặt Hàng Sỉ Phụ Kiện Thú Cưng | Pet Travel",
    description: "Nền tảng báo giá và theo dõi đơn hàng sỉ dành cho đại lý, pet shop và spa thú cưng.",
    images: ["/product-bag.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
};

const jsonLdSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl.href}#organization`,
      "name": "Pet Travel Wholesale Vietnam",
      "url": siteUrl.href,
      "logo": new URL("/product-bag.svg", siteUrl).href,
      "description": "Nền tảng phân phối sỉ phụ kiện du lịch thú cưng cho đại lý, pet shop và cơ sở chăm sóc thú cưng tại Việt Nam."
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl.href}#website`,
      "url": siteUrl.href,
      "name": "Pet Travel Wholesale",
      "publisher": {
        "@id": `${siteUrl.href}#organization`
      }
    }
  ]
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`scroll-smooth ${nunitoSans.variable} ${varelaRound.variable}`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSchema).replace(/</g, "\\u003c") }}
        />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased font-sans selection:bg-blue-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
