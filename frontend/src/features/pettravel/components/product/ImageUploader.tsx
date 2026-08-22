"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  UploadCloud,
  X,
  Star,
  RefreshCw,
  AlertCircle,
  GripVertical,
  CheckCircle2,
  Maximize2
} from "lucide-react";
import {
  MAX_PRODUCT_IMAGES,
  ALLOWED_IMAGE_TYPES,
  validateImageFile,
  uploadQueue
} from "@/lib/upload/image-upload-manager";
import type { ProductUploadImage } from "@/lib/domain";

interface ImageUploaderProps {
  initialImages: string[];
  initialMainImage?: string;
  productId?: string;
  onChange: (images: string[], mainImage: string) => void;
  disabled?: boolean;
}

export function ImageUploader({
  initialImages,
  initialMainImage,
  productId,
  onChange,
  disabled = false
}: ImageUploaderProps) {
  const [items, setItems] = useState<ProductUploadImage[]>(() => {
    const urls = initialImages.length > 0 ? initialImages : initialMainImage ? [initialMainImage] : [];
    return urls.map((url, idx) => ({
      id: `existing_${idx}_${url.slice(-10)}`,
      previewUrl: url,
      r2Url: url,
      status: "success",
      progress: 100
    }));
  });

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync back to parent when items change
  const notifyParent = useCallback(
    (currentItems: ProductUploadImage[]) => {
      const successfulUrls = currentItems
        .filter((item) => item.status === "success" && (item.r2Url || item.previewUrl))
        .map((item) => item.r2Url || item.previewUrl);

      const main = successfulUrls[0] || "";
      onChange(successfulUrls, main);
    },
    [onChange]
  );

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleFileSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Reset input value so same file can be re-selected if deleted
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setUploadError(null);

    const availableSlots = MAX_PRODUCT_IMAGES - items.length;
    if (availableSlots <= 0) {
      setUploadError(`Đã đạt giới hạn tối đa ${MAX_PRODUCT_IMAGES} ảnh sản phẩm.`);
      return;
    }

    const filesToProcess = files.slice(0, availableSlots);
    if (files.length > availableSlots) {
      setUploadError(`Chỉ thêm được ${availableSlots} ảnh để không vượt quá ${MAX_PRODUCT_IMAGES} ảnh.`);
    }

    const newItems: ProductUploadImage[] = [];

    for (const file of filesToProcess) {
      const validation = validateImageFile(file);
      if (!validation.valid) {
        setUploadError(validation.error || "Tệp ảnh không hợp lệ.");
        continue;
      }

      const previewBlob = URL.createObjectURL(file);
      newItems.push({
        id: `upload_${crypto.randomUUID()}`,
        file,
        previewUrl: previewBlob,
        status: "pending",
        progress: 0
      });
    }

    if (newItems.length === 0) return;

    const updatedList = [...items, ...newItems];
    setItems(updatedList);

    // Start background upload queue
    abortControllerRef.current = new AbortController();

    await uploadQueue(updatedList, {
      purpose: "product-image",
      productId,
      concurrency: 3,
      signal: abortControllerRef.current.signal,
      onItemUpdate: (id, update) => {
        setItems((prev) => {
          const next = prev.map((item) => (item.id === id ? { ...item, ...update } : item));
          notifyParent(next);
          return next;
        });
      }
    });
  };

  const handleRetry = async (itemId: string) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem || !targetItem.file) return;

    setUploadError(null);
    abortControllerRef.current = new AbortController();

    await uploadQueue(
      items.map((i) => (i.id === itemId ? { ...i, status: "retrying", error: undefined } : i)),
      {
        purpose: "product-image",
        productId,
        concurrency: 1,
        signal: abortControllerRef.current.signal,
        onItemUpdate: (id, update) => {
          setItems((prev) => {
            const next = prev.map((item) => (item.id === id ? { ...item, ...update } : item));
            notifyParent(next);
            return next;
          });
        }
      }
    );
  };

  const handleDelete = (itemId: string) => {
    const updated = items.filter((item) => item.id !== itemId);
    setItems(updated);
    notifyParent(updated);
  };

  const handleSetMainImage = (index: number) => {
    if (index === 0 || index >= items.length) return;
    const target = items[index];
    const rest = items.filter((_, i) => i !== index);
    const reordered = [target, ...rest];
    setItems(reordered);
    notifyParent(reordered);
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const reordered = [...items];
    const [movedItem] = reordered.splice(draggedIndex, 1);
    reordered.splice(dropIndex, 0, movedItem);

    setItems(reordered);
    setDraggedIndex(null);
    setDragOverIndex(null);
    notifyParent(reordered);
  };

  const mainItem = items[0];

  return (
    <div className="flex flex-col gap-3">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        className="hidden"
        disabled={disabled || items.length >= MAX_PRODUCT_IMAGES}
        onChange={handleFileSelection}
      />

      {/* Error / Alert notification banner */}
      {uploadError && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs animate-shake">
          <AlertCircle size={15} className="shrink-0 text-red-500" />
          <span className="flex-1">{uploadError}</span>
          <button type="button" onClick={() => setUploadError(null)} className="p-1 hover:bg-red-100 rounded-lg">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Shopee / TikTok Shop Image Gallery Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 bg-orange-50/40 p-3.5 rounded-2xl border border-orange-100/80">
        {/* 1. Main Highlighted Image Container (Left on desktop) */}
        <div className="md:col-span-5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#331B08] uppercase tracking-wider flex items-center gap-1">
              <Star size={13} className="text-amber-500 fill-amber-400" />
              Ảnh chính sản phẩm
            </span>
            <span className="text-[10px] text-gray-400 font-mono font-medium">
              {items.length}/{MAX_PRODUCT_IMAGES} ảnh
            </span>
          </div>

          <div className="relative aspect-square w-full rounded-2xl border-2 border-dashed border-orange-200 bg-white overflow-hidden shadow-sm flex items-center justify-center group">
            {mainItem ? (
              <>
                <Image
                  src={mainItem.previewUrl || mainItem.r2Url || "/product-food.svg"}
                  alt="Ảnh chính"
                  fill
                  sizes="(min-width: 768px) 300px, 100vw"
                  className="object-contain p-2"
                />

                {/* Main badge indicator */}
                <div className="absolute top-2.5 left-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1 font-mono uppercase">
                  <Star size={11} className="fill-white" />
                  Ảnh chính
                </div>

                {/* Status indicator on main image */}
                {mainItem.status === "uploading" && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center text-white gap-2">
                    <RefreshCw size={24} className="animate-spin text-orange-300" />
                    <span className="text-[11px] font-bold">Đang tải lên R2... {mainItem.progress}%</span>
                  </div>
                )}

                {mainItem.status === "error" && (
                  <div className="absolute inset-0 bg-red-900/60 backdrop-blur-[2px] flex flex-col items-center justify-center text-white p-3 text-center gap-2">
                    <AlertCircle size={24} className="text-red-300" />
                    <span className="text-[10px] font-bold">{mainItem.error || "Tải lên lỗi"}</span>
                    <button
                      type="button"
                      onClick={() => handleRetry(mainItem.id)}
                      className="px-2.5 py-1 bg-white text-red-600 rounded-lg text-[10px] font-bold shadow hover:bg-red-50 flex items-center gap-1"
                    >
                      <RefreshCw size={11} /> Thử lại
                    </button>
                  </div>
                )}

                {/* Quick actions overlay */}
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    title="Xem ảnh lớn"
                    onClick={() => setPreviewModalUrl(mainItem.previewUrl || mainItem.r2Url || null)}
                    className="p-1.5 bg-white/90 hover:bg-white text-gray-700 rounded-xl shadow-md cursor-pointer transition-all hover:scale-105"
                  >
                    <Maximize2 size={13} />
                  </button>
                  <button
                    type="button"
                    title="Xóa ảnh này"
                    disabled={disabled}
                    onClick={() => handleDelete(mainItem.id)}
                    className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-xl shadow-md cursor-pointer transition-all hover:scale-105"
                  >
                    <X size={13} />
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                disabled={disabled}
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-4 text-center cursor-pointer hover:bg-orange-50/50 transition-all w-full h-full"
              >
                <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center text-orange-600 mb-2 shadow-sm">
                  <UploadCloud size={24} />
                </div>
                <span className="text-xs font-bold text-orange-950">Chọn ảnh từ máy tính</span>
                <span className="text-[10px] text-gray-400 mt-1">JPG, PNG, WebP tối đa 10MB</span>
              </button>
            )}
          </div>
        </div>

        {/* 2. Thumbnails & Upload Queue Strip (Right on desktop) */}
        <div className="md:col-span-7 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">
              Danh sách ảnh bộ sưu tập
            </span>
            <span className="text-[10px] text-gray-400 italic">Kéo thả để sắp xếp thứ tự</span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 min-h-[140px] content-start">
            {items.map((item, index) => {
              const isMain = index === 0;
              const isDragging = draggedIndex === index;
              const isOver = dragOverIndex === index;

              return (
                <div
                  key={item.id}
                  draggable={!disabled}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  className={`group relative aspect-square rounded-xl border-2 overflow-hidden bg-white shadow-xs transition-all flex items-center justify-center cursor-grab active:cursor-grabbing ${
                    isMain
                      ? "border-amber-400 ring-2 ring-amber-200"
                      : isOver
                      ? "border-orange-500 scale-105 shadow-md"
                      : "border-orange-100 hover:border-orange-300"
                  } ${isDragging ? "opacity-40 scale-95" : ""}`}
                >
                  <Image
                    src={item.previewUrl || item.r2Url || "/product-food.svg"}
                    alt={`Ảnh ${index + 1}`}
                    fill
                    sizes="100px"
                    className="object-contain p-1"
                  />

                  {/* Drag Grip Handle */}
                  <div className="absolute top-1 left-1 bg-black/40 text-white rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripVertical size={11} />
                  </div>

                  {/* Status Overlay */}
                  {item.status === "uploading" && (
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px] flex flex-col items-center justify-center text-white gap-1">
                      <RefreshCw size={14} className="animate-spin text-orange-300" />
                      <span className="text-[9px] font-bold font-mono">{item.progress}%</span>
                    </div>
                  )}

                  {item.status === "error" && (
                    <div className="absolute inset-0 bg-red-900/70 backdrop-blur-[1px] flex flex-col items-center justify-center text-white p-1 text-center gap-1">
                      <AlertCircle size={14} className="text-red-300" />
                      <button
                        type="button"
                        onClick={() => handleRetry(item.id)}
                        className="px-1.5 py-0.5 bg-white text-red-600 rounded text-[9px] font-bold shadow hover:bg-red-50 flex items-center gap-0.5"
                      >
                        <RefreshCw size={9} /> Lại
                      </button>
                    </div>
                  )}

                  {item.status === "success" && (
                    <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <CheckCircle2 size={13} className="text-emerald-500 fill-white" />
                    </div>
                  )}

                  {/* Action Buttons on Thumbnail Hover */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 p-1">
                    {!isMain && (
                      <button
                        type="button"
                        title="Đặt làm ảnh chính"
                        onClick={() => handleSetMainImage(index)}
                        className="p-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-sm cursor-pointer transition-transform active:scale-90"
                      >
                        <Star size={11} />
                      </button>
                    )}
                    <button
                      type="button"
                      title="Xem lớn"
                      onClick={() => setPreviewModalUrl(item.previewUrl || item.r2Url || null)}
                      className="p-1 bg-white hover:bg-gray-100 text-gray-700 rounded-lg shadow-sm cursor-pointer transition-transform active:scale-90"
                    >
                      <Maximize2 size={11} />
                    </button>
                    <button
                      type="button"
                      title="Xóa ảnh"
                      disabled={disabled}
                      onClick={() => handleDelete(item.id)}
                      className="p-1 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-sm cursor-pointer transition-transform active:scale-90"
                    >
                      <X size={11} />
                    </button>
                  </div>

                  {/* Small index badge */}
                  <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1 rounded font-mono">
                    #{index + 1}
                  </div>
                </div>
              );
            })}

            {/* Upload More Button (if under limit) */}
            {items.length < MAX_PRODUCT_IMAGES && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-xl border-2 border-dashed border-orange-300 hover:border-orange-500 bg-white hover:bg-orange-50/50 flex flex-col items-center justify-center p-2 text-orange-600 transition-all cursor-pointer shadow-xs group"
              >
                <div className="w-8 h-8 rounded-xl bg-orange-100 group-hover:bg-orange-200 flex items-center justify-center mb-1 transition-colors">
                  <UploadCloud size={16} />
                </div>
                <span className="text-[10px] font-bold leading-tight text-center">+ Thêm ảnh</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox / Zoom Preview Modal */}
      {previewModalUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewModalUrl(null)}
        >
          <div className="relative max-w-2xl max-h-[85vh] w-full aspect-square bg-white rounded-2xl overflow-hidden shadow-2xl p-4 flex items-center justify-center">
            <button
              type="button"
              onClick={() => setPreviewModalUrl(null)}
              className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black text-white rounded-full z-10 cursor-pointer"
            >
              <X size={18} />
            </button>
            <Image
              src={previewModalUrl}
              alt="Ảnh phóng to"
              fill
              className="object-contain p-4"
            />
          </div>
        </div>
      )}
    </div>
  );
}
