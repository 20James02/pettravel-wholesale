"use client";

import { useMemo } from "react";
import { PackageSearch } from "lucide-react";
import type { Product } from "@/lib/domain";
import { ProductCard } from "./ProductCard";
import { ProductSkeletonGrid } from "../ui/ProductSkeleton";

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
}

export function Catalog({
  products,
  categoryFilter = "Tất cả",
  searchQuery = "",
  isLoggedIn,
  onSelectProduct,
  isLoading = false
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
    <div className="w-full flex flex-col gap-5 animate-fade-in">
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
              Danh mục sản phẩm đang được cập nhật
            </h3>
            <p className="muted text-xs mt-1 m-0 max-w-sm">
              Hiện chưa có sản phẩm sỉ nào trong danh mục này. Vui lòng quay lại sau hoặc liên hệ hỗ trợ.
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
