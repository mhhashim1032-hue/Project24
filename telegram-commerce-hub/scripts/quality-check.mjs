import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const css = read("app/globals.css");
const themes = ["light-gold","obsidian"];
const themeSelectors = [...css.matchAll(/\.mini-shell\.theme-([a-z-]+)\s*\{/g)].map((m) => m[1]);
assert.deepEqual(themeSelectors, themes, "The Mini App must contain exactly two theme selectors.");
function rgb(hex) {
  let value = hex.replace("#", "");
  if (value.length === 3) value = [...value].map((c) => c + c).join("");
  assert.match(value, /^[0-9a-f]{6}$/i, "Invalid palette color: " + hex);
  return value.match(/../g).map((part) => parseInt(part, 16) / 255);
}
function luminance(hex) {
  return rgb(hex).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
for (const legacy of ["aurum","eclipse","aurora","sakura","monolith","verdant","glacier","solstice","neon-forge","porcelain","gold","midnight","ocean","rose","emerald","graphite","lavender","crimson","arctic","cyber"]) {
  assert.ok(!css.includes(".mini-shell.theme-" + legacy) && !css.includes(".mini-shell.design-" + legacy), "Legacy storefront theme remains active: " + legacy);
}
for (const theme of themes) {
  const matches = [...css.matchAll(new RegExp("\\.mini-shell\\.theme-" + theme + "\\s*\\{([^}]+)\\}", "g"))];
  const match = matches.find((candidate) => candidate[1].includes("--gf-bg"));
  assert.ok(match, "Missing semantic palette variables for theme: " + theme);
  const vars = Object.fromEntries([...match[1].matchAll(/--gf-([a-z-]+):\s*(?:var\(--mini-accent,\s*)?(#[0-9a-f]{3,6})/gi)].map((m) => [m[1], m[2]]));
  for (const key of ["bg","surface","text","muted","border","accent","soft","button-text"]) assert.ok(vars[key], theme + " is missing --gf-" + key);
  assert.ok(contrast(vars.text, vars.surface) >= 4.5, theme + " primary text fails WCAG AA");
  assert.ok(contrast(vars.muted, vars.surface) >= 4.5, theme + " muted text fails WCAG AA");
  assert.ok(contrast(vars["button-text"], vars.accent) >= 4.5, theme + " primary button fails WCAG AA");
}
for (const required of [".mini-profile-telegram-id", ".mini-profile-metrics", ".mini-profile-action", ".mini-wallet", ".storefront-picker"]) {
  assert.ok(css.includes(required), "Missing shared component theme rule: " + required);
}
for (const scene of [
  "components/miniapp/verifier-mascot-scene.tsx",
  "components/miniapp/payment-token-scene.tsx",
  "components/miniapp/ads-showcase-scene.tsx",
]) {
  const source = read(scene);
  for (const feature of ["IntersectionObserver", "document.hidden", "prefers-reduced-motion", "geometry.dispose()", "renderer.dispose()"]) {
    assert.ok(source.includes(feature), scene + " is missing " + feature);
  }
}
const routes = {
  "app/api/health/route.ts": ["GET"],
  "app/api/admin/payment-secrets/route.ts": ["GET","POST"],
  "app/api/admin/payment-qr/route.ts": ["POST"],
  "app/api/admin/broadcast/route.ts": ["POST"],
  "app/api/telegram/setup/route.ts": ["POST"],
  "app/api/telegram/webhook/route.ts": ["POST"],
  "app/api/developer/v1/catalog/route.ts": ["GET","OPTIONS"],
};
for (const [file, methods] of Object.entries(routes)) {
  const source = read(file);
  for (const method of methods) assert.ok(source.includes("export async function " + method), file + " is missing " + method);
  assert.ok(source.includes("invokeGoldFeatherServer"), file + " must use the Supabase server bridge");
  assert.ok(!source.includes("SUPABASE_SERVICE_ROLE_KEY"), file + " must not depend on a Vercel service-role secret");
}
const config = read("supabase/config.toml");
assert.ok(config.includes("[functions.gold-feather-server]") && config.includes("verify_jwt = false"), "Server Edge Function must use explicit custom authentication.");
assert.ok(config.includes("[functions.gold-feather-commerce]") && config.includes("verify_jwt = false"), "Commerce Edge Function must validate Telegram initData itself.");
const serverFn = read("supabase/functions/gold-feather-server/index.ts");
const commerceFn = read("supabase/functions/gold-feather-commerce/index.ts");
for (const [label, fn] of [["server", serverFn], ["commerce", commerceFn]]) assert.ok(fn.includes('apiKey.startsWith("sb_")') && fn.includes('headers.delete("authorization")'), label + " Edge Function must send new-format Supabase keys in apikey only, not as Bearer tokens.");
for (const action of ["health","admin_get_payment_secrets","admin_set_payment_secrets","admin_upload_payment_qr","admin_broadcast","admin_telegram_setup","telegram_webhook","developer_catalog"]) {
  assert.ok(serverFn.includes('action === "' + action + '"'), "Missing server action: " + action);
}
assert.ok(serverFn.includes('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")'), "Server function must prefer Supabase's service-role runtime secret");
const packageJson = JSON.parse(read("package.json"));
assert.ok(String(packageJson.dependencies.xlsx).includes("cdn.sheetjs.com/xlsx-0.20.3"), "Use the patched official SheetJS 0.20.3 package source.");
const adminSource = read("app/admin/page.tsx");
assert.ok((adminSource.match(/cellFormula:false/g) || []).length >= 2 && adminSource.includes("sheetRows:20000"), "Spreadsheet imports must disable formulas/HTML and cap parsed rows.");
const roleMigration = read("supabase/migrations/20261109163325_use_auth_role_for_new_secret_key_server_calls.sql");
assert.ok(roleMigration.includes("auth.role()") && roleMigration.includes("create_telegram_developer_api_key") && roleMigration.includes("DROP FUNCTION app_private.is_trusted_supabase_server_call()"), "Server-only RPCs must use auth.role() and remove the temporary API-key header helper.");
assert.ok(["TELEGRAM_BOT_TOKEN","BINANCE_API_KEY","BINANCE_API_SECRET"].every(name => serverFn.includes(name)), "Server function must fall back to existing Supabase Edge Function environment secrets.");
assert.ok(serverFn.includes(String.raw`/^https:\/\//i`), "Health and Telegram setup must accept standard HTTPS URLs.");
const mini = read("app/miniapp/page.tsx");
const navStart = mini.indexOf('<nav className="mini-bottom-nav"');
assert.ok(navStart > mini.indexOf('</div><nav className="mini-bottom-nav"'), "Primary navigation must sit outside the scrollable Mini App content.");
assert.ok(mini.includes('aria-label="Main navigation"') && (mini.match(/className=\{activeTab===/g) || []).length >= 3, "All three persistent navigation destinations must remain available.");
assert.ok(css.includes(".mini-shell > .mini-content{") && css.includes("padding-bottom:calc(112px + env(safe-area-inset-bottom))"), "Scrollable content must reserve space above the fixed bottom navigation.");
assert.ok(css.includes(".mini-shell > .mini-bottom-nav{") && css.includes("z-index:1000!important"), "Primary navigation must be fixed above page content.");
assert.ok(mini.includes("next/dynamic") && mini.includes("ssr: false"), "3D scenes must be split into lazy client chunks.");
for (const tab of ["Store","Orders","Profile"]) assert.ok(mini.includes(tab), "Mini App navigation label missing: " + tab);
console.log("Quality checks passed: exactly two premium theme systems (WCAG AA), profile/wallet/admin surfaces, 3D motion lifecycle, API routes and Supabase server actions.");

const monochrome = read("app/globals.css");
for (const token of [
  "--gf-scene-filter:grayscale(1) sepia(.55) saturate(1.05) contrast(1.12)",
  ".mini-shell .mini-profile-action",
  ".mini-shell .mini-freebies-home-art",
  ".mini-shell .mini-payment-revealed",
  ".mini-shell .gf-verifier-scene canvas",
  ".mini-shell .gf-payment-scene canvas",
  ".mini-shell .gf-ads-scene canvas",
  "background:var(--gf-accent)!important",
]) assert.ok(monochrome.includes(token), "Missing monochrome coverage: " + token);
assert.ok(monochrome.includes(".mini-shell.theme-obsidian{") && monochrome.includes("--gf-bg:#08090b") && monochrome.includes("--gf-accent:#d5d7da"), "Obsidian must use a pure black/graphite/silver palette.");
const verifierScene = read("components/miniapp/verifier-mascot-scene.tsx");
const paymentScene = read("components/miniapp/payment-token-scene.tsx");
const adsScene = read("components/miniapp/ads-showcase-scene.tsx");
for (const [label, source] of [["verifier",verifierScene],["payment",paymentScene],["ads",adsScene]]) {
  assert.ok(/renderer\.render\(scene,\s*camera\)/.test(source) && source.includes("IntersectionObserver"), label + " 3D model must render and animate when visible.");
  assert.ok(!source.includes("0xd9ad58") && !source.includes("0xffe2a6") && !source.includes("0x2d82e8"), label + " 3D materials must not retain gold/blue accent colours.");
}

const admin = read("app/admin/page.tsx");
assert.ok(admin.includes("id:'light-gold'") && admin.includes("id:'obsidian'"), "Admin must expose both premium themes.");
assert.equal((admin.match(/id:'(?:light-gold|obsidian)'/g) || []).length, 2, "Admin gallery must contain exactly two theme choices.");
const themeMigration = read("supabase/migrations/20261110010000_two_premium_storefront_themes.sql");
assert.ok(themeMigration.includes("ARRAY['light-gold','obsidian']"), "Database migration must constrain the setting to exactly two themes.");
for (const legacy of ["aurora","sakura","monolith","verdant","glacier","solstice","neon-forge","porcelain"]) assert.ok(!admin.includes("id:'"+legacy+"'"), "Legacy theme remains in admin gallery: "+legacy);
assert.ok(!mini.includes("design-${settings.miniapp_theme") && mini.includes("layout-grid"), "Mini App must use one shared layout rather than theme-specific structures.");
