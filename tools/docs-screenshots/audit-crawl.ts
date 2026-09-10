/**
 * audit-crawl.ts — 使い捨て DB + 本番ビルドの web / 共有端末を巡回し、
 * 画面ごとの実行時エラーと UI/UX の機械的に測れる欠陥を集める。
 *
 * 何を見るか（画面ごと）:
 *   - ナビゲーションの HTTP 状態、pageerror、console.error
 *   - 横スクロール（375px と 1280px の両方 — レイアウト崩れの最初の兆候）
 *   - 本文に "undefined" / "NaN" / "[object Object]" / "MISSING_MESSAGE" / "Invalid Date"
 *   - 名前の無いボタン・リンク（aria-label も文字も無い = 読み上げで「ボタン」としか言われない）
 *   - ラベルの無い入力欄
 *   - 見出し（h1–h3）の無い画面
 *   - 押す的が 44px 未満（共有端末と、web の工程実行画面だけ）
 *
 * 使い方:
 *   pnpm docs:seed（+ e2e-kiosk-fixtures.sql）→ web :3100 / kiosk :3101 を起動 →
 *   pnpm exec tsx audit-crawl.ts [--web] [--kiosk]      （既定は両方）
 * 結果は /tmp/audit-crawl-<web|kiosk>.json と標準出力の要約。
 */
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
import { type BrowserContext, chromium, type Page } from "@playwright/test";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const KIOSK = process.env.KIOSK_URL ?? "http://localhost:3101";
const args = process.argv.slice(2);
const doWeb = args.includes("--web") || !args.includes("--kiosk");
const doKiosk = args.includes("--kiosk") || !args.includes("--web");

type Issue = { url: string; viewport: string; kind: string; detail: string };

const IGNORE_CONSOLE = [
  "Geolocation",
  "/api/avatars/", // デモユーザーの写真ファイルが無い（データ）
  "favicon",
  "Download the React DevTools",
];

const PAGE_CHECKS = `(() => {
  const out = [];
  const se = document.scrollingElement;
  if (se && se.scrollWidth > se.clientWidth + 2) out.push(["overflow-x", se.scrollWidth + ">" + se.clientWidth]);
  const text = document.body ? document.body.innerText : "";
  for (const bad of ["undefined", "NaN", "[object Object]", "MISSING_MESSAGE", "Invalid Date"]) {
    const re = new RegExp("(^|[^A-Za-z_])" + bad.replace(/[.*+?^$()[\\]{}|\\\\]/g, "\\\\$&") + "([^A-Za-z_]|$)");
    if (re.test(text)) out.push(["bad-text", bad]);
  }
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  for (const b of document.querySelectorAll('button, [role="button"], a[href]')) {
    if (!visible(b)) continue;
    const name = (b.getAttribute("aria-label") || b.getAttribute("title") || (b.textContent || "")).trim();
    const inner = b.querySelector("[aria-label], img[alt], svg[aria-label], svg title");
    const labelled = b.getAttribute("aria-labelledby");
    if (!name && !inner && !labelled) out.push(["no-accessible-name", (b.outerHTML || "").slice(0, 140).replace(/\\s+/g, " ")]);
  }
  for (const i of document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea')) {
    if (!visible(i)) continue;
    const id = i.id;
    const ok = (id && document.querySelector('label[for="' + CSS.escape(id) + '"]')) || i.getAttribute("aria-label") || i.getAttribute("aria-labelledby") || i.closest("label");
    if (!ok) out.push(["input-no-label", ((i.getAttribute("placeholder") || i.getAttribute("name") || i.outerHTML) + "").slice(0, 100)]);
  }
  if (!document.querySelector("h1,h2,h3")) out.push(["no-heading", ""]);
  for (const im of document.querySelectorAll("img:not([alt])")) if (visible(im)) out.push(["img-no-alt", (im.getAttribute("src") || "").slice(0, 80)]);
  return out;
})()`;

const SMALL_TARGETS = `(() => {
  const out = [];
  for (const b of document.querySelectorAll('button, [role="button"], a[href], input[type="checkbox"], input[type="radio"]')) {
    const r = b.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.height < 44 || r.width < 44) {
      const name = (b.getAttribute("aria-label") || (b.textContent || "")).trim().slice(0, 40);
      out.push(Math.round(r.width) + "x" + Math.round(r.height) + " " + name);
    }
  }
  return out;
})()`;

function listStaticRoutes(appDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, url: string) => {
    for (const ent of readdirSync(dir)) {
      const p = join(dir, ent);
      if (statSync(p).isDirectory()) {
        if (ent.startsWith("[")) continue;
        const seg = ent.startsWith("(") ? "" : `/${ent}`;
        walk(p, url + seg);
      } else if (ent === "page.tsx") out.push(url || "/");
    }
  };
  walk(appDir, "");
  return Array.from(new Set(out)).sort();
}

async function visit(
  page: Page,
  url: string,
  viewport: string,
  issues: Issue[],
  opts: { smallTargets?: boolean } = {},
): Promise<void> {
  const errs: string[] = [];
  const onErr = (e: Error) => errs.push(`pageerror: ${e.message.slice(0, 200)}`);
  const onConsole = (m: { type(): string; text(): string }) => {
    const t = m.text();
    if (m.type() === "error" && !IGNORE_CONSOLE.some((s) => t.includes(s))) errs.push(`console: ${t.slice(0, 200)}`);
  };
  page.on("pageerror", onErr);
  page.on("console", onConsole);
  try {
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
    const status = res?.status() ?? 0;
    if (status >= 400) issues.push({ url, viewport, kind: `http-${status}`, detail: "" });
    await page.waitForTimeout(500);
    const finalUrl = page.url();
    if (finalUrl.includes("/login")) {
      issues.push({ url, viewport, kind: "redirected-to-login", detail: finalUrl });
      return;
    }
    const checks = (await page.evaluate(PAGE_CHECKS)) as [string, string][];
    for (const [kind, detail] of checks) issues.push({ url, viewport, kind, detail });
    if (opts.smallTargets) {
      const small = (await page.evaluate(SMALL_TARGETS)) as string[];
      for (const s of small) issues.push({ url, viewport, kind: "small-target", detail: s });
    }
  } catch (e) {
    issues.push({ url, viewport, kind: "navigation-failed", detail: String(e).slice(0, 200) });
  } finally {
    page.off("pageerror", onErr);
    page.off("console", onConsole);
    for (const e of errs) issues.push({ url, viewport, kind: e.startsWith("pageerror") ? "pageerror" : "console-error", detail: e });
  }
}

async function webLogin(page: Page): Promise<void> {
  await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "開発用アカウントでログイン" }).click();
  await page.getByLabel("ユーザー名").fill("demo1");
  await page.getByLabel("パスワード", { exact: false }).first().fill("demo2026");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL(`${APP}/`, { timeout: 30_000 });
}

async function collectDetailUrls(page: Page, listUrl: string): Promise<string[]> {
  const found = new Set<string>();
  try {
    await page.goto(listUrl, { waitUntil: "networkidle", timeout: 45_000 });
    const prefix = new URL(listUrl).pathname.replace(/\/$/, "");
    const hrefs = (await page.evaluate(
      (p) => Array.from(document.querySelectorAll("a[href]")).map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? "").filter((h) => h.startsWith(`${p}/`)),
      prefix,
    )) as string[];
    for (const h of hrefs) if (!h.endsWith("/new") && !h.includes("?")) found.add(h.split("#")[0]);
    // DataTable の行はアンカーではない — 先頭 3 行をクリックして URL を拾う
    const rows = page.locator("table tbody tr");
    const n = Math.min(await rows.count(), 3);
    for (let i = 0; i < n; i++) {
      try {
        await page.goto(listUrl, { waitUntil: "networkidle", timeout: 45_000 });
        await page.locator("table tbody tr").nth(i).click({ timeout: 3000 });
        await page.waitForTimeout(800);
        const u = new URL(page.url());
        if (u.pathname !== prefix && u.pathname.startsWith(prefix)) found.add(u.pathname);
      } catch {
        /* 行がクリックできない（選択列など） */
      }
    }
  } catch {
    /* 一覧が開けない — 静的巡回のほうで拾う */
  }
  return Array.from(found);
}

async function runWeb(): Promise<Issue[]> {
  const issues: Issue[] = [];
  const appDir = resolve(HERE, "../../coolify/apps/nextjs-web/src/app/(dashboard)");
  const statics = listStaticRoutes(appDir).filter((r) => !r.includes("["));
  const browser = await chromium.launch();
  const ctx: BrowserContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await webLogin(page);

  console.log(`web: ${statics.length} static routes`);
  for (const r of statics) await visit(page, `${APP}${r}`, "desktop", issues, { smallTargets: false });

  // 詳細 / 編集 URL を一覧から拾う
  const detailUrls = new Set<string>();
  for (const r of statics) {
    if (r === "/" || r.endsWith("/new")) continue;
    for (const d of await collectDetailUrls(page, `${APP}${r}`)) detailUrls.add(d);
  }
  // パターンごとに最大 2 件に間引く
  const byPattern = new Map<string, string[]>();
  for (const d of detailUrls) {
    const key = d.replace(/\/[0-9a-f-]{20,}|\/[A-Z]{2,4}-\d{6}-\d+|\/\d+/g, "/:id");
    const arr = byPattern.get(key) ?? [];
    if (arr.length < 2) arr.push(d);
    byPattern.set(key, arr);
  }
  const details = Array.from(byPattern.values()).flat();
  console.log(`web: ${details.length} detail/edit routes (${byPattern.size} patterns)`);
  for (const d of details) {
    const small = d.includes("/steps/");
    await visit(page, `${APP}${d}`, "desktop", issues, { smallTargets: small });
    if (!d.endsWith("/edit") && !d.includes("/steps/")) {
      // 編集ページがあるパターンだけ
      const editRes = await page.request.get(`${APP}${d}/edit`, { maxRedirects: 0 }).catch(() => null);
      if (editRes && editRes.status() === 200) await visit(page, `${APP}${d}/edit`, "desktop", issues);
    }
  }

  // モバイル幅で横スクロールとエラーを見る
  const mctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const mpage = await mctx.newPage();
  await webLogin(mpage);
  const mobileTargets = [...statics, ...details];
  console.log(`web: mobile pass over ${mobileTargets.length} routes`);
  for (const r of mobileTargets) await visit(mpage, `${APP}${r}`, "mobile", issues);

  await browser.close();
  return issues;
}

async function kioskLogin(page: Page): Promise<void> {
  const a = await page.request.post(`${KIOSK}/api/qr/access`, { data: { cardId: "SHT1234567890ABC" } });
  const { ticket } = (await a.json()) as { ticket: string };
  await page.request.post(`${KIOSK}/api/kiosk/pin`, { data: { ticket, purpose: "PIN_VERIFY", pin: "4321" } });
}

async function runKiosk(): Promise<Issue[]> {
  const issues: Issue[] = [];
  const STEP = "dc011000-0000-4000-8000-000000000006";
  const browser = await chromium.launch();
  for (const [name, viewport] of [
    ["landscape", { width: 1280, height: 800 }],
    ["portrait", { width: 800, height: 1280 }],
  ] as const) {
    const ctx = await browser.newContext({ viewport, hasTouch: true });
    await ctx.addCookies([{ name: "kiosk_device", value: "ckk-shot-device-token-fixed-0001", url: KIOSK }]);
    const page = await ctx.newPage();
    // ログイン前
    await visit(page, `${KIOSK}/login`, name, issues, { smallTargets: true });
    await kioskLogin(page);
    const routes = ["/", "/steps", "/wo-scan", `/steps/${STEP}`, `/steps/${STEP}?from=wo`, "/settings", "/profile"];
    for (const r of routes) await visit(page, `${KIOSK}${r}`, name, issues, { smallTargets: true });
    // 工程一覧から拾える工程詳細（先頭 3 件）
    try {
      await page.goto(`${KIOSK}/steps`, { waitUntil: "networkidle" });
      const hrefs = (await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href^="/steps/"]')).map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""),
      )) as string[];
      for (const h of Array.from(new Set(hrefs)).slice(0, 3)) await visit(page, `${KIOSK}${h}`, name, issues, { smallTargets: true });
    } catch {
      /* 一覧が空 */
    }
    await ctx.close();
    // 未登録端末（Cookie 無し）
    const fresh = await browser.newContext({ viewport, hasTouch: true });
    const fp = await fresh.newPage();
    for (const r of ["/", "/login", "/setup", "/display"]) await visit(fp, `${KIOSK}${r}`, `${name}-unregistered`, issues, { smallTargets: true });
    await fresh.close();
  }
  await browser.close();
  return issues;
}

function summarize(label: string, issues: Issue[]): void {
  const byKind = new Map<string, Issue[]>();
  for (const i of issues) byKind.set(i.kind, [...(byKind.get(i.kind) ?? []), i]);
  console.log(`\n===== ${label}: ${issues.length} issues =====`);
  for (const [kind, list] of Array.from(byKind.entries()).sort((a, b) => b[1].length - a[1].length)) {
    const pages = new Set(list.map((i) => `${i.viewport} ${i.url}`));
    console.log(`\n## ${kind} — ${list.length} hits on ${pages.size} pages`);
    for (const i of list.slice(0, 40)) console.log(`  ${i.viewport} ${i.url.replace(APP, "").replace(KIOSK, "kiosk:")}  ${i.detail}`);
    if (list.length > 40) console.log(`  … +${list.length - 40}`);
  }
}

async function main() {
  if (doKiosk) {
    const k = await runKiosk();
    writeFileSync("/tmp/audit-crawl-kiosk.json", JSON.stringify(k, null, 2));
    summarize("kiosk", k);
  }
  if (doWeb) {
    const w = await runWeb();
    writeFileSync("/tmp/audit-crawl-web.json", JSON.stringify(w, null, 2));
    summarize("web", w);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
