"use client";

import { useMemo } from "react";
import { PackageSearch, Filter } from "lucide-react";
import type { Product } from "@/lib/domain";
import { ProductCard } from "./ProductCard";
import { ProductSkeletonGrid } from "../ui/ProductSkeleton";
import { CoMarketingSection } from "./CoMarketingSection";

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

  return (
    <div className="w-full flex flex-col gap-6 animate-fade-in">
      {/* Category Pills & Quick Filter */}
      {setCategoryFilter && (
        <div className="flex items-center justify-between gap-3 overflow-x-auto pb-2 scrollbar-none pt-1">
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
            <ProductCard
              key={product.id}
              product={product}
              isLoggedIn={isLoggedIn}
              onClick={() => onSelectProduct(product)}
            />
          ))}
        </div>
      )}

      {/* Co-Marketing & B2B Growth Section */}
      <CoMarketingSection onOpenPartnerModal={onOpenPartnerModal} />
    </div>
  );
}
