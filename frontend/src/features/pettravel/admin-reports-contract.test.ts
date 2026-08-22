import assert from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const reportsSource = readFileSync(
  new URL("./components/admin/AdminReports.tsx", import.meta.url),
  "utf8"
);

describe("admin reports production data contract", () => {
  it("never renders fabricated bank accounts, balances, or reconciliation success", () => {
    assert.ok(!reportsSource.includes("BANK_ACCOUNTS"));
    assert.ok(!reportsSource.includes("1028391829"));
    assert.ok(!reportsSource.includes("PAYOUT-PTW-889"));
    assert.ok(!reportsSource.includes("Tạo lệnh đối soát số dư"));
    assert.ok(!reportsSource.includes("Đã tạo lệnh đối soát tức thời"));
  });

  it("renders reconciliation values returned by the reports API", () => {
    assert.ok(reportsSource.includes("activeKpis.unmatchedBankTransactions"));
    assert.ok(reportsSource.includes("activeKpis.openReconciliationBatches"));
    assert.ok(reportsSource.includes("activeKpis.reconciliationMatchedVnd"));
    assert.ok(reportsSource.includes("activeKpis.reconciliationUnmatchedVnd"));
    assert.ok(reportsSource.includes("reportsOverview?.reconciliationByType"));
  });

  it("does not count an uploaded proof as confirmed cash", () => {
    assert.ok(reportsSource.includes('if (o.paymentStatus === "paid")'));
    assert.ok(!reportsSource.includes('o.paymentStatus === "paid" || o.paymentStatus === "full_uploaded"'));
    assert.ok(!reportsSource.includes('o.paymentStatus === "deposit_confirmed" || o.paymentStatus === "deposit_uploaded"'));
    assert.ok(!reportsSource.includes('["deposit_confirmed", "cod_remaining", "full_uploaded"]'));
    assert.ok(reportsSource.includes('o.paymentIntent === "deposit_cod"'));
  });
});
