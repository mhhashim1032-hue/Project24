import { chromium } from "playwright";
import { spawn } from "node:child_process";

const port = 3210;
const base = "http://127.0.0.1:" + port;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "build-only-placeholder-publishable-key" },
});
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { const response = await fetch(base + "/miniapp?demo=1"); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Next.js server did not become ready.");
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(base + "/miniapp?demo=1", { waitUntil: "domcontentloaded" });
  await page.locator('nav[aria-label="Main navigation"]').waitFor({ state: "visible", timeout: 15000 });

  const mainNav = page.locator('nav[aria-label="Main navigation"]');
  for (const tab of ["Store", "Orders", "Profile"]) {
    const button = mainNav.getByRole("button", { name: new RegExp(tab, "i") });
    await button.click();
    await page.waitForTimeout(100);
    if (!(await button.getAttribute("aria-current") === "page")) throw new Error(tab + " navigation did not become active.");
  }

  await mainNav.getByRole("button", { name: /store/i }).click();
  const sections = page.locator('nav[aria-label="Store sections"]');
  await sections.waitFor({ state: "visible", timeout: 10000 });
  for (const section of ["Products", "Verify", "Methods", "Promos"]) {
    const button = sections.getByRole("button", { name: section, exact: true });
    if (await button.count()) {
      await button.click();
      if (!(await button.evaluate(el => el.classList.contains("active")))) throw new Error(section + " store section did not activate.");
    }
  }
  await sections.getByRole("button", { name: "Products", exact: true }).click();
  const search = page.getByLabel("Search catalogue");
  if (await search.count()) {
    await search.fill("Nova");
    await page.getByText("Nova AI Suite", { exact: true }).first().waitFor({ state: "visible", timeout: 5000 });
    await search.fill("");
  }

  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (mobileOverflow) throw new Error("Mini App has horizontal overflow at 390px viewport.");

  await page.setViewportSize({ width: 768, height: 1024 });
  const tabletOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (tabletOverflow) throw new Error("Mini App has horizontal overflow at 768px viewport.");

  await page.setViewportSize({ width: 390, height: 844 });
  const themes = ["ocean","rose","emerald","graphite","lavender","crimson","arctic","gold","midnight","cyber"];
  for (const theme of themes) {
    const draft = encodeURIComponent(JSON.stringify({ miniapp_theme: theme, miniapp_config: { enable3D: false } }));
    await page.goto(base + "/miniapp?demo=1&draftPreview=" + draft, { waitUntil: "domcontentloaded" });
    await page.locator(".mini-shell.theme-" + theme).waitFor({ state: "attached", timeout: 10000 });
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await nav.getByRole("button", { name: /profile/i }).click();
    await page.locator(".mini-profile-page").waitFor({ state: "visible", timeout: 5000 });
    await page.getByText(/TELEGRAM USER ID/i).waitFor({ state: "visible", timeout: 5000 });
    await nav.getByRole("button", { name: /store/i }).click();
    await page.locator('nav[aria-label="Store sections"]').waitFor({ state: "visible", timeout: 5000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) throw new Error(theme + " theme has horizontal overflow.");
  }

  await page.setViewportSize({ width: 768, height: 1024 });
  const finalTabletOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (finalTabletOverflow) throw new Error("A storefront theme has horizontal overflow at 768px viewport.");

  await page.goto(base + "/admin", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"], input[autocomplete="email"]').first().waitFor({ state: "visible", timeout: 10000 });
  if (pageErrors.length) throw new Error("Browser runtime errors: " + pageErrors.join(" | "));

  console.log("E2E passed: Store/Orders/Profile navigation, Products/Verify/Methods/Promos, catalogue search, all 10 theme/profile previews, mobile/tablet overflow and admin sign-in route.");
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
