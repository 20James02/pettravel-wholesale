import Image from "next/image";
import { Lock, Sparkles } from "lucide-react";
import type { Product } from "@/lib/domain";
import { formatVnd } from "@/lib/money";

interface ProductCardProps {
  product: Product;
  isLoggedIn: boolean;
  onClick: () => void;
}

export function ProductCard({ product, isLoggedIn, onClick }: ProductCardProps) {
  const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
  const prices = product.variants
    .map((v) => v.wholesalePrice)
    .filter((p): p is number => typeof p === "number" && p > 0);
  const minWholesalePrice = prices.length > 0 ? Math.min(...prices) : 0;

  return (
    <article
      className="product-card cursor-pointer group"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`Xem chi tiết ${product.name}`}
    >
      {/* Product Image Box */}
      <div className="relative aspect-square w-full bg-[#FFFBEB] border-b border-orange-100 overflow-hidden shrink-0">
        <Image
          src={product.imageUrl || (product.images && product.images[0]) || "/product-food.svg"}
          alt={product.name}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="object-contain p-2 transition-transform duration-300 group-hover:scale-105"
        />
        {/* Category Pill */}
        <span className="absolute top-2 left-2 bg-white/90 backdrop-blur-md border border-orange-100 text-[10px] px-2 py-0.5 rounded-full font-bold text-orange-950 shadow-sm z-10">
          {product.category}
        </span>
        {/* Multi-image count badge */}
        {product.images && product.images.length > 1 && (
          <span className="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-white text-[9px] px-1.5 py-0.5 rounded-md font-mono font-bold z-10">
            +{product.images.length - 1}
          </span>
        )}
      </div>

      {/* Product Body */}
      <div className="product-body p-3 flex flex-col justify-between flex-1 gap-2 bg-white">
        <div className="flex flex-col gap-0.5">
          <p className="muted m-0 text-[10px] font-mono font-bold uppercase tracking-wider">{product.code}</p>
          <h3 className="m-0 text-xs sm:text-sm font-bold text-[#331B08] line-clamp-2 leading-snug font-heading group-hover:text-orange-600 transition-colors">
            {product.name}
          </h3>
        </div>

        {/* Variant Thumbnails Row */}
        {product.variants.some((v) => v.imageUrl) && (
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5" onClick={(e) => e.stopPropagation()}>
            {product.variants.slice(0, 4).map((v) => (
              <div
                key={v.sku}
                className="relative w-6 h-6 rounded-md border border-orange-200/70 bg-[#FFFDF9] overflow-hidden shrink-0 shadow-2xs"
                title={v.label}
              >
                <Image
                  src={v.imageUrl || product.imageUrl || "/product-food.svg"}
                  alt={v.label}
                  fill
                  sizes="24px"
                  className="object-contain p-0.5"
                />
              </div>
            ))}
            {product.variants.length > 4 && (
              <span className="text-[9px] text-gray-400 font-mono font-bold">+{product.variants.length - 4}</span>
            )}
          </div>
        )}

        {/* Footer State */}
        {!isLoggedIn ? (
          <div className="flex items-center justify-between border-t border-dashed border-orange-100 pt-2 mt-auto">
            <span className="text-[10px] text-orange-700 font-bold flex items-center gap-1">
              <Lock size={12} className="text-orange-500 shrink-0" />
              Giá sỉ: Đăng nhập
            </span>
            <span className="text-[10px] text-gray-500 font-semibold font-mono">
              {product.variants.length > 0 ? `${product.variants.length} mẫu` : "Xem chi tiết"}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1 border-t border-dashed border-orange-100 pt-2 mt-auto">
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-xs sm:text-sm font-extrabold text-orange-600 font-mono">
                {minWholesalePrice > 0 ? formatVnd(minWholesalePrice) : "Liên hệ báo giá"}
              </span>
              <span className="text-[10px] text-orange-950 font-bold bg-[#FFEEDD] border border-orange-100 rounded-full px-1.5 py-0.2 shrink-0">
                {totalStock > 0 ? `Kho: ${totalStock}` : "Sẵn sàng sỉ"}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-500 font-medium">
              <span>{product.variants.length > 0 ? `${product.variants.length} phân loại` : "Mẫu tiêu chuẩn"}</span>
              <span className="text-orange-600 font-bold flex items-center gap-0.5">
                <Sparkles size={10} /> Đặt sỉ
              </span>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
