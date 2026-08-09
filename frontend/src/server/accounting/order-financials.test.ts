import assert from "node:assert/strict";
import test from "node:test";
import type { AdminPolicy, CustomerOrder } from "../../lib/domain.ts";
import { normalizeOrderQuoteFinancials } from "./order-financials.ts";

const policy: AdminPolicy = {
  freeShippingThreshold: 5_000_000,
  defaultDepositRate: 0.3,
  maxOperatorDiscountRate: 0.08,
  requireManagerApprovalAbove: 500_000
};

function getOrder(overrides?: Partial<CustomerOrder>): CustomerOrder {
  return {
    id: "ord_1",
    number: "PTW-TEST",
    customerName: "Dai ly A",
    customerCompany: "Cong ty A",
    customerId: "user_1",
    commercialStatus: "quoted",
    paymentStatus: "unrequested",
    fulfillmentStatus: "not_started",
    paymentIntent: "deposit_cod",
    invoiceRequested: false,
    items: [
      {
        id: "oi_1",
        productCode: "PT-FOOD",
        productName: "Food",
        variantSku: "PT-FOOD-1KG",
        variantLabel: "1kg",
        quantity: 5,
        unitPriceSnapshot: 120_000,
        supplierId: "sup_pettravel"
      }
    ],
    quoteVersions: [
      {
        id: "q_1",
        version: 1,
        status: "published",
        subtotal: 1,
        adjustments: [
          {
            id: "adj_1",
            type: "discount",
            label: "Client tries any sign",
            amount: 40_000,
            requiresApproval: false
          }
        ],
        finalTotal: 1,
        depositAmount: 168_000,
        codRemaining: 1,
        expiresAt: "2026-08-10T00:00:00.000Z"
      }
    ],
    paymentRequests: [],
    paymentProofs: [],
    fulfillmentGroups: [],
    comments: [],
    updatedAt: "2026-08-09T00:00:00.000Z",
    ...overrides
  };
}

test("normalizeOrderQuoteFinancials recalculates quote totals instead of trusting client totals", () => {
  const normalized = normalizeOrderQuoteFinancials(getOrder(), policy);
  const quote = normalized.quoteVersions[0];

  assert.equal(quote.subtotal, 600_000);
  assert.equal(quote.adjustments[0].amount, -40_000);
  assert.equal(quote.finalTotal, 560_000);
  assert.equal(quote.depositAmount, 168_000);
  assert.equal(quote.codRemaining, 392_000);
});

test("normalizeOrderQuoteFinancials stores full payment due for pay-full quotes", () => {
  const normalized = normalizeOrderQuoteFinancials(
    getOrder({
      paymentIntent: "pay_full",
      quoteVersions: [
        {
          ...getOrder().quoteVersions[0],
          depositAmount: 1
        }
      ]
    }),
    policy
  );

  const quote = normalized.quoteVersions[0];
  assert.equal(quote.finalTotal, 560_000);
  assert.equal(quote.depositAmount, 560_000);
  assert.equal(quote.codRemaining, 0);
});
