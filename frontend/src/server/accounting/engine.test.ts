import assert from "node:assert/strict";
import test from "node:test";
import {
  AccountingError,
  assertBalancedJournalEntry,
  calculateFinancialSnapshot,
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
