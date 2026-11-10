import { chromium } from "playwright";
import { spawn } from "node:child_process";

const port = 3210;
const base = "http://127.0.0.1:" + port;
const preview = "/miniapp?draftPreview=%7B%7D";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "build-only-placeholder-publishable-key" },
});
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { const response = await fetch(base + preview); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Next.js server did not become ready.");
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(base + preview, { waitUntil: "domcontentloaded" });
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 15000 });
  await page.locator('.mini-shell[data-client-ready="true"]').waitFor({ state: "attached", timeout: 15000 });
  await page.waitForTimeout(1300);

  const mainNav = page.locator('nav[aria-label="Main navigation"]');
  const navLayout = await mainNav.evaluate(el => ({
    position: getComputedStyle(el).position,
    columns: getComputedStyle(el).gridTemplateColumns.split(" ").length,
  }));
  if (navLayout.position !== "fixed" || navLayout.columns !== 4) throw new Error("Primary navigation layout mismatch: " + JSON.stringify(navLayout));
  const navBeforeScroll = await mainNav.boundingBox();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(150);
  const navAfterScroll = await mainNav.boundingBox();
  if (!navBeforeScroll || !navAfterScroll || Math.abs(navAfterScroll.y - navBeforeScroll.y) > 2) throw new Error("Primary navigation moved or disappeared while scrolling.");
  await page.evaluate(() => window.scrollTo(0, 0));

  for (const tab of ["Store", "Orders", "Balance", "Profile"]) {
    const button = mainNav.getByRole("button", { name: new RegExp(tab, "i") });
    await button.click();
    await page.waitForFunction(label => {
      const buttons = [...document.querySelectorAll('nav[aria-label="Main navigation"] button')];
      const target = buttons.find(item => item.textContent?.toLowerCase().includes(label.toLowerCase()));
      return target?.getAttribute("aria-current") === "page";
    }, tab, { timeout: 4000 }).catch(async () => { throw new Error(tab + " navigation did not activate; current nav=" + await mainNav.innerText()); });
  }

  await mainNav.getByRole("button", { name: /store/i }).click();
  const sections = page.locator('nav[aria-label="Store sections"]');
  await sections.waitFor({ state: "visible", timeout: 10000 });
  for (const section of ["Products", "Verify", "Methods", "Ads"]) {
    const button = sections.getByRole("button", { name: section, exact: true });
    await button.click();
    if (!(await button.evaluate(el => el.classList.contains("active")))) throw new Error(section + " store section did not activate.");
  }
  await sections.getByRole("button", { name: "Products", exact: true }).click();

  const search = page.getByLabel("Search catalogue");
  await search.fill("Creative");
  const matchingProduct = page.locator(".gf-product-tile:visible").filter({ hasText: "Creative Suite Pro" }).first();
  await matchingProduct.waitFor({ state: "visible", timeout: 5000 });
  await search.fill("");
  const firstProduct = page.locator(".gf-product-tile:visible").first();
  await firstProduct.click();
  await page.locator(".gf-detail-heading").waitFor({ state: "visible", timeout: 5000 });
  if (!(await page.locator(".mini-plan-list .mini-plan").count())) throw new Error("Product detail did not render its pricing plans.");
  const backToCatalogue = page.getByRole("button", { name: /catalogue/i });
  const backHitTest = await backToCatalogue.evaluate(el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { pointerEvents: getComputedStyle(el).pointerEvents, hitTag: hit?.tagName, hitClass: (hit as HTMLElement | null)?.className }; });
  console.log("Product detail back-control hit test:", JSON.stringify(backHitTest));
  await backToCatalogue.evaluate(el => (el as HTMLButtonElement).click());
  await page.locator(".gf-product-grid").waitFor({ state: "visible", timeout: 5000 });

  for (const width of [390, 768, 1920]) {
    await page.setViewportSize({ width, height: width > 1000 ? 1080 : 1024 });
    await page.waitForTimeout(100);
    const dimensions = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      columns: getComputedStyle(document.querySelector(".gf-product-grid")).gridTemplateColumns.split(" ").length,
    }));
    if (dimensions.overflow) throw new Error("Mini App has horizontal overflow at " + width + "px viewport.");
    if (width >= 1120 && dimensions.columns < 4) throw new Error("Full HD desktop catalogue must show at least four product columns.");
  }

  await page.goto(base + "/admin", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"], input[autocomplete="email"]').first().waitFor({ state: "visible", timeout: 10000 });
  if (pageErrors.length) throw new Error("Browser runtime errors: " + pageErrors.join(" | "));
  console.log("E2E passed: storefront navigation, store sections, catalogue search, product details/plans, mobile/tablet/Full HD responsive layouts, and preserved admin sign-in.");
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
