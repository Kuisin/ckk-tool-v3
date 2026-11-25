/**
 * e2e-wip-stock.ts — 在庫管理の「仕掛品」タブ（仕掛品の再設計 PR 4）の通し確認。
 *
 * 単体試験では見えないものを実画面で見る:
 *   - 仕掛品タブが 材種 / 径 / 長 → 加工状態 でまとまって出る・絞り込める
 *   - 製品タブに仕掛品の行が出ない／「使える仕掛品 n 本」から仕掛品タブへ
 *     絞り込んだ状態で飛べる
 *   - 加工状態に名前を付けられる
 *   - 「未分類」を分類すると、数量が変わらず行き先だけ変わる
 *     （入出庫伝票 1 枚に OUT + IN）
 *   - モバイル幅でカード表示になり、横にはみ出さない
 *
 * **使い捨て DB を書き換える**（分類・名前付け）。デモシードを流した直後の DB に
 * 対して 1 回だけ流すこと（2 回目は未分類の行がもう無い）:
 *   SHOT_DB_CONTAINER=ckk-shots-db-wip SHOT_DB_PORT=55477 pnpm docs:seed
 *   APP_URL=http://localhost:3177 SHOT_DIR=/tmp/wip pnpm exec tsx e2e-wip-stock.ts
 */

import { mkdirSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";

const APP_URL = process.env.APP_URL ?? "http://localhost:3100";
const USERNAME = process.env.SHOT_ADMIN_USERNAME ?? "demo1";
const PASSWORD = process.env.SHOT_ADMIN_PASSWORD ?? "demo2026";
/** 画面の写しを残す先（省略時は残さない）。 */
const SHOT_DIR = process.env.SHOT_DIR;

let failed = 0;
function check(name: string, ok: boolean, actual?: unknown): void {
  if (!ok) failed += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${actual === undefined ? "" : `  → ${JSON.stringify(actual)}`}`,
  );
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOT_DIR) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

const wipRows = (page: Page) => page.locator("tr[data-wip-row]");
const settle = (page: Page) => page.waitForTimeout(500);

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    locale: "ja-JP",
    viewport: { width: 1440, height: 900 },
  });
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "開発用アカウントでログイン" }).click();
  await page.getByLabel("ユーザー名").fill(USERNAME);
  await page.getByLabel("パスワード", { exact: false }).first().fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL(`${APP_URL}/`, { timeout: 30_000 });

  // ── 1. 仕掛品タブ ─────────────────────────────────────────────────────
  await page.goto(`${APP_URL}/inventory?tab=wip`, { waitUntil: "networkidle" });
  await wipRows(page).first().waitFor();
  const initial = await wipRows(page).count();
  check("仕掛品タブに行が出る", initial >= 3, initial);
  const body = () => page.locator("table:visible").first().innerText();
  check("材種 / 径 / 長 の見出し行", (await body()).includes("φ6 × 60"));
  check(
    "加工状態が工程名の並びで出る",
    /切断[\s\S]*›[\s\S]*センタレス[\s\S]*›[\s\S]*段加工/.test(await body()),
  );
  check("未加工の状態が出る", (await body()).includes("未加工"));
  check("未分類の行が出る", (await body()).includes("未分類"));
  check("発生工程が出る", /#9004\s*段加工/.test(await body()));
  check("経過日数が出る", /\d+ 日/.test(await body()));
  await shot(page, "01-wip-tab");

  // ── 2. 絞り込み（加工状態）────────────────────────────────────────────
  await page.getByRole("combobox", { name: "加工状態" }).click();
  await page.getByRole("option", { name: "未加工" }).click();
  await settle(page);
  check("加工状態で絞ると 1 行", (await wipRows(page).count()) === 1, {
    rows: await wipRows(page).count(),
    url: page.url(),
  });
  check("絞り込みが URL に載る", new URL(page.url()).searchParams.has("state"));
  await page.getByRole("button", { name: "リセット" }).click();
  await settle(page);
  check("リセットで戻る", (await wipRows(page).count()) === initial);

  // 目標製品で絞る
  await page.getByRole("combobox", { name: "目標製品" }).click();
  await page.getByRole("option", { name: /超硬ドリル/ }).click();
  await settle(page);
  check("目標製品で絞ると未分類の 1 行", (await wipRows(page).count()) === 1);
  await page.getByRole("button", { name: "リセット" }).click();
  await settle(page);

  // ── 3. 製品タブ: 仕掛品が出ない / 使える仕掛品 ────────────────────────
  await page.goto(`${APP_URL}/inventory`, { waitUntil: "networkidle" });
  const products = page.locator("table:visible").first();
  await products.waitFor();
  const productsText = await products.innerText();
  check("製品タブに半製品の印が無い", !productsText.includes("半製品"));
  check("製品タブに「使える仕掛品」の列", productsText.includes("使える仕掛品"));
  const usableLink = page
    .getByRole("link", { name: /に使える仕掛品 \d+ 本を仕掛品タブで見る/ })
    .first();
  const usableLabel = await usableLink.getAttribute("aria-label");
  const usableCount = Number(usableLabel?.match(/仕掛品 (\d+) 本/)?.[1] ?? 0);
  check("使える仕掛品の本数が出る", usableCount > 0, usableLabel);
  await shot(page, "02-products-tab");
  await usableLink.click();
  await page.waitForURL(/tab=wip/);
  await wipRows(page).first().waitFor();
  check("使える仕掛品から仕掛品タブへ絞り込んで飛ぶ", /for=\d+/.test(page.url()), page.url());
  const shownQty = await wipRows(page).evaluateAll((trs) =>
    trs.reduce(
      (s, tr) => s + Number(tr.querySelectorAll("td")[4]?.textContent ?? 0),
      0,
    ),
  );
  check("絞り込んだ行の利用可能数の合計 = リンクの本数", shownQty === usableCount, {
    shownQty,
    usableCount,
  });
  check(
    "絞り込みの説明が出る",
    await page.getByText(/に使える仕掛品$/).first().isVisible(),
  );
  await shot(page, "03-wip-usable-filter");
  await page.getByRole("button", { name: "絞り込みを外す" }).click();
  await settle(page);
  check("絞り込みを外すと全件", (await wipRows(page).count()) === initial);

  // ── 4. 加工状態に名前を付ける ─────────────────────────────────────────
  await page.getByRole("button", { name: "加工状態に名前を付ける" }).last().click();
  const nameDialog = page.getByRole("dialog");
  await nameDialog.getByLabel(/呼び名/).fill("段付きブランク");
  await nameDialog.getByRole("button", { name: "保存" }).click();
  await page.getByText("加工状態の名前を保存しました").waitFor();
  await page.locator("table:visible").getByText("段付きブランク").waitFor();
  check("付けた名前が一覧に出る", (await body()).includes("段付きブランク"));
  await shot(page, "04-state-named");

  // ── 5. 分類する ───────────────────────────────────────────────────────
  const totalBefore = await wipRows(page).evaluateAll((trs) =>
    trs.reduce(
      (s, tr) => s + Number(tr.querySelectorAll("td")[2]?.textContent ?? 0),
      0,
    ),
  );
  await page.getByRole("button", { name: "分類する" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("仕掛品を分類する").waitFor();
  await shot(page, "05-reclassify-modal");
  // 必須が欠けたまま確定すると不備が出る
  await dialog.getByLabel(/^径/).fill("");
  await dialog.getByRole("button", { name: "分類する" }).click();
  check(
    "径が空だと確定できない",
    await dialog.getByText("径は 0 より大きい数値を入力してください").isVisible(),
  );
  // 目標製品に要求素材が無い（デモの超硬ドリル）ので材種は空 — 選ぶ。
  await dialog.getByRole("combobox", { name: /^材種/ }).click();
  await page.getByRole("option", { name: /K10UF/ }).first().click();
  await dialog.getByLabel(/^径/).fill("4");
  await dialog.getByLabel(/^長/).fill("50");
  await dialog.getByLabel(/分類する数量/).fill("3");
  await dialog.getByRole("combobox", { name: "済んだ工程を追加" }).click();
  await page.getByRole("option", { name: "切断", exact: true }).click();
  await dialog.getByRole("button", { name: "分類する" }).click();
  check(
    "形を変える工程が済んでいれば仕上がり寸法が必須",
    await dialog.getByText("仕上がり径を入力してください").isVisible(),
  );
  await dialog.getByLabel(/仕上がり径/).fill("4");
  await dialog.getByLabel(/仕上がり長/).fill("50");
  await shot(page, "06-reclassify-filled");
  await dialog.getByRole("button", { name: "分類する" }).click();
  await page.getByText("仕掛品を分類しました").waitFor({ timeout: 15_000 });
  const movement = await page.getByText(/入出庫伝票 \S+/).first().innerText();
  check("入出庫伝票の番号が返る", /MOV|入出庫伝票 \S+/.test(movement), movement);
  await page.getByText("φ4 × 50").first().waitFor();
  const after = await body();
  check("分類先の仕掛ブランクが出る", after.includes("φ4 × 50"));
  check("未分類が 1 本残る（4 本のうち 3 本を分類）", after.includes("未分類"));
  const totalAfter = await wipRows(page).evaluateAll((trs) =>
    trs.reduce(
      (s, tr) => s + Number(tr.querySelectorAll("td")[2]?.textContent ?? 0),
      0,
    ),
  );
  check("数量の合計は変わらない", totalAfter === totalBefore, {
    totalBefore,
    totalAfter,
  });
  await shot(page, "07-after-reclassify");

  // ── 6. 工程内タブ / ロケーション ──────────────────────────────────────
  await page.goto(`${APP_URL}/inventory?tab=in-process`, {
    waitUntil: "networkidle",
  });
  check(
    "工程内タブが出る",
    await page.getByRole("tab", { name: "工程内" }).isVisible(),
  );
  await shot(page, "08-in-process");
  await page.goto(`${APP_URL}/inventory?tab=locations`, {
    waitUntil: "networkidle",
  });
  check(
    "ロケーションに仕掛品が出る",
    (await page.locator("main").innerText()).includes("φ6 × 60"),
  );
  await shot(page, "09-locations");

  // ── 7. モバイル ───────────────────────────────────────────────────────
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${APP_URL}/inventory?tab=wip`, { waitUntil: "networkidle" });
  await page.getByText("φ6 × 60").first().waitFor();
  check("モバイルは表ではなくカード", (await wipRows(page).count()) === 0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  check("モバイルで横にはみ出さない", overflow <= 1, overflow);
  await shot(page, "10-mobile");

  check("コンソールエラーなし", consoleErrors.length === 0, consoleErrors);

  await browser.close();
  console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
