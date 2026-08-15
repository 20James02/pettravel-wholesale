"use client";

import { useMemo } from "react";
import { PackageSearch } from "lucide-react";
import type { Product } from "@/lib/domain";
import { ProductCard } from "./ProductCard";
import { ProductSkeletonGrid } from "../ui/ProductSkeleton";

interface CatalogProps {
  products: Product[];
  availableCategories: string[];
  categoryFilter: string;
  setCategoryFilter: (cat: string) => void;
  searchQuery: string;
  isLoggedIn: boolean;
  onSelectProduct: (product: Product) => void;
  isLoading?: boolean;
}

export function Catalog({
  products,
  availableCategories,
  categoryFilter,
  setCategoryFilter,
  searchQuery,
  isLoggedIn,
  onSelectProduct,
  isLoading = false
}: CatalogProps) {
  // Lọc sản phẩm ở client-side cho Catalog
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = categoryFilter === "Tất cả" || p.category === categoryFilter;
      const matchSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, categoryFilter, searchQuery]);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Category filter tabs with smooth horizontal scroll */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none overscroll-contain snap-x touch-pan-x -mx-1 px-1">
        {availableCategories.map((cat) => {
          const isActive = categoryFilter === cat;
          const count = cat === "Tất cả" 
            ? products.length 
            : products.filter(p => p.category === cat).length;

          return (
            <button
              key={cat}
              type="button"
              className={`tab-button min-h-[38px] whitespace-nowrap snap-start text-xs font-bold rounded-xl transition-all duration-200 cursor-pointer ${
                isActive
                  ? "bg-orange-500 text-white border-orange-600 shadow-md transform -translate-y-0.5"
                  : "bg-white/80 hover:bg-orange-50 text-orange-950/80 border-orange-200"
              }`}
              onClick={() => setCategoryFilter(cat)}
            >
              <span>{cat}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                isActive ? "bg-white/20 text-white" : "bg-orange-100 text-orange-800"
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Product Grid / Skeleton State */}
      {isLoading ? (
        <ProductSkeletonGrid count={6} />
      ) : filteredProducts.length === 0 ? (
        <div className="panel p-10 text-center flex flex-col items-center justify-center gap-3 bg-[#FFFDF9] border-2 border-dashed border-orange-200 rounded-3xl animate-fade-in">
          <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
            <PackageSearch size={28} />
          </div>
          <h4 className="text-base font-bold text-[#331B08] m-0 font-['Varela_Round']">
            Không tìm thấy sản phẩm sỉ phù hợp
          </h4>
          <p className="text-xs text-orange-900/60 font-semibold m-0 max-w-md">
            Vui lòng thử tìm kiếm với từ khóa khác hoặc chọn danh mục &quot;Tất cả&quot; để khám phá thêm.
          </p>
          <button
            type="button"
            className="tab-button text-xs font-bold py-2 px-4 bg-orange-500 text-white rounded-xl mt-2 cursor-pointer"
            onClick={() => setCategoryFilter("Tất cả")}
          >
            Xem tất cả {products.length} sản phẩm
          </button>
        </div>
      ) : (
        <section className="catalog-grid animate-fade-in">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              isLoggedIn={isLoggedIn}
              onClick={() => onSelectProduct(product)}
            />
          ))}
        </section>
      )}
    </div>
  );
}
