/**
 * e2e-url-state.ts — URL に載せる画面状態（hooks/useUrlState.ts = nuqs）の通し確認。
 *
 * 単体試験では見えないものだけを見る:
 *   - **日本語入力（IME）の変換中に入力欄が壊れない**。Playwright の
 *     `keyboard.type` は composition を起こさないので、CDP の
 *     `Input.imeSetComposition` → `Input.insertText` で実際の変換を再現する。
 *     壊れると「あさひ」が「ああさあさひ朝日」になる（2026-09-11 の不具合）。
 *   - フィルタ変更で `page` が落ちる / 既定値は URL に残らない / 無関係な
 *     パラメータを消さない / 外から変わった URL（リンク・戻る）を取り込む。
 *   - server モードの画面は URL 変更で RSC を取り直す。
 *
 * 使い捨て DB + 本番ビルドに対して流す（README「画面を実際に動かして確認する」）:
 *   APP_URL=http://localhost:3171 pnpm exec tsx e2e-url-state.ts
 */

import { mkdirSync } from "node:fs";
import { type CDPSession, chromium, type Page } from "@playwright/test";

const APP_URL = process.env.APP_URL ?? "http://localhost:3100";
const USERNAME = process.env.SHOT_ADMIN_USERNAME ?? "demo1";
const PASSWORD = process.env.SHOT_ADMIN_PASSWORD ?? "demo2026";

let failed = 0;
/** 画面の写しを残す先（省略時は残さない）。 */
const SHOT_DIR = process.env.SHOT_DIR;
async function shot(page: Page, name: string): Promise<void> {
  if (!SHOT_DIR) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  const path = `${SHOT_DIR}/${name}.png`;
  // モーダルが開いている間は表示領域ぶんで撮る。
  const overlay = await page.locator(".mantine-Modal-content:visible").count();
  const size = page.viewportSize();
  if (overlay > 0 || !size) {
    if (overlay > 0) await page.waitForTimeout(400); // 開く・入れ替わるアニメーションが終わってから
    await page.screenshot({ path });
    return;
  }
  // 全高で撮る。**fullPage: true は使わない** — Playwright は撮る前に表示領域を一瞬
  // 1×1 にするので、幅で配置を切り替える画面（工程実行の 2 ペイン = MasterDetailShell）
  // が作り直され、開いたばかりのモーダルや入力途中の値が消える（実際に踏んだ）。
  // 幅は変えずに高さだけ伸ばして撮り、元に戻す。
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: size.width, height: Math.min(Math.max(size.height, height), 8000) });
  await page.screenshot({ path });
  await page.setViewportSize(size);
}
function check(name: string, ok: boolean, actual?: unknown): void {
  if (!ok) failed += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${actual === undefined ? "" : `  → ${JSON.stringify(actual)}`}`,
  );
}

const query = (page: Page) => new URL(page.url()).searchParams;
/** nuqs は URL への反映を短く間引く。入力欄ではなく URL を見るときだけ待つ。 */
const settle = (page: Page) => page.waitForTimeout(400);

/** 変換候補を段階的に出してから確定する（= 実際の IME の打鍵）。 */
async function imeType(
  cdp: CDPSession,
  steps: string[],
  committed: string,
): Promise<void> {
  for (const text of steps) {
    await cdp.send("Input.imeSetComposition", {
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });
    await new Promise((r) => setTimeout(r, 60));
  }
  await cdp.send("Input.insertText", { text: committed });
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ locale: "ja-JP" });
  const cdp = await page.context().newCDPSession(page);

  await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "開発用アカウントでログイン" }).click();
  await page.getByLabel("ユーザー名").fill(USERNAME);
  await page.getByLabel("パスワード", { exact: false }).first().fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL(`${APP_URL}/`, { timeout: 30_000 });

  const LIST = `${APP_URL}/master/business-partners`;
  const search = () => page.getByPlaceholder(/検索/).first();

  // ── 1. IME ────────────────────────────────────────────────────────────
  await page.goto(`${LIST}?page=2&keep=1`, { waitUntil: "networkidle" });
  await search().click();
  await imeType(cdp, ["あ", "あさ", "あさひ"], "朝日");
  check("IME: 変換確定後の入力欄", (await search().inputValue()) === "朝日", await search().inputValue());
  await imeType(cdp, ["こ", "こう", "こうぎょう"], "工業");
  check("IME: 続けて変換しても追記にならない", (await search().inputValue()) === "朝日工業", await search().inputValue());
  await settle(page);
  await shot(page, "01-ime-search-in-url");
  check("URL に検索語が載る", query(page).get("q") === "朝日工業", page.url());
  check("フィルタ変更で page が落ちる", !query(page).has("page"), page.url());
  check("無関係なパラメータは残る", query(page).get("keep") === "1", page.url());

  // ── 2. 既定値は URL に残らない ────────────────────────────────────────
  await search().fill("");
  await settle(page);
  check("空に戻すと q が消える", !query(page).has("q"), page.url());

  // ── 3. 外から変わった URL を取り込む ──────────────────────────────────
  await page.goto(`${LIST}?q=abc`, { waitUntil: "networkidle" });
  check("リンクの q が入力欄に入る", (await search().inputValue()) === "abc", await search().inputValue());
  await search().fill("abcd");
  await settle(page);
  await page.goto(`${LIST}?q=xyz`, { waitUntil: "networkidle" });
  await page.goBack({ waitUntil: "networkidle" });
  await shot(page, "02-back-restores-query");
  check("戻るで前の値に戻る", (await search().inputValue()) === "abcd", await search().inputValue());

  // ── 4. ソート・ページ ────────────────────────────────────────────────
  // 名称の列で見る。見出しは 昇順 → 降順 → 解除 の順に回る。
  const firstCodes = async () =>
    page.locator("table tbody tr td:nth-child(3)").allInnerTexts();
  const header = page.locator("table thead th", { hasText: "名称" }).first();
  await page.goto(`${LIST}?sort=name.desc`, { waitUntil: "networkidle" });
  const desc = await firstCodes();
  check(
    "共有リンクの sort=列.desc を読む",
    desc.length > 1 && desc[0] > desc[desc.length - 1],
    [desc[0], desc[desc.length - 1]],
  );
  await header.click(); // 降順 → 解除
  await settle(page);
  check("解除すると sort が消える", !query(page).has("sort"), page.url());
  await header.click(); // → 昇順
  await settle(page);
  check("ソートは 列.向き の書式", query(page).get("sort") === "name.asc", query(page).get("sort"));
  const asc = await firstCodes();
  await shot(page, "03-sorted-asc");
  check("並びが実際に変わる", asc[0] < asc[asc.length - 1], [asc[0], asc[asc.length - 1]]);

  // ── 5. タブ ──────────────────────────────────────────────────────────
  await page.goto(LIST, { waitUntil: "networkidle" });
  await page.locator("table tbody tr").first().click();
  await page.waitForURL(/business-partners\/[^/?]+/, { timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  const tabs = page.getByRole("tab");
  const tabCount = await tabs.count();
  if (tabCount >= 2) {
    await tabs.nth(1).click();
    check("タブは押した瞬間に切り替わる", (await tabs.nth(1).getAttribute("aria-selected")) === "true");
    await settle(page);
    await shot(page, "04-detail-second-tab");
    check("2 枚目のタブは ?tab= に載る", query(page).has("tab"), page.url());
    await tabs.nth(0).click();
    await settle(page);
    check("既定のタブは URL に残らない", !query(page).has("tab"), page.url());
  } else {
    check("詳細にタブが 2 枚以上ある", false, tabCount);
  }

  // ── 6. server モード（SY07 操作履歴）────────────────────────────────
  await page.goto(`${APP_URL}/settings/activity`, { waitUntil: "networkidle" });
  let rsc = 0;
  page.on("request", (r) => {
    if (r.url().includes("/settings/activity") && r.url().includes("_rsc")) rsc += 1;
  });
  await search().click();
  await imeType(cdp, ["み", "みつ", "みつもり"], "見積");
  check("server モード: IME で壊れない", (await search().inputValue()) === "見積", await search().inputValue());
  await page.waitForTimeout(1500);
  await shot(page, "05-server-mode-search");
  check("server モード: URL に載る", query(page).get("q") === "見積", page.url());
  check("server モード: RSC を取り直す", rsc > 0, rsc);
  check("server モード: 取り直し後も入力欄が保たれる", (await search().inputValue()) === "見積", await search().inputValue());

  await browser.close();
  console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
