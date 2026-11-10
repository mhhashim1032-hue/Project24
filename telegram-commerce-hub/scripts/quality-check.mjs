import fs from "node:fs";
import assert from "node:assert/strict";

const read = (file) => fs.readFileSync(file, "utf8");
assert.ok(fs.existsSync("app/admin/page.tsx"), "Admin dashboard must remain.");
assert.ok(!fs.existsSync("app/miniapp/page.tsx"), "Customer Mini App route must be deleted.");
assert.ok(!fs.existsSync("app/store/page.tsx"), "Legacy storefront redirect must be deleted.");
assert.ok(!fs.existsSync("components/miniapp"), "Mini App-only scene components must be deleted.");
assert.ok(!fs.existsSync("app/verifier-live.css"), "Mini App-only stylesheet must be deleted.");
const root = read("app/page.tsx");
assert.ok(root.includes("redirect('/admin')"), "Root route must direct to the admin dashboard.");
const layout = read("app/layout.tsx");
assert.ok(!layout.includes("telegram-web-app.js") && !layout.includes("verifier-live.css"), "Global layout must not load Telegram Mini App assets.");
const admin = read("app/admin/page.tsx");
for (const retired of ["/miniapp", "Launch customer demo", "Open full preview", "storefront-picker", "Advanced experience studio"]) {
  assert.ok(!admin.includes(retired), "Retired customer UI remains in admin: " + retired);
}
for (const required of ["Customer Mini App retired", "Configure Telegram webhook", "Main bot broadcast", "Payment methods", "Customer directory"]) {
  assert.ok(admin.includes(required), "Admin dashboard is missing: " + required);
}
const serverFn = read("supabase/functions/gold-feather-server/index.ts");
assert.ok(!serverFn.includes("/miniapp") && !serverFn.includes("web_app:"), "Telegram bot must not expose Mini App launch buttons.");
assert.ok(serverFn.includes('type: "default"') && serverFn.includes("miniAppMenuButtonRemoved"), "Telegram setup must clear and verify the old Mini App menu button.");
assert.ok(serverFn.includes('action === "telegram_webhook"') && serverFn.includes('action === "admin_telegram_setup"'), "Telegram webhook and admin setup actions must remain.");
for (const route of [
  "app/api/health/route.ts",
  "app/api/admin/payment-secrets/route.ts",
  "app/api/admin/payment-qr/route.ts",
  "app/api/admin/broadcast/route.ts",
  "app/api/telegram/setup/route.ts",
  "app/api/telegram/webhook/route.ts",
  "app/api/developer/v1/catalog/route.ts",
]) assert.ok(fs.existsSync(route), "Required admin/backend route missing: " + route);
const config = read("supabase/config.toml");
assert.ok(config.includes("[functions.gold-feather-server]") && config.includes("verify_jwt = false"), "Server Edge Function custom authentication must remain configured.");
assert.ok(config.includes("[functions.gold-feather-commerce]") && config.includes("verify_jwt = false"), "Commerce Edge Function custom authentication must remain configured.");
const packageJson = JSON.parse(read("package.json"));
assert.ok(packageJson.scripts.build && packageJson.scripts["quality:check"], "Build and quality scripts must remain.");
console.log("Quality checks passed: Mini App routes/assets/launch links removed; admin, API, webhook and Supabase backend retained.");
