export function ProductSkeleton() {
  return (
    <div className="product-card">
      <div className="relative aspect-square w-full animate-shimmer bg-[#FFFBEB] border-b border-orange-100 shrink-0" />
      <div className="p-3 flex flex-col justify-between h-full gap-2.5 bg-white">
        <div className="flex flex-col gap-1.5">
          <div className="h-2.5 w-12 rounded-full animate-shimmer bg-orange-100" />
          <div className="h-4 w-full rounded-md animate-shimmer bg-orange-100" />
          <div className="h-3 w-3/4 rounded-md animate-shimmer bg-orange-50" />
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-dashed border-orange-100 mt-auto">
          <div className="h-3 w-14 rounded-full animate-shimmer bg-orange-100" />
          <div className="h-4 w-12 rounded-full animate-shimmer bg-orange-200" />
        </div>
      </div>
    </div>
  );
}

export function ProductSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="catalog-grid">
      {Array.from({ length: count }).map((_, i) => (
        <ProductSkeleton key={i} />
      ))}
    </div>
  );
}
