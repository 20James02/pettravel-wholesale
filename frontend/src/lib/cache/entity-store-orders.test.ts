import assert from "node:assert";
import { beforeEach, describe, it } from "node:test";

import type { CustomerOrder } from "../domain.ts";
import { entityStore } from "./entity-store.ts";

function order(id: string): CustomerOrder {
  return {
    id,
    number: id,
    customerName: "",
    customerCompany: "",
    customerId: id,
    commercialStatus: "submitted",
    paymentStatus: "unrequested",
    fulfillmentStatus: "not_started",
    paymentIntent: "deposit_cod",
    invoiceRequested: false,
    updatedAt: new Date().toISOString(),
    items: [],
    quoteVersions: [],
    paymentRequests: [],
    paymentProofs: [],
    fulfillmentGroups: [],
    comments: []
  };
}

describe("order entity cache isolation", () => {
  beforeEach(() => entityStore.clearOrders());

  it("replaces the previous account order set instead of merging identities", () => {
    entityStore.setOrders([order("account-a")]);
    entityStore.setOrders([order("account-b")]);

    assert.deepEqual(entityStore.getAllOrders().map((item) => item.id), ["account-b"]);
  });

  it("clears order entities and cached order requests on account changes", async () => {
    entityStore.setOrders([order("account-a")]);
    await entityStore.swrFetch("orders:account-a:customer", async () => [order("cached-a")]);
    entityStore.clearOrders();

    let fetched = false;
    const result = await entityStore.swrFetch("orders:account-a:customer", async () => {
      fetched = true;
      return [order("fresh-a")];
    });

    assert.equal(fetched, true);
    assert.equal(result.data[0]?.id, "fresh-a");
    assert.deepEqual(entityStore.getAllOrders(), []);
  });
});
