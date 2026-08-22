import assert from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { resolvePostLoginTab } from "./types.ts";

const prefetchSource = readFileSync(
  new URL("../../lib/prefetch/prefetch-engine.ts", import.meta.url),
  "utf8"
);

describe("protected navigation contract", () => {
  it("preserves valid customer intent and rejects admin destinations", () => {
    assert.equal(resolvePostLoginTab("cart", false), "cart");
    assert.equal(resolvePostLoginTab("order", false), "order");
    assert.equal(resolvePostLoginTab("profile", false), "profile");
    assert.equal(resolvePostLoginTab("admin_products", false), "catalog");
  });

  it("sends admins to their requested admin surface", () => {
    assert.equal(resolvePostLoginTab("admin_products", true), "admin_products");
    assert.equal(resolvePostLoginTab("catalog", true), "admin");
  });

  it("never sends guests into blank protected tabs", () => {
    const topbarSource = readFileSync(
      new URL("./components/shared/Topbar.tsx", import.meta.url),
      "utf8"
    );
    assert.ok(topbarSource.includes('onRequireLogin("cart")'));
    assert.ok(topbarSource.includes('onRequireLogin("order")'));
    assert.ok(topbarSource.includes('onRequireLogin("profile")'));
  });

  it("does not prefetch admin policy for the customer order tab", () => {
    const orderCaseStart = prefetchSource.indexOf('case "order":');
    const adminCaseStart = prefetchSource.indexOf('case "admin":', orderCaseStart);
    const adminProductsCaseStart = prefetchSource.indexOf('case "admin_products":', adminCaseStart);
    const orderCase = prefetchSource.slice(orderCaseStart, adminCaseStart);
    const adminCase = prefetchSource.slice(adminCaseStart, adminProductsCaseStart);

    assert.ok(orderCase.includes('/api/orders/summary?limit=25'));
    assert.ok(!orderCase.includes('/api/admin/policy'));
    assert.ok(adminCase.includes('/api/orders/summary?limit=25'));
    assert.ok(adminCase.includes('/api/admin/policy'));
  });
});
