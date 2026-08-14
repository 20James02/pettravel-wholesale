import Image from "next/image";
import type { Product } from "@/lib/domain";

interface ProductCardProps {
  product: Product;
  isLoggedIn: boolean;
  onClick: () => void;
}

export function ProductCard({ product, isLoggedIn, onClick }: ProductCardProps) {
  const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);

  return (
    <article
      className="product-card cursor-pointer"
      onClick={onClick}
    >
      <div className="relative aspect-square w-full bg-[#FFFBEB] border-b border-orange-100 shrink-0">
        <Image src={product.imageUrl} alt={product.name} fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
        <span className="absolute top-2 left-2 bg-[#FFFDF9] border border-orange-100 text-[9px] px-2 py-0.5 rounded-full font-bold text-orange-950 shadow-sm z-10">
          {product.category}
        </span>
      </div>

      {!isLoggedIn ? (
        <div className="product-body p-2 flex flex-col justify-between h-full gap-1">
          <div>
            <p className="muted m-0 text-[8px] font-mono font-bold leading-none">{product.code}</p>
            <h3 className="m-0 text-xs font-bold text-[#331B08] mt-1 line-clamp-2 leading-snug">{product.name}</h3>
          </div>
          <div className="flex items-center justify-between border-t border-dashed border-orange-100 pt-1.5 mt-auto">
            <span className="text-[9px] muted font-bold uppercase">{product.category}</span>
          </div>
        </div>
      ) : (
        <div className="product-body p-2 flex flex-col justify-between h-full gap-1">
          <div>
            <p className="muted m-0 text-[8px] font-mono font-bold leading-none">{product.code}</p>
            <h3 className="m-0 text-xs font-bold text-[#331B08] mt-1 line-clamp-1 leading-snug">{product.name}</h3>
          </div>
          <div className="flex items-center justify-between border-t border-dashed border-orange-100 pt-1.5 mt-auto">
            <span className="text-[9px] muted font-bold uppercase">{product.category}</span>
            <span className="text-[9px] text-orange-950 font-extrabold bg-[#FFEEDD] border border-orange-100 rounded-full px-1.5 py-0.5 shrink-0">
              Còn: {totalStock}
            </span>
          </div>
        </div>
      )}
    </article>
  );
}
