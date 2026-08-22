import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateCustomerMutation,
  FORBIDDEN_CUSTOMER_FIELDS,
} from "../lib/order-validation.ts";

test("BFF Defense: FORBIDDEN_CUSTOMER_FIELDS contains all sensitive entity collections and privileged fields", () => {
  const expectedForbidden = [
    "items",
    "quoteVersions",
    "fulfillmentGroups",
    "fulfillmentStatus",
    "shipment",
    "paymentRequests",
    "assignedStaffId",
    "assignedStaffName",
    "paymentStatus",
  ];
  for (const field of expectedForbidden) {
    assert.ok(
      FORBIDDEN_CUSTOMER_FIELDS.includes(field as (typeof FORBIDDEN_CUSTOMER_FIELDS)[number]),
      `Field ${field} must be in FORBIDDEN_CUSTOMER_FIELDS`
    );
  }
});

test("BFF Acceptance: customer minimal contact update payload passes validation", () => {
  const validContactPayload = {
    id: "ord_123",
    recipientName: "Nguyen Van A",
    recipientPhone: "0901234567",
    recipientAddress: "123 Le Loi, Q1, HCMC",
    customerTaxCode: "0312345678",
    customerNote: "Giao gio hanh chinh",
  };

  const parsed = validateCustomerMutation(validContactPayload);
  assert.ok(parsed.success, "Valid contact update must pass validation");
  if (parsed.success && parsed.data) {
    assert.equal(parsed.data.recipientName, "Nguyen Van A");
    assert.equal(parsed.data.recipientPhone, "0901234567");
  }
});

test("BFF Acceptance: customer quote acceptance payload passes validation", () => {
  const validQuoteAcceptancePayload = {
    id: "ord_123",
    commercialStatus: "customer_accepted" as const,
    acceptedQuoteId: "qv_123",
    acceptedQuoteVersion: 1,
  };

  const parsed = validateCustomerMutation(validQuoteAcceptancePayload);
  assert.ok(parsed.success, "Valid quote acceptance must pass validation");
  if (parsed.success && parsed.data) {
    assert.equal(parsed.data.commercialStatus, "customer_accepted");
    assert.equal(parsed.data.acceptedQuoteId, "qv_123");
    assert.equal(parsed.data.acceptedQuoteVersion, 1);
  }
});

test("BFF Acceptance: customer quote feedback/comment payload passes validation", () => {
  const validCommentPayload = {
    id: "ord_123",
    comments: [
      {
        message: "Vui long giam gia van chuyen",
        audience: "customer_visible" as const,
      },
    ],
  };

  const parsed = validateCustomerMutation(validCommentPayload);
  assert.ok(parsed.success, "Valid quote comment must pass validation");
  if (parsed.success && parsed.data) {
    assert.equal(parsed.data.comments?.length, 1);
    assert.equal(parsed.data.comments?.[0].message, "Vui long giam gia van chuyen");
  }
});

test("BFF Acceptance: customer payment proof upload payload passes validation", () => {
  const validProofPayload = {
    id: "ord_123",
    paymentProofs: [
      {
        paymentRequestId: "pr_123",
        storageKey: "orders/ord_123/payment-proof/abcdef123456.jpg",
        fileName: "receipt.jpg",
        contentType: "image/jpeg" as const,
        fileSizeBytes: 102400,
      },
    ],
  };

  const parsed = validateCustomerMutation(validProofPayload);
  assert.ok(parsed.success, "Valid payment proof payload must pass validation");
  if (parsed.success && parsed.data) {
    assert.equal(parsed.data.paymentProofs?.length, 1);
    assert.equal(parsed.data.paymentProofs?.[0].fileName, "receipt.jpg");
  }
});

test("BFF Defense: payment proofs cannot reference an external URL", () => {
  const externalUrl = validateCustomerMutation({
    id: "ord_123",
    paymentProofs: [{
      paymentRequestId: "pr_123",
      fileName: "receipt.jpg",
      fileUrl: "https://attacker.example/receipt.jpg",
      contentType: "image/jpeg",
      fileSizeBytes: 1024,
    }],
  });
  assert.ok(!externalUrl.success);
});

test("BFF Defense: customer payload attempting to modify items is rejected", () => {
  const hackItemsPayload = {
    id: "ord_123",
    items: [
      { variantSku: "SKU-HACK", quantity: 999, unitPrice: 1000 },
    ],
  };

  const parsed = validateCustomerMutation(hackItemsPayload);
  assert.ok(!parsed.success, "Customer cannot submit items array in update");
  assert.ok(parsed.error?.includes("CUSTOMER_OVERPOSTING_REJECTED"));
});

test("BFF Defense: customer payload attempting to modify quoteVersions is rejected", () => {
  const hackQuotePayload = {
    id: "ord_123",
    quoteVersions: [
      { id: "qv_hack", version: 1, finalTotal: 100 },
    ],
  };

  const parsed = validateCustomerMutation(hackQuotePayload);
  assert.ok(!parsed.success, "Customer cannot submit quoteVersions in update");
  assert.ok(parsed.error?.includes("CUSTOMER_OVERPOSTING_REJECTED"));
});

test("BFF Defense: customer payload attempting to modify paymentRequests is rejected", () => {
  const hackPaymentReqPayload = {
    id: "ord_123",
    paymentRequests: [
      { id: "pr_hack", status: "confirmed", amount: 0 },
    ],
  };

  const parsed = validateCustomerMutation(hackPaymentReqPayload);
  assert.ok(!parsed.success, "Customer cannot submit paymentRequests in update");
  assert.ok(parsed.error?.includes("CUSTOMER_OVERPOSTING_REJECTED"));
});

test("BFF Defense: customer payload attempting to modify fulfillmentStatus is rejected", () => {
  const hackFulfillmentPayload = {
    id: "ord_123",
    fulfillmentStatus: "delivered",
  };

  const parsed = validateCustomerMutation(hackFulfillmentPayload);
  assert.ok(!parsed.success, "Customer cannot submit fulfillmentStatus in update");
  assert.ok(parsed.error?.includes("CUSTOMER_OVERPOSTING_REJECTED"));
});

test("BFF Defense: customer payload attempting to modify fulfillmentGroups is rejected", () => {
  const hackGroupsPayload = {
    id: "ord_123",
    fulfillmentGroups: [{ id: "fg_hack", status: "delivered" }],
  };

  const parsed = validateCustomerMutation(hackGroupsPayload);
  assert.ok(!parsed.success, "Customer cannot submit fulfillmentGroups in update");
  assert.ok(parsed.error?.includes("CUSTOMER_OVERPOSTING_REJECTED"));
});

test("BFF Defense: customer payload attempting to modify shipment is rejected", () => {
  const hackShipmentPayload = {
    id: "ord_123",
    shipment: { carrier: "GHTK", trackingCode: "TRACK-HACK" },
  };

  const parsed = validateCustomerMutation(hackShipmentPayload);
  assert.ok(!parsed.success, "Customer cannot submit shipment in update");
  assert.ok(parsed.error?.includes("CUSTOMER_OVERPOSTING_REJECTED"));
});

test("BFF Defense: customer payload attempting to self-assign staff is rejected", () => {
  const hackStaffPayload = {
    id: "ord_123",
    assignedStaffId: "staff_123",
  };

  const parsed = validateCustomerMutation(hackStaffPayload);
  assert.ok(!parsed.success, "Customer cannot submit assignedStaffId in update");
  assert.ok(parsed.error?.includes("CUSTOMER_OVERPOSTING_REJECTED"));
});

test("BFF Defense: customer payload attempting to self-set paymentStatus is rejected", () => {
  const hackPaymentStatusPayload = {
    id: "ord_123",
    paymentStatus: "paid",
  };

  const parsed = validateCustomerMutation(hackPaymentStatusPayload);
  assert.ok(!parsed.success, "Customer cannot submit paymentStatus in update");
  assert.ok(parsed.error?.includes("CUSTOMER_OVERPOSTING_REJECTED"));
});

test("BFF Payment Integrity: payment requests are issued only by the authorized backend workflow", () => {
  const appSource = readFileSync(
    new URL("../features/pettravel/PetTravelApp.tsx", import.meta.url),
    "utf8"
  );
  const paymentRequestRouteSource = readFileSync(
    new URL("../app/api/orders/payment-request/route.ts", import.meta.url),
    "utf8"
  );
  const timelineSource = readFileSync(
    new URL("../features/pettravel/components/customer/OrderTimeline.tsx", import.meta.url),
    "utf8"
  );

  assert.ok(!appSource.includes("000201010212"), "Client-side fake QR fallback must not exist");
  assert.ok(!timelineSource.includes("000201010212"), "Timeline fake QR fallback must not exist");
  assert.ok(!timelineSource.includes("1903688888888"), "Hard-coded receiving account must not exist");
  assert.ok(timelineSource.includes("activeReq.qrPayload"));
  assert.ok(paymentRequestRouteSource.includes('requirePermission("order.confirm_payment")'));
  assert.ok(paymentRequestRouteSource.includes("/api/v1/orders/payment-request/reissue"));
  assert.ok(paymentRequestRouteSource.includes("order_id: input.orderId"));
  assert.ok(appSource.includes("reissuePaymentRequest"));
});

test("BFF Security: login is rate limited and server failures are not reflected to clients", () => {
  const loginRouteSource = readFileSync(
    new URL("../app/api/auth/login/route.ts", import.meta.url),
    "utf8"
  );

  assert.ok(loginRouteSource.includes("consumeRateLimit"));
  assert.ok(loginRouteSource.includes("status: 429"));
  assert.ok(loginRouteSource.includes('"Retry-After"'));
  assert.ok(loginRouteSource.includes("Máy chủ xử lý đăng nhập gặp sự cố"));
  assert.ok(loginRouteSource.includes("if (error instanceof Response) return error"));
});

test("BFF Order Integrity: active-order limit is organization scoped and errors stay private", () => {
  const orderRouteSource = readFileSync(
    new URL("../app/api/orders/route.ts", import.meta.url),
    "utf8"
  );

  assert.ok(!orderRouteSource.includes('o.customerId === user.id &&'));
  assert.ok(!orderRouteSource.includes("details: String(err)"));
  assert.ok(orderRouteSource.includes('o.commercialStatus !== "cancelled"'));
  assert.ok(orderRouteSource.includes('o.fulfillmentStatus !== "delivered"'));
});

test("BFF Role Workflow: quote ownership never blocks accounting or warehouse mutations", () => {
  const orderRouteSource = readFileSync(
    new URL("../app/api/orders/route.ts", import.meta.url),
    "utf8"
  );
  const adminSource = readFileSync(
    new URL("../features/pettravel/components/admin/AdminOrders.tsx", import.meta.url),
    "utf8"
  );

  assert.ok(orderRouteSource.includes("hasQuoteOwnershipWork(existing, updatedOrder)"));
  assert.ok(orderRouteSource.includes("containsQuoteOwnershipWork &&"));
  assert.ok(orderRouteSource.includes("!existing.assignedStaffId && containsQuoteOwnershipWork"));
  assert.ok(orderRouteSource.includes("const ordersAfter = await getOrders(user)"));
  assert.ok(!orderRouteSource.includes(
    'existing.assignedStaffId && existing.assignedStaffId !== user.id && user.role !== "super_admin"'
  ));
  assert.ok(adminSource.includes('hasPermission("order.confirm_payment")'));
  assert.ok(adminSource.includes('hasPermission("order.ship")'));
  assert.ok(adminSource.includes('hasPermission("accounting.post")'));
  assert.ok(adminSource.includes("disabled={!canConfirmPayment || !pendingPaymentProof}"));
  assert.ok(adminSource.includes("!canAdvanceFulfillment ||"));
  assert.ok(adminSource.includes("disabled={!canPostAccounting}"));
});

test("Realtime efficiency: SSE changes trigger fetches without a duplicate four-second full poll", () => {
  const appSource = readFileSync(
    new URL("../features/pettravel/PetTravelApp.tsx", import.meta.url),
    "utf8"
  );
  const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

  assert.ok(appSource.includes('new EventSource("/api/orders/events")'));
  assert.ok(appSource.includes("lastFallbackFetchAt"));
  assert.ok(!appSource.includes("}, 4000)"));
  assert.ok(!dbSource.includes('return "fallback-" + Date.now()'));
});

test("Payment proof integrity: private object is verified and admin confirms the matching request", () => {
  const orderRouteSource = readFileSync(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");
  const downloadRouteSource = readFileSync(
    new URL("../app/api/uploads/private-download/route.ts", import.meta.url),
    "utf8"
  );
  const appSource = readFileSync(new URL("../features/pettravel/PetTravelApp.tsx", import.meta.url), "utf8");
  const adminSource = readFileSync(
    new URL("../features/pettravel/components/admin/AdminOrders.tsx", import.meta.url),
    "utf8"
  );

  assert.ok(orderRouteSource.includes("/api/v1/uploads/verify-private-upload"));
  assert.ok(orderRouteSource.includes("expectedProofPrefix"));
  assert.ok(downloadRouteSource.includes("await getOrders(user)"));
  assert.ok(downloadRouteSource.includes("proofId"));
  assert.ok(downloadRouteSource.includes(".r2.cloudflarestorage.com"));
  assert.ok(appSource.includes('request.id === paymentRequest.id ? { ...request, status: "confirmed" as const }'));
  assert.ok(!appSource.includes("map((p, idx) => (idx === 0"));
  assert.ok(adminSource.includes("Mở minh chứng riêng tư"));
  assert.ok(adminSource.includes("!pendingPaymentProof"));
});

test("Fulfillment integrity: UI advances adjacent states and never fabricates a carrier tracking code", () => {
  const appSource = readFileSync(new URL("../features/pettravel/PetTravelApp.tsx", import.meta.url), "utf8");
  const adminSource = readFileSync(
    new URL("../features/pettravel/components/admin/AdminOrders.tsx", import.meta.url),
    "utf8"
  );

  assert.ok(appSource.includes("async function advanceFulfillment"));
  assert.ok(appSource.includes("trackingCode: shipmentInput.trackingCode.trim()"));
  assert.ok(!appSource.includes("GHN-PTW-"));
  assert.ok(!appSource.includes("Giao Hàng Nhanh (GHN Express)"));
  assert.ok(adminSource.includes("Mã vận đơn thực tế"));
  assert.ok(adminSource.includes("nextFulfillmentStatus"));
  assert.ok(adminSource.includes("Ghi sổ & hoàn tất đơn"));
});
