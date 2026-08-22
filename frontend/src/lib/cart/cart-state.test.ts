import assert from "node:assert";
import { describe, it } from "node:test";

import {
  cartStorageKeyForUser,
  legacyCartStorageKeyForUser,
  restoreCartItems
} from "./cart-state.ts";

describe("customer cart persistence", () => {
  it("uses a versioned key so order-contaminated legacy carts are reset once", () => {
    assert.equal(cartStorageKeyForUser("customer-1"), "ptw_cart_v2_customer-1");
    assert.equal(legacyCartStorageKeyForUser("customer-1"), "ptw_cart_customer-1");
    assert.notEqual(cartStorageKeyForUser("customer-1"), legacyCartStorageKeyForUser("customer-1"));
  });

  it("restores only structurally valid cart items", () => {
    const validCart = JSON.stringify([
      {
        id: "item-1",
        productCode: "P-001",
        productName: "Balo vận chuyển",
        variantSku: "P-001-CAM",
        variantLabel: "Cam",
        quantity: 2,
        unitPriceSnapshot: 185000,
        supplierId: "supplier-1",
        variantImage: "/product.png"
      }
    ]);

    assert.deepEqual(restoreCartItems(validCart), JSON.parse(validCart));
    assert.deepEqual(restoreCartItems("not-json"), []);
    assert.deepEqual(restoreCartItems(JSON.stringify([{ variantSku: "P-001-CAM", quantity: -1 }])), []);
  });
});
