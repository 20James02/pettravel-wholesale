import assert from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { CustomerOrder } from "./domain.ts";
import { findCurrentTradingOrder } from "./order-live-selection.ts";

function order(
  id: string,
  commercialStatus: CustomerOrder["commercialStatus"],
  fulfillmentStatus: CustomerOrder["fulfillmentStatus"],
  updatedAt: string
): CustomerOrder {
  return {
    id,
    number: id,
    customerName: "",
    customerCompany: "",
    customerId: "user",
    commercialStatus,
    paymentStatus: "unrequested",
    fulfillmentStatus,
    paymentIntent: "deposit_cod",
    invoiceRequested: false,
    updatedAt,
    items: [],
    quoteVersions: [],
    paymentRequests: [],
    paymentProofs: [],
    fulfillmentGroups: [],
    comments: []
  };
}

describe("current trading order selection", () => {
  it("prefers the real active transaction over completed historical E2E data", () => {
    const completedE2e = order("ord_e2e_1", "locked", "delivered", "2026-08-22T12:00:00Z");
    const active = order("ord_real", "quoted", "not_started", "2026-08-22T11:00:00Z");

    assert.equal(findCurrentTradingOrder([completedE2e, active])?.id, "ord_real");
  });

  it("chooses the most recently updated transaction when several remain active", () => {
    const older = order("older", "submitted", "not_started", "2026-08-22T10:00:00Z");
    const newer = order("newer", "admin_review", "not_started", "2026-08-22T11:00:00Z");

    assert.equal(findCurrentTradingOrder([older, newer])?.id, "newer");
  });

  it("returns no current transaction when every order is completed or cancelled", () => {
    const delivered = order("delivered", "locked", "delivered", "2026-08-22T11:00:00Z");
    const cancelled = order("cancelled", "cancelled", "not_started", "2026-08-22T12:00:00Z");

    assert.equal(findCurrentTradingOrder([delivered, cancelled]), undefined);
  });
});

describe("current order screen integration", () => {
  const appSource = readFileSync(
    new URL("../features/pettravel/PetTravelApp.tsx", import.meta.url),
    "utf8"
  );
  const timelineSource = readFileSync(
    new URL("../features/pettravel/components/customer/OrderTimeline.tsx", import.meta.url),
    "utf8"
  );

  it("scopes cached orders to the authenticated identity and opens the live transaction", () => {
    assert.ok(appSource.includes('swrFetch(`orders:${orderScope}`'));
    assert.ok(appSource.includes("findCurrentTradingOrder(data)"));
    assert.ok(appSource.includes("findCurrentTradingOrder(allOrders)"));
    assert.ok(appSource.includes("entityStore.clearOrders()"));
  });

  it("shows a truthful loading or empty state instead of a fabricated order", () => {
    assert.ok(appSource.includes('activeTab === "order" && workingOrder.id'));
    assert.ok(appSource.includes("Đang tải giao dịch hiện tại…"));
    assert.ok(!timelineSource.includes('workingOrder.number || "001"'));
  });
});
