"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Maximize2, X, ChevronLeft, ChevronRight } from "lucide-react";
import type { Product, ProductVariant } from "@/lib/domain";

interface ProductGalleryProps {
  product: Product;
  activeVariant?: ProductVariant;
  className?: string;
}

export function ProductGallery({ product, activeVariant, className = "" }: ProductGalleryProps) {
  // Extract all distinct images: product.images, product.imageUrl, and variant imageUrls
  const productImages = product.images && product.images.length > 0 ? product.images : [product.imageUrl || "/product-food.svg"];
  const variantImages = product.variants
    .map((v) => v.imageUrl)
    .filter((url): url is string => Boolean(url && url.trim().length > 0));

  const allImages = Array.from(new Set([...productImages, ...variantImages])).filter(Boolean);

  const [selectedImageOverride, setSelectedImageOverride] = useState<string | null>(null);
  const [prevVariantSku, setPrevVariantSku] = useState<string | undefined>(activeVariant?.sku);
  const [isZoomOpen, setIsZoomOpen] = useState<boolean>(false);
  const [imageErrorMap, setImageErrorMap] = useState<Record<string, boolean>>({});

  if (activeVariant?.sku !== prevVariantSku) {
    setPrevVariantSku(activeVariant?.sku);
    if (activeVariant?.imageUrl && activeVariant.imageUrl.trim().length > 0) {
      setSelectedImageOverride(activeVariant.imageUrl);
    }
  }

  const selectedImage = selectedImageOverride || allImages[0] || "/product-food.svg";
  const currentIndex = allImages.indexOf(selectedImage);

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    const prevIdx = (currentIndex - 1 + allImages.length) % allImages.length;
    setSelectedImageOverride(allImages[prevIdx]);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextIdx = (currentIndex + 1) % allImages.length;
    setSelectedImageOverride(allImages[nextIdx]);
  };

  const handleImageError = (url: string) => {
    setImageErrorMap((prev) => ({ ...prev, [url]: true }));
  };

  const currentDisplayUrl = imageErrorMap[selectedImage] ? "/product-food.svg" : selectedImage;

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* 1. Main Display Image Container */}
      <div className="relative aspect-square w-full rounded-2xl overflow-hidden border border-orange-100 bg-[#FFFBEB] flex items-center justify-center p-3 shadow-inner group">
        <Image
          src={currentDisplayUrl}
          alt={product.name}
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-contain p-2 transition-transform duration-300 group-hover:scale-105"
          onError={() => handleImageError(selectedImage)}
          priority
        />

        {/* Navigation arrows (when multiple images) */}
        {allImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 hover:bg-white text-gray-800 shadow-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
              aria-label="Ảnh trước"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 hover:bg-white text-gray-800 shadow-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
              aria-label="Ảnh kế tiếp"
            >
              <ChevronRight size={16} />
            </button>
          </>
        )}

        {/* Zoom Lightbox Trigger */}
        <button
          type="button"
          onClick={() => setIsZoomOpen(true)}
          className="absolute top-2.5 right-2.5 p-2 rounded-xl bg-white/80 hover:bg-white text-gray-700 shadow-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
          title="Phóng to ảnh"
          aria-label="Phóng to ảnh"
        >
          <Maximize2 size={14} />
        </button>

        {/* Current Variant Match Indicator */}
        {activeVariant?.imageUrl === selectedImage && (
          <div className="absolute bottom-2.5 left-2.5 bg-orange-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow font-mono">
            Mẫu: {activeVariant.label}
          </div>
        )}
      </div>

      {/* 2. Thumbnails Carousel (Horizontal Swipe / Snap Scroll) */}
      {allImages.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none overscroll-contain snap-x">
          {allImages.map((imgUrl, i) => {
            const isSelected = selectedImage === imgUrl;
            const thumbUrl = imageErrorMap[imgUrl] ? "/product-food.svg" : imgUrl;

            return (
              <button
                key={i}
                type="button"
                className={`relative w-13 h-13 rounded-xl overflow-hidden border-2 bg-white p-1 shrink-0 snap-start cursor-pointer transition-all ${
                  isSelected
                    ? "border-orange-500 ring-2 ring-orange-300 scale-105 shadow-sm"
                    : "border-orange-100 opacity-70 hover:opacity-100"
                }`}
                onClick={() => setSelectedImageOverride(imgUrl)}
                aria-label={`Xem ảnh ${i + 1}`}
              >
                <Image
                  src={thumbUrl}
                  alt={`Thumbnail ${i + 1}`}
                  fill
                  sizes="52px"
                  className="object-contain p-0.5"
                  onError={() => handleImageError(imgUrl)}
                />
              </button>
            );
          })}
        </div>
      )}

      {/* 3. Fullscreen Lightbox Zoom Modal */}
      {isZoomOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setIsZoomOpen(false)}
        >
          <button
            type="button"
            onClick={() => setIsZoomOpen(false)}
            className="absolute top-4 right-4 p-2.5 bg-white/20 hover:bg-white/40 text-white rounded-full cursor-pointer z-50"
            aria-label="Đóng phóng to"
          >
            <X size={20} />
          </button>

          <div
            className="relative max-w-4xl max-h-[90vh] w-full aspect-square flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={currentDisplayUrl}
              alt={product.name}
              fill
              className="object-contain p-4"
            />
          </div>
        </div>
      )}
    </div>
  );
}
