"use client";

import { useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { PackageSearch, Filter } from "lucide-react";
import type { Product } from "@/lib/domain";
import { ProductSkeletonGrid } from "../ui/ProductSkeleton";
import { CoMarketingSection } from "./CoMarketingSection";

const ProductCard = dynamic(
  () => import("./ProductCard").then((module) => module.ProductCard),
  { loading: () => <div className="min-h-80 animate-pulse rounded-3xl bg-slate-100" aria-hidden="true" /> }
);

interface CatalogProps {
  products: Product[];
  availableCategories?: string[];
  categoryFilter?: string;
  setCategoryFilter?: (cat: string) => void;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  isLoggedIn: boolean;
  onSelectProduct: (product: Product) => void;
  isLoading?: boolean;
  onOpenPartnerModal?: () => void;
}

export function Catalog({
  products,
  availableCategories = ["Tất cả", "Túi Vận Chuyển", "Bát Ăn Du Lịch", "Khăn Lau Vệ Sinh", "Phụ Kiện Khác"],
  categoryFilter = "Tất cả",
  setCategoryFilter,
  searchQuery = "",
  isLoggedIn,
  onSelectProduct,
  isLoading = false,
  onOpenPartnerModal
}: CatalogProps) {
  const catalogRootRef = useRef<HTMLDivElement>(null);

  // Lọc sản phẩm ở client-side cho Catalog
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = categoryFilter === "Tất cả" || p.category === categoryFilter;
      const matchSearch =
        searchQuery === "" ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, categoryFilter, searchQuery]);

  useEffect(() => {
    const root = catalogRootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    void import("@/lib/motion/gsap-catalog-motion")
      .then((module) => module.mountCatalogIntroMotion(root))
      .then((nextCleanup) => {
        if (disposed) nextCleanup();
        else cleanup = nextCleanup;
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    const root = catalogRootRef.current;
    if (
      !root ||
      isLoading ||
      filteredProducts.length === 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    void import("@/lib/motion/gsap-catalog-motion")
      .then((module) => module.mountCatalogProductMotion(root))
      .then((nextCleanup) => {
        if (disposed) nextCleanup();
        else cleanup = nextCleanup;
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [filteredProducts.length, isLoading]);

  return (
    <div ref={catalogRootRef} className="w-full flex flex-col gap-6 animate-fade-in">
      <section data-gsap="hero" className="rounded-3xl border border-blue-100 bg-gradient-to-br from-white via-blue-50 to-indigo-50 px-5 py-7 shadow-sm sm:px-8 sm:py-10">
        <div className="max-w-3xl space-y-3">
          <p data-gsap="hero-item" className="m-0 text-xs font-extrabold uppercase tracking-[0.18em] text-blue-700">
            Cổng đặt hàng B2B Pet Travel
          </p>
          <h1 data-gsap="hero-item" className="m-0 text-3xl font-black leading-tight tracking-tight text-slate-950 sm:text-4xl">
            Đặt hàng sỉ phụ kiện thú cưng cho đại lý
          </h1>
          <p data-gsap="hero-item" className="m-0 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Duyệt catalog, gửi yêu cầu báo giá, trao đổi trực tiếp với đội vận hành và theo dõi tiến độ đơn hàng trên cùng một hệ thống.
          </p>
          {!isLoggedIn && onOpenPartnerModal && (
            <button
              data-gsap="hero-item"
              type="button"
              onClick={onOpenPartnerModal}
              className="mt-2 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              Đăng ký tư vấn mở tài khoản đại lý
            </button>
          )}
        </div>
      </section>

      {/* Category Pills & Quick Filter */}
      {setCategoryFilter && (
        <div data-gsap="filters" className="flex items-center justify-between gap-3 overflow-x-auto pb-2 scrollbar-none pt-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 uppercase tracking-wider pl-1 shrink-0">
              <Filter className="w-3.5 h-3.5" /> Danh mục:
            </span>
            {availableCategories.map((cat) => {
              const isActive = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    isActive
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/20 scale-105"
                      : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 font-medium shrink-0 pr-1">
            <span>Hiển thị: <strong className="text-slate-800 font-bold">{filteredProducts.length}</strong> sản phẩm sỉ</span>
          </div>
        </div>
      )}

      {/* Product Grid / Skeleton State */}
      {isLoading ? (
        <ProductSkeletonGrid count={8} />
      ) : filteredProducts.length === 0 ? (
        <div className="panel p-12 text-center flex flex-col items-center justify-center gap-3 bg-[#FFFDF9] border-2 border-dashed border-orange-200 rounded-3xl animate-fade-in max-w-xl mx-auto my-8">
          <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 shadow-inner">
            <PackageSearch size={32} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#331B08] m-0 font-['Varela_Round']">
              Không tìm thấy sản phẩm phù hợp
            </h3>
            <p className="muted text-xs mt-1 m-0 max-w-sm">
              Không có sản phẩm nào khớp với bộ lọc &quot;{categoryFilter}&quot;{searchQuery ? ` và từ khóa &quot;${searchQuery}&quot;` : ""}. Vui lòng chọn lại danh mục khác.
            </p>
          </div>
        </div>
      ) : (
        <div className="catalog-grid">
          {filteredProducts.map((product) => (
            <div key={product.id} data-gsap="product-card" className="min-w-0">
              <ProductCard
                product={product}
                isLoggedIn={isLoggedIn}
                onClick={() => onSelectProduct(product)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Co-Marketing & B2B Growth Section */}
      <CoMarketingSection onOpenPartnerModal={onOpenPartnerModal} />
    </div>
  );
}
