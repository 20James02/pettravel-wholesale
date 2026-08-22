import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const frontendUrl = (process.env.E2E_BASE_URL || "https://pettravel-wholesale.vercel.app").replace(/\/$/, "");
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
if (!executablePath) {
  throw new Error("Chrome/Chromium executable was not found. Set CHROME_PATH explicitly.");
}

for (const [role, value] of Object.entries(credentials)) {
  if (!value.identifier || !value.password) {
    throw new Error(`Missing authenticated E2E credentials for ${role}.`);
  }
}

const customerRoles = new Set(["customer_owner", "customer_staff"]);
const adminRoles = new Set(["super_admin", "admin_manager", "order_operator", "accountant", "warehouse"]);
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function currentTradingOrder(orders) {
  return [...orders]
    .filter((order) => order.commercialStatus !== "cancelled" && order.fulfillmentStatus !== "delivered")
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0] || orders[0];
}

async function readJson(response, label) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    failures.push(`${label} returned non-JSON content (${response.status()}).`);
    return {};
  }
}

function observePage(page, label) {
  const runtimeErrors = [];
  let active = true;
  page.on("pageerror", (error) => {
    if (active) runtimeErrors.push(`${label} pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (!active) return;
    if (message.type() === "error") runtimeErrors.push(`${label} console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (!active) return;
    const url = new URL(response.url());
    if (url.origin === frontendUrl && response.status() >= 400) {
      runtimeErrors.push(`${label} http ${response.status()}: ${url.pathname}`);
    }
  });
  return {
    errors: runtimeErrors,
    stop() {
      active = false;
    }
  };
}

async function loginThroughUi(page, role, account) {
  const route = role === "customer" ? "/orders" : "/admin/orders";
  await page.goto(`${frontendUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const username = page.locator('input[autocomplete="username"]');
  const password = page.locator('input[autocomplete="current-password"]');
  await username.waitFor({ state: "visible", timeout: 30_000 });
  await username.fill(account.identifier);
  await password.fill(account.password);

  const loginResponsePromise = page.waitForResponse(
    (response) => response.url() === `${frontendUrl}/api/auth/login` && response.request().method() === "POST",
    { timeout: 30_000 }
  );
  await page.getByRole("button", { name: "Đăng nhập Cổng sỉ", exact: true }).click();
  const loginResponse = await loginResponsePromise;
  const loginPayload = await readJson(loginResponse, `${role} login`);
  assert(loginResponse.ok(), `${role} login failed with HTTP ${loginResponse.status()}.`);
  assert(Boolean(loginPayload.user?.id), `${role} login returned no user.`);
  return loginPayload.user;
}

async function inspectAuthenticatedContext(browser, role, account) {
  const context = await browser.newContext({
    locale: "vi-VN",
    viewport: { width: 1440, height: 1000 }
  });
  const page = await context.newPage();
  const observer = observePage(page, role);
  const dialogs = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(`${role} dialog: ${dialog.message()}`);
    await dialog.dismiss();
  });

  const loginUser = await loginThroughUi(page, role, account);
  const meResponse = await context.request.get(`${frontendUrl}/api/auth/me`);
  const mePayload = await readJson(meResponse, `${role} session`);
  assert(meResponse.ok(), `${role} /api/auth/me failed with HTTP ${meResponse.status()}.`);
  assert(mePayload.user?.id === loginUser?.id, `${role} session user differs from login user.`);

  const roleSet = role === "customer" ? customerRoles : adminRoles;
  assert(roleSet.has(mePayload.user?.role), `${role} account has unexpected role ${mePayload.user?.role || "unknown"}.`);
  assert(Boolean(mePayload.user?.isAdmin) === (role === "admin"), `${role} isAdmin projection is incorrect.`);

  const sessionCookie = (await context.cookies(frontendUrl)).find((cookie) => cookie.name === "pt_session");
  assert(Boolean(sessionCookie), `${role} pt_session cookie is missing.`);
  assert(sessionCookie?.httpOnly === true, `${role} pt_session is not HttpOnly.`);
  assert(sessionCookie?.secure === true, `${role} pt_session is not Secure.`);
  assert(sessionCookie?.sameSite === "Lax", `${role} pt_session SameSite is not Lax.`);

  const [ordersResponse, catalogResponse] = await Promise.all([
    context.request.get(`${frontendUrl}/api/orders`),
    context.request.get(`${frontendUrl}/api/products`)
  ]);
  const ordersPayload = await readJson(ordersResponse, `${role} orders`);
  const catalogPayload = await readJson(catalogResponse, `${role} catalog`);
  const orders = Array.isArray(ordersPayload.orders) ? ordersPayload.orders : [];
  const products = Array.isArray(catalogPayload.products) ? catalogPayload.products : [];

  assert(ordersResponse.ok(), `${role} orders failed with HTTP ${ordersResponse.status()}.`);
  assert(catalogResponse.ok(), `${role} catalog failed with HTTP ${catalogResponse.status()}.`);
  assert(orders.every((order) => !String(order.id || "").startsWith("ord_e2e_")), `${role} can still see an E2E order.`);
  assert(
    products.some((product) => product.variants?.some((variant) => Number(variant.wholesalePrice) > 0)),
    `${role} authenticated catalog contains no wholesale prices.`
  );

  return { context, page, observer, dialogs, user: mePayload.user, orders };
}

const browser = await chromium.launch({ executablePath, headless: true });
let customer;
let admin;

try {
  customer = await inspectAuthenticatedContext(browser, "customer", credentials.customer);
  const expectedOrder = currentTradingOrder(customer.orders);
  assert(Boolean(expectedOrder), "Customer account has no order to verify.");

  if (expectedOrder) {
    const heading = customer.page.getByRole("heading", {
      name: new RegExp(`Tiến độ đơn hàng sỉ #${escapeRegExp(expectedOrder.number)}$`)
    });
    await heading.waitFor({ state: "visible", timeout: 45_000 }).catch(() => {
      failures.push(`Customer UI did not select current transaction ${expectedOrder.number}.`);
    });
    const customerBody = await customer.page.locator("body").innerText();
    assert(!customerBody.includes("PTW-260817-20CEDA"), "Customer UI still renders the removed fabricated order.");
  }

  admin = await inspectAuthenticatedContext(browser, "admin", credentials.admin);
  assert(customer.user?.id !== admin.user?.id, "Customer and admin sessions resolved to the same user.");

  if (expectedOrder) {
    const adminCopy = admin.orders.find((order) => order.id === expectedOrder.id);
    assert(Boolean(adminCopy), `Admin session cannot see customer transaction ${expectedOrder.number}.`);
    if (adminCopy) {
      assert(adminCopy.updatedAt === expectedOrder.updatedAt, "Customer and admin sessions received different order revisions.");
      assert(adminCopy.commercialStatus === expectedOrder.commercialStatus, "Customer and admin commercial states differ.");
      assert(adminCopy.paymentStatus === expectedOrder.paymentStatus, "Customer and admin payment states differ.");
      assert(adminCopy.fulfillmentStatus === expectedOrder.fulfillmentStatus, "Customer and admin fulfillment states differ.");

      const orderButton = admin.page.getByRole("button", {
        name: new RegExp(`#\\s*${escapeRegExp(expectedOrder.number)}`)
      });
      await orderButton.waitFor({ state: "visible", timeout: 45_000 }).catch(() => {
        failures.push(`Admin UI did not list customer transaction ${expectedOrder.number}.`);
      });
      if (await orderButton.isVisible().catch(() => false)) await orderButton.click();
      await admin.page.getByRole("heading", { name: new RegExp(`#\\s*${escapeRegExp(expectedOrder.number)}$`) })
        .waitFor({ state: "visible", timeout: 15_000 })
        .catch(() => failures.push(`Admin UI did not open transaction ${expectedOrder.number}.`));
    }
  }

  customer.observer.stop();
  admin.observer.stop();
  await Promise.all([customer.page.close(), admin.page.close()]);
  await Promise.all([
    customer.context.request.delete(`${frontendUrl}/api/auth/me`),
    admin.context.request.delete(`${frontendUrl}/api/auth/me`)
  ]);
  const [customerAfterLogout, adminAfterLogout] = await Promise.all([
    customer.context.request.get(`${frontendUrl}/api/auth/me`),
    admin.context.request.get(`${frontendUrl}/api/auth/me`)
  ]);
  const [customerLoggedOut, adminLoggedOut] = await Promise.all([
    readJson(customerAfterLogout, "customer logout"),
    readJson(adminAfterLogout, "admin logout")
  ]);
  assert(customerLoggedOut.user === null, "Customer session remained authenticated after logout.");
  assert(adminLoggedOut.user === null, "Admin session remained authenticated after logout.");

  const observedErrors = [
    ...(customer?.observer?.errors || []),
    ...(admin?.observer?.errors || []),
    ...(customer?.dialogs || []),
    ...(admin?.dialogs || [])
  ];
  failures.push(...observedErrors);

  const result = {
    ok: failures.length === 0,
    deployment: (await (await fetch(`${frontendUrl}/api/health`)).json()).deployment,
    customerRole: customer.user?.role,
    adminRole: admin.user?.role,
    customerOrderCount: customer.orders.length,
    adminOrderCount: admin.orders.length,
    currentTransaction: currentTradingOrder(customer.orders)?.number || null,
    sessionsIsolated: customer.user?.id !== admin.user?.id,
    logoutVerified: customerLoggedOut.user === null && adminLoggedOut.user === null,
    failures
  };
  console.log(JSON.stringify(result));
  if (failures.length > 0) throw new Error("Authenticated production smoke failed.");
} finally {
  await Promise.allSettled([customer?.context?.close(), admin?.context?.close()]);
  await browser.close();
}
