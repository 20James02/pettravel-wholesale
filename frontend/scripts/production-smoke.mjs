import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const frontendUrl = (process.env.PRODUCTION_FRONTEND_URL || "https://pettravel-wholesale.vercel.app").replace(/\/$/, "");
const backendUrl = (process.env.PRODUCTION_BACKEND_URL || "https://pettravel-backend.vercel.app").replace(/\/$/, "");
const maxCatalogBytes = Number(process.env.MAX_CATALOG_BYTES || 750_000);

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

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

async function inspectPage(browser, reducedMotion) {
  const context = await browser.newContext({
    locale: "vi-VN",
    reducedMotion,
    viewport: { width: 1440, height: 1000 }
  });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      runtimeErrors.push(`http ${response.status()}: ${response.url()}`);
    }
  });

  try {
    const response = await page.goto(frontendUrl, { waitUntil: "networkidle", timeout: 60_000 });
    assert(response?.status() === 200, `Homepage returned ${response?.status() ?? "no response"}.`);
    await page.locator('[data-gsap="product-card"]').first().waitFor({ state: "visible", timeout: 45_000 });
    await page.waitForTimeout(900);

    const snapshot = await page.evaluate(() => {
      const hero = document.querySelector('[data-gsap="hero"]');
      const cards = document.querySelectorAll('[data-gsap="product-card"]');
      return {
        h1Count: document.querySelectorAll("h1").length,
        productCardCount: cards.length,
        heroInlineStyle: hero?.getAttribute("style") || "",
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });

    const headers = response.headers();
    assert(snapshot.h1Count === 1, `Expected one H1, received ${snapshot.h1Count}.`);
    assert(snapshot.productCardCount > 0, "Production catalog rendered no product cards.");
    assert(snapshot.horizontalOverflow <= 1, `Homepage overflows horizontally by ${snapshot.horizontalOverflow}px.`);
    assert(headers["content-security-policy"], "Content-Security-Policy header is missing.");
    assert(headers["strict-transport-security"], "Strict-Transport-Security header is missing.");
    assert(runtimeErrors.length === 0, `Browser runtime errors: ${runtimeErrors.join(" | ")}`);

    if (reducedMotion === "reduce") {
      assert(snapshot.heroInlineStyle === "", "GSAP modified the hero while reduced-motion was enabled.");
    } else {
      assert(snapshot.heroInlineStyle.length > 0, "GSAP catalog intro did not apply inline motion styles.");
    }

    return snapshot;
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ executablePath, headless: true });
try {
  const request = await browser.newPage();
  const healthResponse = await request.request.get(`${frontendUrl}/api/health`);
  const catalogResponse = await request.request.get(`${frontendUrl}/api/products`);
  const backendResponse = await request.request.get(`${backendUrl}/`);
  const catalogBody = await catalogResponse.body();
  const health = await healthResponse.json();
  const backendHealth = await backendResponse.json();

  assert(healthResponse.ok(), `Frontend health returned ${healthResponse.status()}.`);
  assert(health.ok === true, "Frontend health payload is not healthy.");
  assert(catalogResponse.ok(), `Catalog returned ${catalogResponse.status()}.`);
  assert(catalogBody.byteLength <= maxCatalogBytes, `Catalog payload ${catalogBody.byteLength} exceeds ${maxCatalogBytes} bytes.`);
  assert(!catalogBody.includes(Buffer.from("data:image")), "Catalog payload still contains a legacy data URL.");
  assert(backendResponse.ok(), `Backend root returned ${backendResponse.status()}.`);
  assert(backendHealth.configurationOk === true, "Backend reports invalid production configuration.");

  const normalMotion = await inspectPage(browser, "no-preference");
  const reducedMotion = await inspectPage(browser, "reduce");
  console.log(JSON.stringify({
    ok: failures.length === 0,
    deployment: health.deployment,
    catalogBytes: catalogBody.byteLength,
    productCards: normalMotion.productCardCount,
    reducedMotionProductCards: reducedMotion.productCardCount,
    failures
  }));
  if (failures.length > 0) {
    throw new Error(`Production smoke failed:\n- ${failures.join("\n- ")}`);
  }
} finally {
  await browser.close();
}
