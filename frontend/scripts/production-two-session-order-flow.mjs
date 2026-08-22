import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const frontendUrl = (process.env.E2E_BASE_URL || "https://pettravel-wholesale.vercel.app").replace(/\/$/, "");
const runId = `QA-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const qaMarker = `[QA-E2E:${runId}]`;
const credentials = {
  customer: {
    identifier: process.env.E2E_CUSTOMER_IDENTIFIER,
    password: process.env.E2E_CUSTOMER_PASSWORD
  },
  admin: {
    identifier: process.env.E2E_ADMIN_IDENTIFIER,
    password: process.env.E2E_ADMIN_PASSWORD
  }
};

const executableCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].filter(Boolean);
const executablePath = executableCandidates.find((candidate) => existsSync(candidate));

if (!executablePath) throw new Error("Chrome/Chromium executable was not found.");
for (const [role, account] of Object.entries(credentials)) {
  if (!account.identifier || !account.password) throw new Error(`Missing E2E credentials for ${role}.`);
}

const failures = [];
const evidence = {
  runId,
  orderNumber: null,
  productCode: null,
  initialQuantity: null,
  quotedQuantity: null,
  customerToAdminRealtimeMs: null,
  adminToCustomerRealtimeMs: null,
  customerToAdminAcceptanceRealtimeMs: null,
  paymentRequestCreated: false,
  cleanupStatus: "not_started"
};

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readJson(response, label) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label} returned non-JSON content (HTTP ${response.status()}).`);
  }
}

async function apiLogin(context, role, account) {
  const response = await context.request.post(`${frontendUrl}/api/auth/login`, {
    headers: { Origin: frontendUrl, "Content-Type": "application/json" },
    data: { identifier: account.identifier, password: account.password }
  });
  const payload = await readJson(response, `${role} login`);
  if (!response.ok()) throw new Error(`${role} login failed with HTTP ${response.status()}: ${payload.error || "unknown error"}`);
  return payload.user;
}

async function getOrders(context) {
  const response = await context.request.get(`${frontendUrl}/api/orders`);
  const payload = await readJson(response, "orders");
  if (!response.ok()) throw new Error(`Orders request failed with HTTP ${response.status()}.`);
  return Array.isArray(payload.orders) ? payload.orders : [];
}

async function pollOrder(context, orderId, predicate, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = (await getOrders(context)).find((order) => order.id === orderId);
    if (latest && predicate(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return latest;
}

function observeRuntime(page, role) {
  const errors = [];
  let realtimeConnected = false;
  page.on("pageerror", (error) => errors.push(`${role} pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${role} console: ${message.text()}`);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== frontendUrl) return;
    if (url.pathname === "/api/orders/events" && response.status() === 200) realtimeConnected = true;
    if (response.status() >= 500) errors.push(`${role} http ${response.status()}: ${url.pathname}`);
  });
  return { errors, get realtimeConnected() { return realtimeConnected; } };
}

async function waitForVisible(locator, timeout = 30_000) {
  try {
    await locator.waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

async function selectAdminOrder(page, orderNumber) {
  const button = page.getByRole("button", { name: new RegExp(`#\\s*${escapeRegExp(orderNumber)}`) }).first();
  if (!(await waitForVisible(button, 30_000))) return false;
  await button.click();
  return waitForVisible(page.getByRole("heading", { name: new RegExp(`#\\s*${escapeRegExp(orderNumber)}$`) }), 15_000);
}

async function cancelQaOrder(context, orderId) {
  const orders = await getOrders(context);
  const order = orders.find((candidate) => candidate.id === orderId);
  if (!order) return "missing";
  if (!String(order.customerNote || "").includes(qaMarker)) {
    throw new Error("Cleanup guard rejected an order without the exact QA marker.");
  }
  if (order.commercialStatus === "cancelled") return "cancelled";
  if (["deposit_confirmed", "paid", "refunded"].includes(order.paymentStatus) || order.commercialStatus === "locked") {
    throw new Error("Cleanup refused because the QA order entered a financial or locked state.");
  }

  const response = await context.request.put(`${frontendUrl}/api/orders`, {
    headers: { Origin: frontendUrl, "Content-Type": "application/json" },
    data: {
      ...order,
      commercialStatus: "cancelled",
      comments: [
        {
          id: `c_qa_cleanup_${Date.now()}`,
          author: "QA Automation",
          audience: "internal",
          message: `${qaMarker} Kết thúc kiểm thử hai phiên; hủy đơn để hoàn trả giữ kho.`,
          createdAt: new Date().toISOString()
        },
        ...(order.comments || [])
      ],
      updatedAt: new Date().toISOString()
    }
  });
  const payload = await readJson(response, "QA cleanup");
  if (!response.ok()) throw new Error(`QA cleanup failed with HTTP ${response.status()}: ${payload.error || "unknown error"}`);
  return payload.order?.commercialStatus || "unknown";
}

const browser = await chromium.launch({ executablePath, headless: true });
const customerContext = await browser.newContext({ locale: "vi-VN", viewport: { width: 1440, height: 1000 } });
const adminContext = await browser.newContext({ locale: "vi-VN", viewport: { width: 1440, height: 1000 } });
const customerPage = await customerContext.newPage();
const adminPage = await adminContext.newPage();
const customerRuntime = observeRuntime(customerPage, "customer");
const adminRuntime = observeRuntime(adminPage, "admin");
let createdOrder;

customerPage.on("dialog", async (dialog) => dialog.dismiss());
adminPage.on("dialog", async (dialog) => dialog.dismiss());

try {
  const [customerUser, adminUser] = await Promise.all([
    apiLogin(customerContext, "customer", credentials.customer),
    apiLogin(adminContext, "admin", credentials.admin)
  ]);
  assert(customerUser && !customerUser.isAdmin, "Customer credentials did not resolve to a customer account.");
  assert(adminUser?.isAdmin === true, "Admin credentials did not resolve to an admin account.");
  assert(customerUser?.id !== adminUser?.id, "Customer and admin sessions resolved to the same user.");

  const initialCustomerOrders = await getOrders(customerContext);
  const activeCustomerOrder = initialCustomerOrders.find(
    (order) => order.commercialStatus !== "cancelled" && order.fulfillmentStatus !== "delivered"
  );
  if (activeCustomerOrder) throw new Error(`Customer already has active order ${activeCustomerOrder.number}; refusing to create another.`);

  const catalogResponse = await customerContext.request.get(`${frontendUrl}/api/products`);
  const catalog = await readJson(catalogResponse, "catalog");
  if (!catalogResponse.ok()) throw new Error(`Catalog request failed with HTTP ${catalogResponse.status()}.`);
  const products = Array.isArray(catalog.products) ? catalog.products : [];
  const product = products.find((candidate) => candidate.variants?.some(
    (variant) => Number(variant.wholesalePrice) > 0 && Number(variant.stock) >= Number(variant.minOrderQty || 1)
  ));
  if (!product) throw new Error("No in-stock wholesale product is available for the QA order.");
  const variant = product.variants.find(
    (candidate) => Number(candidate.wholesalePrice) > 0 && Number(candidate.stock) >= Number(candidate.minOrderQty || 1)
  );
  evidence.productCode = product.code;
  evidence.initialQuantity = Number(variant.minOrderQty || 1);

  await Promise.all([
    customerPage.goto(frontendUrl, { waitUntil: "domcontentloaded", timeout: 60_000 }),
    adminPage.goto(`${frontendUrl}/admin/orders`, { waitUntil: "domcontentloaded", timeout: 60_000 })
  ]);
  await customerPage.getByRole("button", { name: `Xem chi tiết ${product.name}`, exact: true }).waitFor({ state: "visible", timeout: 45_000 });
  await customerPage.getByRole("button", { name: `Xem chi tiết ${product.name}`, exact: true }).click();
  const addButton = customerPage.getByRole("button", { name: "Thêm vào đơn sỉ", exact: true });
  await addButton.waitFor({ state: "visible", timeout: 20_000 });
  await addButton.click();
  await customerPage.getByRole("button", { name: /Giỏ hàng & Báo giá/ }).click();
  await customerPage.getByRole("heading", { name: "Danh sách hàng sỉ đã chọn" }).waitFor({ state: "visible", timeout: 20_000 });

  await customerPage.locator('input[autocomplete="name"]').fill(`QA Automation ${runId}`);
  await customerPage.locator('input[autocomplete="tel"]').fill("0987654321");
  await customerPage.locator('textarea[autocomplete="street-address"]').fill(`Địa chỉ kiểm thử tự động - không giao hàng - ${runId}`);
  await customerPage.getByPlaceholder("Giao giờ hành chính, gọi trước...").fill(`${qaMarker} Kiểm thử hai phiên customer/admin; không giao hàng.`);

  const createResponsePromise = customerPage.waitForResponse(
    (response) => response.url() === `${frontendUrl}/api/orders` && response.request().method() === "POST",
    { timeout: 45_000 }
  );
  const createStartedAt = Date.now();
  await customerPage.getByRole("button", { name: "Gửi yêu cầu báo giá sỉ", exact: true }).click();
  const createResponse = await createResponsePromise;
  const createPayload = await readJson(createResponse, "create order");
  if (!createResponse.ok()) throw new Error(`Create order failed with HTTP ${createResponse.status()}: ${createPayload.error || "unknown error"}`);
  createdOrder = createPayload.order;
  evidence.orderNumber = createdOrder.number;
  assert(createdOrder.commercialStatus === "submitted", "New order was not persisted as submitted.");
  assert(createdOrder.items?.[0]?.quantity === evidence.initialQuantity, "Created quantity differs from selected MOQ.");
  await customerPage.getByRole("heading", { name: new RegExp(`Tiến độ đơn hàng sỉ #${escapeRegExp(createdOrder.number)}$`) })
    .waitFor({ state: "visible", timeout: 30_000 });

  let adminSawOrder = await selectAdminOrder(adminPage, createdOrder.number);
  if (!adminSawOrder) {
    failures.push("Admin UI did not receive the new order through the live channel before fallback reload.");
    await adminPage.reload({ waitUntil: "domcontentloaded" });
    adminSawOrder = await selectAdminOrder(adminPage, createdOrder.number);
  }
  assert(adminSawOrder, "Admin UI could not open the newly created QA order.");
  evidence.customerToAdminRealtimeMs = Date.now() - createStartedAt;

  const productRow = adminPage.locator("tbody tr").filter({ hasText: product.name }).first();
  const quantityInput = productRow.locator('input[type="number"]').first();
  await quantityInput.waitFor({ state: "visible", timeout: 20_000 });
  await quantityInput.fill("1");
  await quantityInput.blur();
  await adminPage.getByPlaceholder(/Dạ em đã áp dụng chiết khấu/).fill(`${qaMarker} Báo giá QA; không giao hàng.`);

  const quoteResponsePromise = adminPage.waitForResponse(
    (response) => response.url() === `${frontendUrl}/api/orders` && response.request().method() === "PUT",
    { timeout: 60_000 }
  );
  const quoteStartedAt = Date.now();
  await adminPage.getByRole("button", { name: "Publish Quote (Gửi Báo Giá)", exact: true }).click();
  const quoteResponse = await quoteResponsePromise;
  const quotePayload = await readJson(quoteResponse, "publish quote");
  if (!quoteResponse.ok()) throw new Error(`Publish quote failed with HTTP ${quoteResponse.status()}: ${quotePayload.error || "unknown error"}`);
  assert(quotePayload.order?.commercialStatus === "quoted", "Admin publish did not move the order to quoted.");
  evidence.quotedQuantity = quotePayload.order?.items?.[0]?.quantity ?? null;
  assert(evidence.quotedQuantity === 1, "Admin MOQ override quantity was not persisted as 1.");

  const acceptButton = customerPage.getByRole("button", { name: "Xác nhận chấp thuận báo giá & Đặt cọc", exact: true });
  let customerSawQuote = await waitForVisible(acceptButton, 30_000);
  if (!customerSawQuote) {
    failures.push("Customer UI did not receive the published quote through the live channel before fallback reload.");
    await customerPage.reload({ waitUntil: "domcontentloaded" });
    customerSawQuote = await waitForVisible(acceptButton, 20_000);
  }
  assert(customerSawQuote, "Customer UI could not display the published quote.");
  evidence.adminToCustomerRealtimeMs = Date.now() - quoteStartedAt;

  const acceptResponsePromise = customerPage.waitForResponse(
    (response) => response.url() === `${frontendUrl}/api/orders` && response.request().method() === "PUT",
    { timeout: 60_000 }
  );
  const acceptStartedAt = Date.now();
  await acceptButton.click();
  const acceptResponse = await acceptResponsePromise;
  const acceptPayload = await readJson(acceptResponse, "accept quote");
  if (!acceptResponse.ok()) throw new Error(`Accept quote failed with HTTP ${acceptResponse.status()}: ${acceptPayload.error || "unknown error"}`);
  assert(acceptPayload.order?.commercialStatus === "customer_accepted", "Customer acceptance was not persisted.");
  assert(acceptPayload.order?.quoteVersions?.at(-1)?.status === "accepted", "Accepted quote snapshot was not locked as accepted.");
  evidence.paymentRequestCreated = Boolean(acceptPayload.order?.paymentRequests?.some(
    (request) => request.status === "active" || request.status === "uploaded"
  ));
  assert(evidence.paymentRequestCreated, "Accepting the quote did not create an active payment request.");

  const adminAccepted = await pollOrder(
    adminContext,
    createdOrder.id,
    (order) => order.commercialStatus === "customer_accepted",
    45_000
  );
  evidence.customerToAdminAcceptanceRealtimeMs = Date.now() - acceptStartedAt;
  assert(adminAccepted?.commercialStatus === "customer_accepted", "Admin session did not observe customer acceptance.");
  await adminPage.getByText("Khách đã chốt", { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 })
    .catch(() => failures.push("Admin UI did not render the accepted state through realtime."));

  const customerAccepted = await pollOrder(customerContext, createdOrder.id, (order) => order.commercialStatus === "customer_accepted", 10_000);
  assert(customerAccepted?.updatedAt === adminAccepted?.updatedAt, "Customer and admin sessions ended on different order revisions.");
  assert(customerAccepted?.items?.[0]?.quantity === 1, "Customer did not receive the admin MOQ override.");
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
} finally {
  if (createdOrder?.id) {
    try {
      evidence.cleanupStatus = await cancelQaOrder(adminContext, createdOrder.id);
      assert(evidence.cleanupStatus === "cancelled", `QA order cleanup ended in ${evidence.cleanupStatus}.`);
      const cancelledForCustomer = await pollOrder(
        customerContext,
        createdOrder.id,
        (order) => order.commercialStatus === "cancelled",
        20_000
      );
      assert(cancelledForCustomer?.commercialStatus === "cancelled", "Customer session did not observe QA cancellation.");
    } catch (cleanupError) {
      evidence.cleanupStatus = "failed";
      failures.push(cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
    }
  }

  failures.push(...customerRuntime.errors, ...adminRuntime.errors);
  const healthResponse = await fetch(`${frontendUrl}/api/health`);
  const health = await healthResponse.json();
  console.log(JSON.stringify({
    ok: failures.length === 0,
    deployment: health.deployment,
    customerRole: "customer_owner",
    adminRole: "admin_manager",
    sessionsParallel: true,
    customerRealtimeConnected: customerRuntime.realtimeConnected,
    adminRealtimeConnected: adminRuntime.realtimeConnected,
    evidence,
    failures
  }));

  await Promise.allSettled([customerContext.close(), adminContext.close()]);
  await browser.close();
}

if (failures.length > 0) process.exitCode = 1;
