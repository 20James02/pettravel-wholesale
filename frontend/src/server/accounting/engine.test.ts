import assert from "node:assert/strict";
import test from "node:test";
import {
  AccountingError,
  allocateProRataDiscount,
  assertBalancedJournalEntry,
  calculateFinancialSnapshot,
  calculateTieredUnitPrice,
  calculateUnitRefunds,
  createCodCollectionEntry,
  createDepositReceiptEntry,
  createSaleRecognitionEntry,
  getJournalTotals,
  multiplyVnd,
  roundVndByBps
} from "./engine.ts";

const baseLines = [
  {
    id: "line_1",
    productCode: "PT-FOOD",
    variantSku: "PT-FOOD-1KG",
    supplierId: "sup_pettravel",
    quantity: 5,
    unitPriceVnd: 120_000
  },
  {
    id: "line_2",
    productCode: "PT-TOY",
    variantSku: "PT-TOY-M",
    supplierId: "sup_pettravel",
    quantity: 2,
    unitPriceVnd: 80_000
  }
];

test("multiplyVnd rejects decimals and unsafe money arithmetic", () => {
  assert.equal(multiplyVnd(120_000, 5), 600_000);
  assert.throws(() => multiplyVnd(1.5, 2), AccountingError);
  assert.throws(() => multiplyVnd(Number.MAX_SAFE_INTEGER, 2), /safe integer/);
});

test("roundVndByBps uses integer basis-point math", () => {
  assert.equal(roundVndByBps(1_000_000, 3_000), 300_000);
  assert.equal(roundVndByBps(999, 1_000), 100);
  assert.throws(() => roundVndByBps(1000, 1000.5), AccountingError);
});

test("calculateFinancialSnapshot handles deposit/COD with discount and shipping", () => {
  const snapshot = calculateFinancialSnapshot({
    lines: baseLines,
    adjustments: [
      { id: "adj_discount", type: "discount", label: "Chiet khau rieng", amountVnd: 50_000 },
      { id: "adj_shipping", type: "shipping_fee", label: "Phi ship", amountVnd: 30_000 }
    ],
    paymentIntent: "deposit_cod",
    depositRateBps: 3_000
  });

  assert.deepEqual(
    {
      subtotalVnd: snapshot.subtotalVnd,
      adjustmentTotalVnd: snapshot.adjustmentTotalVnd,
      finalTotalVnd: snapshot.finalTotalVnd,
      depositAmountVnd: snapshot.depositAmountVnd,
      codRemainingVnd: snapshot.codRemainingVnd,
      paymentDueNowVnd: snapshot.paymentDueNowVnd
    },
    {
      subtotalVnd: 760_000,
      adjustmentTotalVnd: -20_000,
      finalTotalVnd: 740_000,
      depositAmountVnd: 222_000,
      codRemainingVnd: 518_000,
      paymentDueNowVnd: 222_000
    }
  );
});

test("calculateFinancialSnapshot handles pay-full orders", () => {
  const snapshot = calculateFinancialSnapshot({
    lines: baseLines,
    adjustments: [{ id: "adj_offer", type: "offer", label: "Uu dai", amountVnd: 60_000 }],
    paymentIntent: "pay_full"
  });

  assert.equal(snapshot.finalTotalVnd, 700_000);
  assert.equal(snapshot.depositAmountVnd, 0);
  assert.equal(snapshot.codRemainingVnd, 0);
  assert.equal(snapshot.paymentDueNowVnd, 700_000);
});

test("calculateFinancialSnapshot rejects invalid deposits and negative totals", () => {
  assert.throws(
    () => calculateFinancialSnapshot({ lines: baseLines, paymentIntent: "deposit_cod", depositAmountVnd: 800_000 }),
    /Deposit cannot be greater/
  );

  assert.throws(
    () =>
      calculateFinancialSnapshot({
        lines: baseLines,
        adjustments: [{ id: "too_big", type: "discount", label: "Bad discount", amountVnd: 1_000_000 }],
        paymentIntent: "pay_full"
      }),
    /negative/
  );
});

test("assertBalancedJournalEntry rejects unbalanced entries", () => {
  assert.throws(
    () =>
      assertBalancedJournalEntry({
        sourceType: "manual_adjustment",
        sourceId: "manual_1",
        idempotencyKey: "manual_1",
        description: "Bad entry",
        lines: [
          { accountCode: "1111", accountName: "Cash", side: "debit", amountVnd: 100_000 },
          { accountCode: "131", accountName: "Receivable", side: "credit", amountVnd: 90_000 }
        ]
      }),
    /not balanced/
  );
});

test("createDepositReceiptEntry creates a balanced bank debit and customer credit", () => {
  const entry = createDepositReceiptEntry({
    orderId: "ord_1",
    paymentRequestId: "pay_1",
    amountVnd: 222_000,
    idempotencyKey: "deposit:pay_1"
  });
  assert.deepEqual(getJournalTotals(entry.lines), { debitVnd: 222_000, creditVnd: 222_000 });
  assert.equal(entry.lines[0].accountCode, "1121");
  assert.equal(entry.lines[1].accountCode, "131");
});

test("createSaleRecognitionEntry splits VAT-inclusive revenue and posts COGS", () => {
  const entry = createSaleRecognitionEntry({
    orderId: "ord_1",
    totalVnd: 1_100_000,
    vatRateBps: 1_000,
    costOfGoodsSoldVnd: 650_000,
    idempotencyKey: "sale:ord_1"
  });

  assert.deepEqual(getJournalTotals(entry.lines), { debitVnd: 1_750_000, creditVnd: 1_750_000 });
  assert.equal(entry.lines.find((line) => line.accountCode === "5111")?.amountVnd, 1_000_000);
  assert.equal(entry.lines.find((line) => line.accountCode === "33311")?.amountVnd, 100_000);
});

test("createCodCollectionEntry creates a balanced COD collection entry", () => {
  const entry = createCodCollectionEntry({
    orderId: "ord_1",
    amountVnd: 518_000,
    idempotencyKey: "cod:ord_1"
  });

  assert.deepEqual(getJournalTotals(entry.lines), { debitVnd: 518_000, creditVnd: 518_000 });
});

test("calculateTieredUnitPrice applies volume discount and protects margin floor", () => {
  const tiers = [
    { minQty: 10, discountBps: 500 }, // 5% off
    { minQty: 50, fixedPriceVnd: 85_000 } // Fixed 85k
  ];
  const basePrice = 100_000;
  const cogs = 80_000;

  // 1. Below Tier 1
  assert.equal(calculateTieredUnitPrice(basePrice, tiers, 5), 100_000);

  // 2. At Tier 1 (10 units -> 5% off = 95,000)
  assert.equal(calculateTieredUnitPrice(basePrice, tiers, 10), 95_000);
  assert.equal(calculateTieredUnitPrice(basePrice, tiers, 25), 95_000);

  // 3. At Tier 2 without COGS floor (50 units -> 85,000)
  assert.equal(calculateTieredUnitPrice(basePrice, tiers, 50), 85_000);

  // 4. At Tier 2 with COGS floor (COGS 80,000 with 10% minMarkup = 88,000 floor)
  // Raw 85,000 is below floor 88,000 -> Should clamp to 88,000
  assert.equal(calculateTieredUnitPrice(basePrice, tiers, 50, cogs, 1_000), 88_000);
});

test("allocateProRataDiscount uses Largest Remainder Method with zero fractional leakage", () => {
  const lines = [
    { id: "l1", unitPriceVnd: 100_000, quantity: 1 }, // 100k
    { id: "l2", unitPriceVnd: 100_000, quantity: 1 }, // 100k
    { id: "l3", unitPriceVnd: 100_000, quantity: 1 }  // 100k (Subtotal = 300k)
  ];

  // Zero discount
  const resZero = allocateProRataDiscount(lines, 0);
  assert.equal(resZero.reduce((sum, r) => sum + r.allocatedDiscountVnd, 0), 0);

  // Full discount
  const resFull = allocateProRataDiscount(lines, 300_000);
  assert.equal(resFull.reduce((sum, r) => sum + r.allocatedDiscountVnd, 0), 300_000);
  assert.equal(resFull.every((r) => r.netTotalVnd === 0), true);

  // Odd discount: 50,000 VND across 3 equal lines (50000 / 3 = 16666 remainder 2)
  // Top 2 lines get 16,667, line 3 gets 16,666. Sum = 50,000 exactly!
  const resOdd = allocateProRataDiscount(lines, 50_000);
  assert.deepEqual(
    resOdd.map((r) => r.allocatedDiscountVnd),
    [16_667, 16_667, 16_666]
  );
  assert.equal(resOdd.reduce((sum, r) => sum + r.allocatedDiscountVnd, 0), 50_000);

  // Stress test: 100 lines with varying values and large discount
  const manyLines = Array.from({ length: 100 }, (_, i) => ({
    id: `item_${i}`,
    unitPriceVnd: 10_000 + i * 1_000,
    quantity: (i % 5) + 1
  }));
  const subtotal = manyLines.reduce((sum, l) => sum + l.unitPriceVnd * l.quantity, 0);
  const discountAmount = Math.floor(subtotal * 0.173) + 1; // 17.3% arbitrary discount

  const resMany = allocateProRataDiscount(manyLines, discountAmount);
  const sumAllocated = resMany.reduce((sum, r) => sum + r.allocatedDiscountVnd, 0);
  assert.equal(sumAllocated, discountAmount);
  assert.equal(resMany.every((r) => r.allocatedDiscountVnd >= 0 && r.netTotalVnd >= 0), true);
});

test("calculateUnitRefunds deterministic per-unit allocation and repeat return safety", () => {
  const lineNet = 100_000;
  const quantity = 3;

  const refundEngine = calculateUnitRefunds(lineNet, quantity);

  // 1. Initial per-unit breakdown: 100,000 / 3 -> [33334, 33333, 33333]
  assert.deepEqual(refundEngine.unitRefundAmountsVnd, [33_334, 33_333, 33_333]);
  assert.equal(
    refundEngine.unitRefundAmountsVnd.reduce((s, v) => s + v, 0),
    100_000
  );

  // 2. Sequential returns test
  // First return: 1 unit
  const ret1 = refundEngine.refundForQuantity(1, 0);
  assert.equal(ret1.totalRefundVnd, 33_334);
  assert.equal(ret1.cumulativeReturnedUnits, 1);
  assert.equal(ret1.remainingNetVnd, 66_666);

  // Second return: 1 unit (subsequent)
  const ret2 = refundEngine.refundForQuantity(1, ret1.cumulativeReturnedUnits);
  assert.equal(ret2.totalRefundVnd, 33_333);
  assert.equal(ret2.cumulativeReturnedUnits, 2);
  assert.equal(ret2.remainingNetVnd, 33_333);

  // Third return: 1 unit (final)
  const ret3 = refundEngine.refundForQuantity(1, ret2.cumulativeReturnedUnits);
  assert.equal(ret3.totalRefundVnd, 33_333);
  assert.equal(ret3.cumulativeReturnedUnits, 3);
  assert.equal(ret3.remainingNetVnd, 0);

  // Total across all 3 returns must be exactly 100,000 VND
  assert.equal(ret1.totalRefundVnd + ret2.totalRefundVnd + ret3.totalRefundVnd, 100_000);

  // 3. Reject over-returns
  assert.throws(
    () => refundEngine.refundForQuantity(1, 3),
    /Cannot return more units/
  );
});
