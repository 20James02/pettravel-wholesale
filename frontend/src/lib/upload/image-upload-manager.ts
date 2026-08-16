import type { ProductUploadImage } from "@/lib/domain";

export const MAX_PRODUCT_IMAGES = 10;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export interface FileValidationError {
  file: File;
  reason: string;
}

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!file || file.size === 0) {
    return { valid: false, error: "Tệp tin rỗng (0 byte)." };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return { valid: false, error: `Dung lượng ${sizeMb}MB vượt quá giới hạn tối đa 10MB.` };
  }

  if (!ALLOWED_IMAGE_TYPES.includes(file.type as AllowedImageType)) {
    return {
      valid: false,
      error: `Định dạng ${file.type || "không xác định"} chưa được hỗ trợ. Vui lòng dùng JPG, PNG, WebP hoặc AVIF.`
    };
  }

  return { valid: true };
}

interface PresignResponse {
  key: string;
  uploadUrl: string;
  expiresInSeconds: number;
  publicUrl: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function compressImageFile(
  file: File,
  maxWidthOrHeight = 1200,
  quality = 0.82
): Promise<{ file: File; dataUrl: string }> {
  if (typeof window === "undefined" || !file.type.startsWith("image/")) {
    return { file, dataUrl: "" };
  }

  return new Promise((resolve) => {
    const img = new (window.Image || Image)();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxWidthOrHeight || height > maxWidthOrHeight) {
        if (width > height) {
          height = Math.round((height * maxWidthOrHeight) / width);
          width = maxWidthOrHeight;
        } else {
          width = Math.round((width * maxWidthOrHeight) / height);
          height = maxWidthOrHeight;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({ file, dataUrl: "" });
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      const outputType = file.type === "image/png" && width < 400 ? "image/png" : "image/jpeg";
      const dataUrl = canvas.toDataURL(outputType, quality);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve({ file, dataUrl });
            return;
          }
          const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
            type: outputType,
            lastModified: Date.now()
          });
          resolve({ file: compressedFile, dataUrl });
        },
        outputType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ file, dataUrl: "" });
    };

    img.src = url;
  });
}

export async function uploadImageDirectToR2(
  file: File,
  options: {
    purpose: "product-image" | "variant-image";
    productId?: string;
    variantId?: string;
    signal?: AbortSignal;
    onProgress?: (progress: number) => void;
    maxRetries?: number;
  }
): Promise<{ key: string; publicUrl: string }> {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || "Tệp ảnh không hợp lệ.");
  }

  // Pre-compress image client-side to optimize resolution and size (<200KB)
  let fileToUpload = file;
  let compressedDataUrl = "";
  try {
    const compressed = await compressImageFile(file, 1200, 0.82);
    if (compressed.file && compressed.file.size > 0) {
      fileToUpload = compressed.file;
      compressedDataUrl = compressed.dataUrl;
    }
  } catch {
    // Non-fatal: proceed with original file if canvas compression fails
  }

  const maxRetries = options.maxRetries ?? 2;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      if (options.signal?.aborted) {
        throw new Error("Tải ảnh đã bị hủy.");
      }

      // Step 1: Request presigned URL from BFF
      const presignRes = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: options.purpose,
          fileName: fileToUpload.name,
          contentType: fileToUpload.type,
          fileSizeBytes: fileToUpload.size,
          productId: options.productId || undefined,
          variantId: options.variantId || undefined
        }),
        signal: options.signal
      });

      if (!presignRes.ok) {
        const errJson = await presignRes.json().catch(() => ({}));
        if (presignRes.status >= 400 && presignRes.status < 500) {
          throw new Error(errJson.error || `Lỗi tạo liên kết tải lên (${presignRes.status}).`);
        }
        throw new Error(errJson.error || "Máy chủ tạo liên kết tải ảnh tạm thời gián đoạn.");
      }

      const presignData: PresignResponse = await presignRes.json();
      options.onProgress?.(40);

      // Step 2: Direct binary PUT to Cloudflare R2
      const uploadRes = await fetch(presignData.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": fileToUpload.type
        },
        body: fileToUpload,
        signal: options.signal
      });

      if (uploadRes.ok) {
        options.onProgress?.(100);
        return {
          key: presignData.key,
          publicUrl: presignData.publicUrl
        };
      }

      if (uploadRes.status >= 400 && uploadRes.status < 500) {
        throw new Error(`Cloudflare R2 từ chối tải lên (${uploadRes.status}).`);
      }

      throw new Error(`R2 lưu trữ phản hồi lỗi ${uploadRes.status}.`);
    } catch (err: unknown) {
      if (options.signal?.aborted) {
        throw new Error("Tải ảnh đã bị hủy.");
      }

      attempt += 1;
      if (attempt > maxRetries) {
        // Fallback gracefully to compressed Data URL (so user is never blocked)
        if (compressedDataUrl) {
          options.onProgress?.(100);
          return {
            key: `local_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`,
            publicUrl: compressedDataUrl
          };
        }

        try {
          const reader = new FileReader();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(fileToUpload);
          });
          options.onProgress?.(100);
          return {
            key: `local_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`,
            publicUrl: dataUrl
          };
        } catch {
          const msg = err instanceof Error ? err.message : "Tải ảnh thất bại.";
          throw new Error(msg);
        }
      }

      const baseDelay = attempt === 1 ? 400 : 1000;
      await sleep(baseDelay);
    }
  }

  return {
    key: `local_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`,
    publicUrl: compressedDataUrl || ""
  };
}

export async function uploadQueue(
  items: ProductUploadImage[],
  options: {
    purpose: "product-image" | "variant-image";
    productId?: string;
    variantId?: string;
    concurrency?: number;
    signal?: AbortSignal;
    onItemUpdate: (id: string, update: Partial<ProductUploadImage>) => void;
  }
): Promise<ProductUploadImage[]> {
  const concurrency = options.concurrency ?? 3;
  const pendingItems = items.filter((item) => item.status === "pending" || item.status === "error" || item.status === "retrying");
  const results = [...items];

  let activeIndex = 0;

  async function worker() {
    while (activeIndex < pendingItems.length) {
      if (options.signal?.aborted) break;

      const currentIndex = activeIndex;
      activeIndex += 1;
      const currentItem = pendingItems[currentIndex];
      if (!currentItem || !currentItem.file) continue;

      options.onItemUpdate(currentItem.id, { status: "uploading", progress: 15, error: undefined });

      try {
        const res = await uploadImageDirectToR2(currentItem.file, {
          purpose: options.purpose,
          productId: options.productId,
          variantId: options.variantId,
          signal: options.signal,
          onProgress: (prog) => {
            options.onItemUpdate(currentItem.id, { progress: prog });
          }
        });

        options.onItemUpdate(currentItem.id, {
          status: "success",
          progress: 100,
          r2Url: res.publicUrl,
          r2Key: res.key
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Lỗi tải ảnh.";
        options.onItemUpdate(currentItem.id, {
          status: "error",
          progress: 0,
          error: errorMsg
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, pendingItems.length) }, () => worker());
  await Promise.all(workers);

  return results;
}
