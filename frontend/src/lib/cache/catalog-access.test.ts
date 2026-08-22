import assert from "node:assert";
import { describe, it } from "node:test";

import { catalogCacheKey, resolveCatalogAccessScope } from "./catalog-access.ts";
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
  });
});
