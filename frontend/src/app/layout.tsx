import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#2563eb",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://pettravel.vn"),
  title: {
    default: "Pet Travel Wholesale — Nền Tảng Phân Phối Sỉ Phụ Kiện Du Lịch Thú Cưng",
    template: "%s | Pet Travel Wholesale"
  },
  description: "Hệ thống phân phối sỉ phụ kiện du lịch, túi vận chuyển thú cưng, bát ăn gấp gọn, khăn lau diệt khuẩn chuẩn quốc tế cho Đại lý, Pet Shop, Spa Grooming toàn quốc. Chiết khấu đến 45%, báo giá 2 chiều thời gian thực.",
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
    url: "https://pettravel.vn",
    siteName: "Pet Travel Wholesale Vietnam",
    title: "Pet Travel Wholesale — Phân Phối Sỉ Phụ Kiện Du Lịch Thú Cưng Hàng Đầu",
    description: "Nền tảng đặt hàng sỉ trực tuyến dành cho Pet Shop, Phòng khám thú y, Spa Grooming. Chiết khấu sỉ hấp dẫn, duyệt đơn thời gian thực, thanh toán VietQR tự động.",
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
    title: "Pet Travel Wholesale — Phân Phối Sỉ Phụ Kiện Du Lịch Thú Cưng",
    description: "Chiết khấu sỉ đến 45%, giao hàng nhanh toàn quốc, báo giá đa phiên bản và thanh toán VietQR 247.",
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
    canonical: "https://pettravel.vn",
  },
};

const jsonLdSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://pettravel.vn/#organization",
      "name": "Pet Travel Wholesale Vietnam",
      "url": "https://pettravel.vn",
      "logo": "https://pettravel.vn/product-bag.svg",
      "description": "Nền tảng phân phối sỉ phụ kiện du lịch thú cưng hàng đầu Việt Nam cho các đại lý, pet shop, phòng khám thú y.",
      "contactPoint": {
        "@type": "ContactPoint",
        "telephone": "+84-988-888-888",
        "contactType": "wholesale sales",
        "areaServed": "VN",
        "availableLanguage": ["Vietnamese", "English"]
      },
      "sameAs": [
        "https://facebook.com/pettravelwholesale",
        "https://zalo.me/pettravel"
      ]
    },
    {
      "@type": "WebSite",
      "@id": "https://pettravel.vn/#website",
      "url": "https://pettravel.vn",
      "name": "Pet Travel Wholesale",
      "publisher": {
        "@id": "https://pettravel.vn/#organization"
      },
      "potentialAction": {
        "@type": "SearchAction",
        "target": "https://pettravel.vn/?search={search_term_string}",
        "query-input": "required name=search_term_string"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://pettravel.vn/#faq",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Chính sách chiết khấu sỉ của Pet Travel Wholesale như thế nào?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Pet Travel Wholesale áp dụng mức chiết khấu linh hoạt từ 25% đến 45% theo bậc đại lý Bạc, Vàng và Kim Cương cùng các chính sách hỗ trợ marketing đồng thương hiệu (Co-Marketing) độc quyền."
          }
        },
        {
          "@type": "Question",
          "name": "Số lượng đặt hàng tối thiểu (MOQ) là bao nhiêu?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "MOQ cho đơn hàng đầu tiên chỉ từ 5 sản phẩm/mẫu, tạo điều kiện thuận lợi cho các cửa hàng thú cưng và spa khởi nghiệp."
          }
        },
        {
          "@type": "Question",
          "name": "Phương thức thanh toán và đặt cọc đơn hàng sỉ ra sao?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Đại lý đặt cọc 30% giá trị đơn hàng thông qua mã chuyển khoản VietQR Napas 247 khi xác nhận bản báo giá. 70% còn lại thanh toán khi nhận hàng (COD) hoặc công nợ bảo lãnh theo kỳ."
          }
        }
      ]
    }
  ]
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="scroll-smooth">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSchema) }}
        />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased font-sans selection:bg-blue-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
