import assert from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const appSource = readFileSync(new URL("./PetTravelApp.tsx", import.meta.url), "utf8");

describe("catalog cart interaction contract", () => {
  it("keeps fetched order history out of the shopping cart", () => {
    assert.ok(!appSource.includes("setCartItems(targetOrder.items"));
    assert.ok(!appSource.includes("setCartItems(ord.items"));
  });

  it("submits a cart as a new order and clears it only after success", () => {
    const handlerStart = appSource.indexOf("async function handleSubmitCartProposal()");
    const handlerEnd = appSource.indexOf("async function handleCustomerAcceptQuote()", handlerStart);
    const handlerSource = appSource.slice(handlerStart, handlerEnd);

    assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
    assert.ok(handlerSource.includes('method: "POST"'));
    assert.ok(handlerSource.includes("setCartItems([])"));
    assert.ok(!handlerSource.includes('if (workingOrder.id !== "")'));
  });

  it("adds the selected product with motion without navigating away from catalog", () => {
    const handlerStart = appSource.indexOf("function handleAddSelectedProductToCart(");
    const handlerEnd = appSource.indexOf("function updateCartQty", handlerStart);

    assert.ok(handlerStart >= 0, "missing the dedicated add-to-cart handler");
    assert.ok(handlerEnd > handlerStart, "cannot isolate the add-to-cart handler");

    const handlerSource = appSource.slice(handlerStart, handlerEnd);
    assert.ok(handlerSource.includes("animateProductToCart"));
    assert.ok(handlerSource.includes("setSelectedProduct(null)"));
    assert.ok(!handlerSource.includes('setActiveTab("cart")'));
  });

  it("marks desktop and mobile cart buttons as animation targets", () => {
    const topbarSource = readFileSync(
      new URL("./components/shared/Topbar.tsx", import.meta.url),
      "utf8"
    );
    const mobileNavSource = readFileSync(
      new URL("./components/shared/MobileBottomNav.tsx", import.meta.url),
      "utf8"
    );

    assert.ok(topbarSource.includes('data-cart-animation-target="true"'));
    assert.ok(mobileNavSource.includes('data-cart-animation-target="true"'));
  });
});
