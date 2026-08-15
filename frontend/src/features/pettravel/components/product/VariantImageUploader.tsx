"use client";

import React, { useState, useRef } from "react";
import Image from "next/image";
import { X, RefreshCw, AlertCircle, Image as ImageIcon } from "lucide-react";
import {
  ALLOWED_IMAGE_TYPES,
  validateImageFile,
  uploadImageDirectToR2
} from "@/lib/upload/image-upload-manager";

interface VariantImageUploaderProps {
  currentUrl?: string;
  productId?: string;
  variantId?: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}

export function VariantImageUploader({
  currentUrl,
  productId,
  variantId,
  onChange,
  disabled = false
}: VariantImageUploaderProps) {
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayUrl = previewBlob || currentUrl;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    const validation = validateImageFile(file);
    if (!validation.valid) {
      setError(validation.error || "Tệp ảnh không hợp lệ.");
      return;
    }

    setError(null);
    const blob = URL.createObjectURL(file);
    setPreviewBlob(blob);
    setIsUploading(true);

    try {
      const result = await uploadImageDirectToR2(file, {
        purpose: "variant-image",
        productId,
        variantId
      });
      onChange(result.publicUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Tải ảnh phân loại thất bại.";
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewBlob(null);
    setError(null);
    onChange("");
  };

  return (
    <div className="relative flex flex-col items-center">
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        className="hidden"
        disabled={disabled || isUploading}
        onChange={handleFileChange}
      />

      <div
        onClick={() => {
          if (!disabled && !isUploading) {
            fileInputRef.current?.click();
          }
        }}
        className={`group relative w-12 h-12 rounded-xl border-2 overflow-hidden bg-white shadow-2xs flex items-center justify-center cursor-pointer transition-all ${
          displayUrl
            ? "border-orange-200 hover:border-orange-400"
            : "border-dashed border-orange-300 hover:border-orange-500 bg-orange-50/40"
        } ${isUploading ? "pointer-events-none opacity-80" : ""}`}
        title={displayUrl ? "Nhấp để đổi ảnh mẫu" : "Tải ảnh mẫu riêng"}
      >
        {displayUrl ? (
          <>
            <Image
              src={displayUrl}
              alt="Ảnh mẫu"
              fill
              sizes="48px"
              className="object-contain p-0.5"
            />
            {/* Hover clear button */}
            {!disabled && !isUploading && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute top-0.5 right-0.5 p-0.5 bg-red-500 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-xs"
                title="Xóa ảnh mẫu"
              >
                <X size={10} />
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center text-orange-500 p-1">
            <ImageIcon size={16} />
            <span className="text-[8px] font-bold mt-0.5 text-gray-500">Ảnh mẫu</span>
          </div>
        )}

        {/* Uploading Spinner */}
        {isUploading && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px] flex items-center justify-center text-white">
            <RefreshCw size={14} className="animate-spin text-orange-300" />
          </div>
        )}

        {/* Error Indicator */}
        {error && (
          <div className="absolute inset-0 bg-red-900/70 flex items-center justify-center text-white" title={error}>
            <AlertCircle size={14} className="text-red-300" />
          </div>
        )}
      </div>

      {error && (
        <span className="text-[9px] text-red-500 font-medium truncate max-w-[80px] mt-0.5" title={error}>
          Lỗi tải
        </span>
      )}
    </div>
  );
}
