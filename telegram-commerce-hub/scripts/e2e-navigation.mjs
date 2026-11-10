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
    try { const response = await fetch(base + "/admin"); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Next.js server did not become ready.");
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  const rootResponse = await page.goto(base + "/", { waitUntil: "domcontentloaded" });
  if (!rootResponse || rootResponse.status() >= 400 || !page.url().endsWith("/admin")) throw new Error("Root route must redirect to /admin.");

  await page.locator('input[type="email"], input[autocomplete="email"]').first().waitFor({ state: "visible", timeout: 10000 });
  const adminHtml = await page.locator("body").innerText();
  if (!adminHtml.toLowerCase().includes("sign in") && !adminHtml.toLowerCase().includes("email")) throw new Error("Admin sign-in screen did not render.");

  for (const route of ["/miniapp", "/store"]) {
    const response = await page.goto(base + route, { waitUntil: "domcontentloaded" });
    if (!response || response.status() !== 404) throw new Error(route + " must return 404 after storefront retirement.");
  }

  await page.goto(base + "/admin", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"], input[autocomplete="email"]').first().waitFor({ state: "visible", timeout: 10000 });
  const links = await page.locator("a").evaluateAll(nodes => nodes.map(node => node.getAttribute("href") || ""));
  if (links.some(href => href.includes("/miniapp"))) throw new Error("Admin page still exposes a Mini App launch link.");
  if (pageErrors.length) throw new Error("Browser runtime errors: " + pageErrors.join(" | "));
  console.log("E2E passed: admin root redirect, admin sign-in screen, retired /miniapp and /store return 404, and no admin launch links.");
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
