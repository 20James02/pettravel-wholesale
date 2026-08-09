import { useMemo } from "react";
import type { Product } from "@/lib/domain";
import { ProductCard } from "./ProductCard";

interface CatalogProps {
  products: Product[];
  availableCategories: string[];
  categoryFilter: string;
  setCategoryFilter: (cat: string) => void;
  searchQuery: string;
  isLoggedIn: boolean;
  onSelectProduct: (product: Product) => void;
}

export function Catalog({
  products,
  availableCategories,
  categoryFilter,
  setCategoryFilter,
  searchQuery,
  isLoggedIn,
  onSelectProduct
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
    <div className="flex flex-col gap-6">
      {/* Category filter tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {availableCategories.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`tab-button min-h-[38px] whitespace-nowrap ${
              categoryFilter === cat ? "bg-orange-500 text-white border-orange-600 font-bold" : ""
            }`}
            onClick={() => setCategoryFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {filteredProducts.length === 0 ? (
        <div className="panel p-8 text-center text-brand-ink/60 font-semibold bg-[#FFFDF9] border border-orange-100 rounded-2xl">
          Không tìm thấy sản phẩm nào khớp với bộ lọc.
        </div>
      ) : (
        <section className="catalog-grid">
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
