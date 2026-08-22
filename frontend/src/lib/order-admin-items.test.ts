import assert from "node:assert/strict";
import test from "node:test";
import type { OrderItem, Product, ProductVariant } from "./domain.ts";
import {
  MAX_ORDER_ITEM_QUANTITY,
  addOrMergeAdminOrderItem,
  removeAdminOrderItem
} from "./order-admin-items.ts";

const product: Product = {
  id: "p1",
  code: "4232",
  name: "Ổ đệm cam",
  category: "Ổ nằm",
  brand: "Pet Travel",
  imageUrl: "/product.svg",
  tags: [],
  variants: []
};

const variant: ProductVariant = {
  id: "v1",
  sku: "4232-TUI-1-5KG",
  label: "Túi 1.5kg",
  wholesalePrice: 150_000,
  minOrderQty: 10,
  stock: 100,
  supplierId: "supplier-real"
};

const existing: OrderItem = {
  id: "item-1",
  productCode: product.code,
  productName: product.name,
  variantSku: variant.sku,
  variantLabel: variant.label,
  quantity: 6,
  unitPriceSnapshot: 140_000,
  supplierId: "supplier-real"
};

test("admin can add a quantity below the wholesale MOQ using authoritative catalog data", () => {
  const items = addOrMergeAdminOrderItem([], product, variant, 1, "item-new");
  assert.equal(items[0].quantity, 1);
  assert.equal(items[0].unitPriceSnapshot, 150_000);
  assert.equal(items[0].supplierId, "supplier-real");
});

test("same SKU and supplier is merged without duplicating the order line", () => {
  const items = addOrMergeAdminOrderItem([existing], product, variant, 2, "unused");
  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 8);
  assert.equal(items[0].unitPriceSnapshot, 150_000);
});

test("missing real price or supplier fails closed instead of creating fake data", () => {
  assert.throws(
    () => addOrMergeAdminOrderItem([], product, { ...variant, wholesalePrice: undefined }, 1, "item-new"),
    /giá sỉ hợp lệ/
  );
  assert.throws(
    () => addOrMergeAdminOrderItem([], product, { ...variant, supplierId: undefined }, 1, "item-new"),
    /nhà cung cấp/
  );
});

test("quantity is bounded but is not constrained by MOQ", () => {
  assert.throws(() => addOrMergeAdminOrderItem([], product, variant, 0, "item-new"), /1 đến 10000/);
  assert.throws(
    () => addOrMergeAdminOrderItem([], product, variant, MAX_ORDER_ITEM_QUANTITY + 1, "item-new"),
    /1 đến 10000/
  );
});

test("removing the last line is rejected", () => {
  assert.throws(() => removeAdminOrderItem([existing], existing.id), /ít nhất một sản phẩm/);
  assert.deepEqual(removeAdminOrderItem([existing, { ...existing, id: "item-2" }], existing.id), [
    { ...existing, id: "item-2" }
  ]);
});
