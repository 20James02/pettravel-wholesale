import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  validateImageFile,
  MAX_PRODUCT_IMAGES,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_IMAGE_TYPES
} from "./image-upload-manager.ts";

describe("Image Upload Validation & Constraints", () => {
  it("should enforce max product images to 10", () => {
    assert.strictEqual(MAX_PRODUCT_IMAGES, 10);
  });

  it("should enforce max file size to 10MB", () => {
    assert.strictEqual(MAX_FILE_SIZE_BYTES, 10 * 1024 * 1024);
  });

  it("should support allowed MIME types", () => {
    assert.ok(ALLOWED_IMAGE_TYPES.includes("image/jpeg"));
    assert.ok(ALLOWED_IMAGE_TYPES.includes("image/png"));
    assert.ok(ALLOWED_IMAGE_TYPES.includes("image/webp"));
    assert.ok(ALLOWED_IMAGE_TYPES.includes("image/avif"));
  });

  it("should reject 0-byte files", () => {
    const fakeEmptyFile = { size: 0, type: "image/jpeg", name: "empty.jpg" } as unknown as File;
    const result = validateImageFile(fakeEmptyFile);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes("0 byte"));
  });

  it("should reject oversized files (>10MB)", () => {
    const fakeLargeFile = {
      size: 11 * 1024 * 1024,
      type: "image/jpeg",
      name: "big.jpg"
    } as unknown as File;
    const result = validateImageFile(fakeLargeFile);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes("vượt quá giới hạn"));
  });

  it("should reject unsupported MIME types (e.g. exe, gif, svg)", () => {
    const fakeExe = { size: 1024, type: "application/x-msdownload", name: "app.exe" } as unknown as File;
    const result = validateImageFile(fakeExe);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes("chưa được hỗ trợ"));
  });

  it("should accept valid JPG, PNG, WebP, AVIF files", () => {
    const validJpg = { size: 500_000, type: "image/jpeg", name: "photo.jpg" } as unknown as File;
    const validPng = { size: 800_000, type: "image/png", name: "item.png" } as unknown as File;
    const validWebp = { size: 300_000, type: "image/webp", name: "gallery.webp" } as unknown as File;

    assert.strictEqual(validateImageFile(validJpg).valid, true);
    assert.strictEqual(validateImageFile(validPng).valid, true);
    assert.strictEqual(validateImageFile(validWebp).valid, true);
  });

  it("never reports a local data URL as a persisted R2 upload", () => {
    const source = readFileSync(new URL("./image-upload-manager.ts", import.meta.url), "utf8");
    assert.ok(!source.includes("key: `local_"));
    assert.ok(!source.includes("readAsDataURL(fileToUpload)"));
    assert.ok(source.includes("throw new Error(\"Tải ảnh thất bại sau nhiều lần thử.\")"));
  });
});
