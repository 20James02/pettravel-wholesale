import assert from "node:assert/strict";
import test from "node:test";

import type { CustomerOrder, UserAccount } from "../lib/domain.ts";
import { getMissingOrderPermissions, hasQuoteOwnershipWork } from "./order-authorization.ts";

const baseOrder = {
  id: "order_1",
  number: "PTW-1",
  customerName: "Customer",
  customerCompany: "Company",
  customerId: "customer_1",
  commercialStatus: "quoted",
  paymentStatus: "deposit_uploaded",
  fulfillmentStatus: "not_started",
  paymentIntent: "deposit_cod",
  invoiceRequested: false,
  items: [],
  quoteVersions: [],
  paymentRequests: [],
  paymentProofs: [],
  fulfillmentGroups: [],
  comments: [],
  updatedAt: "2026-08-15T00:00:00.000Z"
} satisfies CustomerOrder;

const accountant = {
  id: "accountant_1",
  name: "Accountant",
  company: "Pet Travel",
  organizationId: "internal_org",
  email: "accountant@example.com",
  role: "accountant",
  isAdmin: true,
  permissions: ["order.read", "order.confirm_payment"]
} satisfies UserAccount;

test("accountant can confirm payment but cannot change fulfillment", () => {
  const paymentUpdate = { ...baseOrder, paymentStatus: "deposit_confirmed" as const };
  const fulfillmentUpdate = { ...baseOrder, fulfillmentStatus: "shipped" as const };

  assert.deepEqual(getMissingOrderPermissions(baseOrder, paymentUpdate, accountant), []);
  assert.deepEqual(getMissingOrderPermissions(baseOrder, fulfillmentUpdate, accountant), ["order.ship"]);
});

test("payment and fulfillment work do not take quote ownership", () => {
  const assignedOrder = {
    ...baseOrder,
    assignedStaffId: "operator_1",
    assignedStaffName: "Operator"
  };
  const paymentUpdate = { ...assignedOrder, paymentStatus: "deposit_confirmed" as const };
  const fulfillmentUpdate = { ...assignedOrder, fulfillmentStatus: "supplier_checking" as const };

  assert.equal(hasQuoteOwnershipWork(assignedOrder, paymentUpdate), false);
  assert.equal(hasQuoteOwnershipWork(assignedOrder, fulfillmentUpdate), false);
});

test("quote, commercial status, and assignment changes take quote ownership", () => {
  assert.equal(
    hasQuoteOwnershipWork(baseOrder, {
      ...baseOrder,
      commercialStatus: "customer_accepted"
    }),
    true
  );
  assert.equal(
    hasQuoteOwnershipWork(baseOrder, {
      ...baseOrder,
      assignedStaffId: "operator_1"
    }),
    true
  );
  assert.equal(
    hasQuoteOwnershipWork(baseOrder, {
      ...baseOrder,
      items: [{
        id: "item_1",
        productCode: "P1",
        productName: "Product",
        variantSku: "SKU-1",
        variantLabel: "Default",
        quantity: 1,
        unitPriceSnapshot: 1000,
        supplierId: "supplier_1"
      }]
    }),
    true
  );
});
