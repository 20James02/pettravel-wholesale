import assert from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const appSource = readFileSync(new URL("./PetTravelApp.tsx", import.meta.url), "utf8");
const adminOrdersSource = readFileSync(
  new URL("./components/admin/AdminOrders.tsx", import.meta.url),
  "utf8"
);
const orderTimelineSource = readFileSync(
  new URL("./components/customer/OrderTimeline.tsx", import.meta.url),
  "utf8"
);

describe("two-way quote confirmation pending states", () => {
  it("keeps every admin publish button disabled with a visible loader until the request settles", () => {
    assert.ok(adminOrdersSource.includes("handlePublishQuote: (customNote?: string) => Promise<boolean>"));
    assert.ok(adminOrdersSource.includes("const [isPublishingQuote, setIsPublishingQuote]"));
    assert.ok(adminOrdersSource.includes("await handlePublishQuote"));
    assert.ok(adminOrdersSource.includes("disabled={quoteEditingDisabled || isPublishingQuote}"));
    assert.ok(adminOrdersSource.includes("aria-busy={isPublishingQuote}"));
    assert.ok(adminOrdersSource.includes("Đang gửi báo giá..."));
    assert.ok(adminOrdersSource.includes("animate-spin"));
    assert.ok(appSource.includes("async function handlePublishQuote(customNote?: string): Promise<boolean>"));
  });

  it("disables customer quote acceptance and shows a loader until its request settles", () => {
    assert.ok(orderTimelineSource.includes("onAcceptQuote?: () => Promise<boolean>"));
    assert.ok(orderTimelineSource.includes("const [isAcceptingQuote, setIsAcceptingQuote]"));
    assert.ok(orderTimelineSource.includes("await onAcceptQuote()"));
    assert.ok(orderTimelineSource.includes("disabled={isAcceptingQuote}"));
    assert.ok(orderTimelineSource.includes("aria-busy={isAcceptingQuote}"));
    assert.ok(orderTimelineSource.includes("Đang xác nhận..."));
    assert.ok(orderTimelineSource.includes("animate-spin"));
    assert.ok(appSource.includes("async function handleCustomerAcceptQuote(): Promise<boolean>"));
  });
});
