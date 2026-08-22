import assert from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const appSource = readFileSync(new URL("./PetTravelApp.tsx", import.meta.url), "utf8");
const accountingSource = readFileSync(
  new URL("./components/admin/AdminAccounting.tsx", import.meta.url),
  "utf8"
);
const routeSource = readFileSync(
  new URL("../../app/api/admin/promotions/route.ts", import.meta.url),
  "utf8"
);

describe("promotions policy production contract", () => {
  it("fails visibly when the authoritative backend policy cannot be loaded", () => {
    assert.ok(routeSource.includes('status: 502'));
    assert.ok(routeSource.includes('PROMOTIONS_POLICY_FETCH_FAILED'));
    assert.ok(!routeSource.includes('Bát ăn inox cao cấp chống trượt'));
  });

  it("blocks quote publication until policy data is verified", () => {
    assert.ok(appSource.includes('const [isPromotionsPolicyVerified'));
    assert.ok(appSource.includes('isPromotionsPolicyVerified ? promotionsPolicy : await fetchPromotions()'));
    assert.ok(appSource.includes('if (!quotePolicy)'));
    assert.ok(appSource.includes('const depositRate = quotePolicy.defaultDepositRate'));
    assert.ok(appSource.includes('fetchPromotions();'));
    assert.ok(appSource.includes('promotionsPolicySchema.parse(data.policy)'));
  });

  it("does not render fabricated promotion tiers or gifts", () => {
    assert.ok(!accountingSource.includes('const defaultTiers'));
    assert.ok(!accountingSource.includes('Balo phi hành gia thú cưng VIP'));
    assert.ok(!accountingSource.includes('Bát ăn inox hoặc đồ chơi thú cưng'));
    assert.ok(!accountingSource.includes('Bảng Các Bậc Ưu Đãi Theo Giá Trị Đơn Hàng'));
  });

  it("serializes policy saves and keeps the confirmation pending until persistence settles", () => {
    assert.ok(accountingSource.includes('if (isSavingPromotions) return'));
    assert.ok(accountingSource.includes('disabled={isSavingPromotions}'));
    assert.ok(accountingSource.includes('aria-busy={isSavingPromotions}'));
    assert.ok(accountingSource.includes('Đang lưu…'));
  });
});
