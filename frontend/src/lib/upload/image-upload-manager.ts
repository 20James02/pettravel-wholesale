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

  const maxRetries = options.maxRetries ?? 3;
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
          fileName: file.name,
          contentType: file.type,
          fileSizeBytes: file.size,
          productId: options.productId || undefined,
          variantId: options.variantId || undefined
        }),
        signal: options.signal
      });

      if (!presignRes.ok) {
        const errJson = await presignRes.json().catch(() => ({}));
        // Client errors (400, 401, 403) are not retryable
        if (presignRes.status >= 400 && presignRes.status < 500) {
          throw new Error(errJson.error || `Lỗi tạo liên kết tải lên (${presignRes.status}).`);
        }
        throw new Error(errJson.error || "Máy chủ tạo liên kết tải ảnh tạm thời gián đoạn.");
      }

      const presignData: PresignResponse = await presignRes.json();
      options.onProgress?.(30);

      // Step 2: Direct binary PUT to Cloudflare R2
      const uploadRes = await fetch(presignData.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type
        },
        body: file,
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
        const msg = err instanceof Error ? err.message : "Tải ảnh lên R2 thất bại.";
        throw new Error(msg);
      }

      // Exponential backoff: 500ms, 1500ms, 3000ms + jitter
      const baseDelay = attempt === 1 ? 500 : attempt === 2 ? 1500 : 3000;
      const jitter = Math.random() * 200;
      await sleep(baseDelay + jitter);
    }
  }

  throw new Error("Không thể hoàn tất tải ảnh sau nhiều lần thử.");
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
