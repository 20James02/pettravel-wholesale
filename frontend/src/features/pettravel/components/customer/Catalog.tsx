"use client";

import { useMemo } from "react";
import { PackageSearch, Search, X } from "lucide-react";
import type { Product } from "@/lib/domain";
import { ProductCard } from "./ProductCard";
import { ProductSkeletonGrid } from "../ui/ProductSkeleton";

interface CatalogProps {
  products: Product[];
  availableCategories: string[];
  categoryFilter: string;
  setCategoryFilter: (cat: string) => void;
  searchQuery: string;
  setSearchQuery?: (q: string) => void;
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
  setSearchQuery,
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
    <div className="flex flex-col gap-4 sm:gap-6 animate-fade-in">
      {/* Category filter tabs & Search with smooth horizontal scroll */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white/80 backdrop-blur-md p-2.5 sm:p-3 rounded-2xl border border-orange-100 shadow-xs">
        {/* Category pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none overscroll-contain snap-x touch-pan-x -mx-1 px-1 flex-1">
          {availableCategories.map((cat) => {
            const isActive = categoryFilter === cat;
            const count =
              cat === "Tất cả"
                ? products.length
                : products.filter((p) => p.category === cat).length;

            return (
              <button
                key={cat}
                type="button"
                className={`tab-button min-h-[36px] whitespace-nowrap snap-start text-xs font-bold rounded-full transition-all duration-200 cursor-pointer ${
                  isActive
                    ? "bg-orange-500 text-white border-orange-600 shadow-sm transform -translate-y-0.5"
                    : "bg-white hover:bg-orange-50 text-orange-950/80 border-orange-200"
                }`}
                onClick={() => setCategoryFilter(cat)}
              >
                <span>{cat}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    isActive ? "bg-white/20 text-white" : "bg-orange-100 text-orange-800"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search input */}
        {setSearchQuery && (
          <div className="relative shrink-0 w-full sm:w-64">
            <input
              type="text"
              placeholder="Tìm tên, mã sản phẩm sỉ..."
              className="text-input pl-8 pr-7 text-xs w-full py-1.5 rounded-full border-orange-200 bg-white"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search className="absolute left-2.5 top-2 text-orange-400" size={14} />
            {searchQuery && (
              <button
                type="button"
                className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600 transition cursor-pointer"
                onClick={() => setSearchQuery("")}
              >
                <X size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Product Grid / Skeleton State */}
      {isLoading ? (
        <ProductSkeletonGrid count={6} />
      ) : filteredProducts.length === 0 ? (
        <div className="panel p-10 text-center flex flex-col items-center justify-center gap-3 bg-[#FFFDF9] border-2 border-dashed border-orange-200 rounded-3xl animate-fade-in">
          <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
            <PackageSearch size={28} />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#331B08] m-0 font-['Varela_Round']">
              Không tìm thấy sản phẩm nào
            </h3>
            <p className="muted text-xs mt-1 m-0">
              Thử tìm kiếm với từ khóa khác hoặc chuyển danh mục sản phẩm khác.
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
    </div>
  );
}
