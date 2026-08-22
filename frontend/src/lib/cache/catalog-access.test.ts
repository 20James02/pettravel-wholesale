import assert from "node:assert";
import { describe, it } from "node:test";

import {
  catalogCacheKey,
  catalogResponseCacheControl,
  resolveCatalogAccessScope,
  sanitizeLegacyCatalogImages
} from "./catalog-access.ts";
import { entityStore } from "./entity-store.ts";

describe("catalog access cache contract", () => {
  it("never reuses a guest catalog response after a customer logs in", async () => {
    entityStore.invalidate("products:");

    const guestKey = catalogCacheKey(resolveCatalogAccessScope(null));
    const customerKey = catalogCacheKey(resolveCatalogAccessScope({ isAdmin: false }));
    let customerFetches = 0;

    await entityStore.swrFetch(guestKey, async () => [
      { id: "product-1", variants: [{ sku: "SKU-1" }] }
    ]);
    const customerResult = await entityStore.swrFetch(customerKey, async () => {
      customerFetches += 1;
      return [{ id: "product-1", variants: [{ sku: "SKU-1", wholesalePrice: 125_000 }] }];
    });

    assert.notEqual(guestKey, customerKey);
    assert.equal(customerFetches, 1);
    assert.equal(customerResult.data[0].variants[0].wholesalePrice, 125_000);

    entityStore.invalidate("products:");
  });

  it("separates guest, customer, and admin access scopes", () => {
    assert.equal(resolveCatalogAccessScope(null), "guest");
    assert.equal(resolveCatalogAccessScope({ isAdmin: false }), "customer");
    assert.equal(resolveCatalogAccessScope({ isAdmin: true }), "admin");
    assert.match(catalogResponseCacheControl("guest"), /^public,/);
    assert.equal(catalogResponseCacheControl("customer"), "private, no-store");
    assert.equal(catalogResponseCacheControl("admin"), "private, no-store");
  });

  it("removes legacy base64 images before catalog data reaches the browser", () => {
    const legacyImage = "data:image/png;base64,iVBORw0KGgo=";
    const [product] = sanitizeLegacyCatalogImages([
      {
        id: "product-legacy",
        code: "LEGACY-1",
        name: "Legacy product",
        brand: "Pet Travel",
        category: "Carrier",
        description: "",
        imageUrl: legacyImage,
        images: [legacyImage, "https://cdn.example.com/gallery.webp"],
        tags: [],
        variants: [
          {
            id: "variant-legacy",
            sku: "LEGACY-1-A",
            label: "A",
            stock: 2,
            minOrderQty: 1,
            imageUrl: legacyImage
          }
        ]
      }
    ]);

    assert.equal(product.imageUrl, "/product-food.svg");
    assert.deepEqual(product.images, ["https://cdn.example.com/gallery.webp"]);
    assert.equal(product.variants[0].imageUrl, "/product-food.svg");
    assert.ok(!JSON.stringify(product).includes("data:image"));
  });
});
