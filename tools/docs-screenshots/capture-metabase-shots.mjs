import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = process.argv[2];
mkdirSync(OUT_DIR, { recursive: true });

const TARGETS = [
  { id: "sy0e-mb-sales", dashboard: 2, name: "受注・売上" },
  { id: "sy0e-mb-production", dashboard: 3, name: "生産進捗" },
  { id: "sy0e-mb-billing", dashboard: 4, name: "請求" },
  { id: "sy0e-mb-inventory", dashboard: 5, name: "在庫" },
  { id: "sy0e-mb-labor", dashboard: 6, name: "労務分析" },
];

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  await page.goto("http://localhost:3033/auth/login", { waitUntil: "networkidle" });
  // Language-agnostic selectors — the login page renders in Japanese now that
  // site-locale=ja is set (matching production), so English placeholder text
  // ("you@email.com" / "Sign in") no longer matches.
  await page.locator('input[type="email"], input[name="username"]').fill("manual-shots@example.invalid");
  await page.locator('input[type="password"]').fill("ManualShots2026!");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("http://localhost:3033/", { timeout: 30000 });
  console.log("logged in");

  for (const t of TARGETS) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`http://localhost:3033/dashboard/${t.dashboard}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    try {
      await page.waitForSelector('[data-testid="loading-spinner"]', { state: "detached", timeout: 15000 });
    } catch {
      /* none present, fine */
    }
    await page.waitForTimeout(1000);
    await page.evaluate(() => document.fonts.ready);

    // Metabase's dashboard grid scrolls inside [data-testid="dashboard"], not
    // the document body — a plain fullPage screenshot only grabs one viewport.
    // Resize the viewport to the container's full scroll height first so the
    // whole dashboard is on-screen, then take a normal (non-cropped) shot.
    const fullHeight = await page.locator('[data-testid="dashboard"]').evaluate((el) => el.scrollHeight);
    await page.setViewportSize({ width: 1440, height: Math.ceil(fullHeight) + 40 });
    await page.waitForTimeout(500);

    const path = join(OUT_DIR, `${t.id}.png`);
    await page.screenshot({ path, fullPage: false, animations: "disabled", caret: "hide" });
    console.log(`captured ${t.name} -> ${path} (height ${fullHeight})`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
