import assert from "node:assert";
import { describe, it } from "node:test";

import { optionalUrlSchema, productVariantSchema } from "./validation.ts";

describe("persisted catalog image validation", () => {
  it("accepts internal paths and HTTPS object URLs", () => {
    for (const value of ["", "/product-food.svg", "/products/p1/image.webp?version=2", "https://cdn.example.com/p/image.webp"]) {
      assert.equal(optionalUrlSchema.safeParse(value).success, true, value);
    }
  });

  it("rejects transient, insecure, credentialed, and oversized image URLs", () => {
    for (const value of [
      "data:image/png;base64,AAAA",
      "blob:https://example.com/temporary",
      "http://cdn.example.com/image.webp",
      "//cdn.example.com/image.webp",
      "https://user:secret@cdn.example.com/image.webp",
      `https://cdn.example.com/${"x".repeat(2_100)}`
    ]) {
      assert.equal(optionalUrlSchema.safeParse(value).success, false, value.slice(0, 80));
    }
  });

  it("applies the same durable URL contract to variant images", () => {
    const variant = {
      sku: "SKU-001",
      label: "Mặc định",
      wholesalePrice: 100_000,
      minOrderQty: 1,
      stock: 10,
      supplierId: "sup_1",
      imageUrl: "data:image/png;base64,AAAA"
    };

    assert.equal(productVariantSchema.safeParse(variant).success, false);
  });
});
