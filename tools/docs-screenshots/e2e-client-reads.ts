/**
 * e2e-client-reads.ts — TanStack Query に載せた「クライアントが自分で取りに
 * 行く読み取り」の通し確認（lib/query-client.ts の冒頭が対象の一覧）。
 *
 *   - SearchSelect: 打つと候補が出る / 打鍵の追い越しで古い結果が残らない /
 *     一度引いた入力はキャッシュから即座に出る / **入力せず置いている間は
 *     取りに行かない**（親の描き直しで検索し続けない）/ 選べる
 *   - F4（詳細検索）: 開くと先頭が出る / 条件で絞れる / 行で選べる
 *   - ファイル管理: 一覧が出る / 管理者にアップロードが出る / 更新で取り直す
 *   - VersionSkewBanner: 起動時に版を 1 回だけ確認する
 *
 * 使い捨て DB + 本番ビルドに対して流す。DB には何も書かない:
 *   APP_URL=http://localhost:3172 pnpm exec tsx e2e-client-reads.ts
 */

import { chromium, type Page, type Request } from "@playwright/test";

const APP_URL = process.env.APP_URL ?? "http://localhost:3100";
const USERNAME = process.env.SHOT_ADMIN_USERNAME ?? "demo1";
const PASSWORD = process.env.SHOT_ADMIN_PASSWORD ?? "demo2026";

let failed = 0;
function check(name: string, ok: boolean, actual?: unknown): void {
  if (!ok) failed += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${actual === undefined ? "" : `  → ${JSON.stringify(actual)}`}`,
  );
}

/** Server Action の呼び出し（POST + Next-Action ヘッダ）だけを数える。 */
function countActions(page: Page): { n: number; stop: () => void } {
  const counter = { n: 0, stop: () => {} };
  const onRequest = (r: Request) => {
    if (r.method() === "POST" && r.headers()["next-action"]) counter.n += 1;
  };
  page.on("request", onRequest);
  counter.stop = () => page.off("request", onRequest);
  return counter;
}

const options = (page: Page) => page.getByRole("option");

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ locale: "ja-JP" });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  // 版の確認は「どの画面から出たか」で数える（前の画面の分を混ぜない）。
  const versionChecks: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/app-version")) {
      versionChecks.push(new URL(r.headers().referer ?? APP_URL).pathname);
    }
  });

  await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "開発用アカウントでログイン" }).click();
  await page.getByLabel("ユーザー名").fill(USERNAME);
  await page.getByLabel("パスワード", { exact: false }).first().fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL(`${APP_URL}/`, { timeout: 30_000 });

  // ── 1. SearchSelect（価格表 新規の顧客欄）──────────────────────────────
  await page.goto(`${APP_URL}/sales/price-lists/new`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(800);
  const here = versionChecks.filter((p) => p === "/sales/price-lists/new");
  check("版の確認は起動時に 1 回だけ", here.length === 1, versionChecks);

  // 何も触らずに置いておく — 検索し続けていないこと。
  const idle = countActions(page);
  await page.waitForTimeout(2000);
  idle.stop();
  check("置いている間は検索しに行かない", idle.n === 0, idle.n);

  // F4（詳細検索）ボタンの付いた最初の欄 = 顧客。
  const f4Button = page.getByRole("button", { name: "詳細検索" }).first();
  const customer = f4Button.locator("xpath=ancestor::*[contains(@class,'mantine-Select-root') or contains(@class,'mantine-InputWrapper-root')][1]//input[not(@type='hidden')]").first();
  await customer.click();
  await page.waitForTimeout(600);
  const initial = await options(page).allInnerTexts();
  check("開くと先頭の候補が出る", initial.length > 0, initial.length);

  // 基準になる結果を先に取る（検索はあいまい一致なので、文字列では判定しない）。
  const first = (initial[0] ?? "").trim();
  const head = first.slice(0, 1);
  const two = first.slice(0, 2);
  const same = (a: string[], b: string[]) => a.join("\n") === b.join("\n");
  await customer.pressSequentially(head);
  await page.waitForTimeout(900);
  const listHead = await options(page).allInnerTexts();
  await customer.pressSequentially(two.slice(1));
  await page.waitForTimeout(900);
  const listTwo = await options(page).allInnerTexts();
  check("打つと候補が変わる", listTwo.length > 0 && !same(initial, listTwo), listTwo.length);

  // 追い越し: 1 文字目の応答を遅らせ、打ち切った入力の結果だけが残ること。
  await page.reload({ waitUntil: "networkidle" }); // キャッシュを空にする
  await customer.click();
  await page.waitForTimeout(600);
  let delayed = false;
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (!delayed && req.method() === "POST" && req.headers()["next-action"]) {
      delayed = true; // 最初の 1 本（= 1 文字目の検索）だけ遅らせる
      await new Promise((r) => setTimeout(r, 1500));
    }
    await route.continue();
  });
  await customer.pressSequentially(head);
  await page.waitForTimeout(350); // デバウンスを越えて 1 本目を出させる
  await customer.pressSequentially(two.slice(1));
  await page.waitForTimeout(3000);
  await page.unroute("**/*");
  const raced = await options(page).allInnerTexts();
  check("遅れて届いた古い結果で上書きされない", delayed && same(raced, listTwo), {
    typed: two,
    got: raced.slice(0, 2),
    want: listTwo.slice(0, 2),
  });

  // キャッシュ: 1 文字へ戻すと、応答を待たずに候補が出る（取り直しは裏で走る）。
  let held = 0;
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"]) {
      held += 1;
      await new Promise((r) => setTimeout(r, 1500));
    }
    await route.continue();
  });
  await customer.press("Backspace");
  await page.waitForTimeout(700); // デバウンス後・応答（1.5 秒後）より前
  const instant = await options(page).allInnerTexts();
  check("一度引いた入力はキャッシュから即座に出る", same(instant, listHead), {
    typed: head,
    got: instant.slice(0, 2),
    want: listHead.slice(0, 2),
  });
  await page.waitForTimeout(1800);
  await page.unroute("**/*");
  check("キャッシュを出しつつ取り直してもいる", held >= 1, held);

  await options(page).first().click();
  const picked = await customer.inputValue();
  check("候補を選べる", picked.length > 0, picked);

  // ── 2. F4（詳細検索）──────────────────────────────────────────────────
  await f4Button.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await page.waitForTimeout(1200);
  const rows = dialog.locator("tbody tr");
  const allRows = await rows.count();
  check("F4: 開くと先頭の一覧が出る", allRows > 1, allRows);
  const firstCell = (await rows.first().locator("td").nth(1).innerText()).trim();
  const probe = firstCell.slice(0, 2);
  const textFilter = dialog.locator("form input:not([type=hidden])").nth(1);
  await textFilter.fill(probe);
  const f4Actions = countActions(page);
  await page.waitForTimeout(700);
  check("F4: 打っただけでは検索しない", f4Actions.n === 0, f4Actions.n);
  await dialog.getByRole("button", { name: "検索", exact: true }).click();
  await page.waitForTimeout(1200);
  check("F4: 検索ボタンで引く", f4Actions.n === 1, f4Actions.n);
  await dialog.getByRole("button", { name: "検索", exact: true }).click();
  await page.waitForTimeout(1200);
  f4Actions.stop();
  check("F4: 同じ条件でもう一度押すと取り直す", f4Actions.n === 2, f4Actions.n);
  const filtered = await rows.count();
  check("F4: 条件で絞れる", filtered >= 1 && filtered <= allRows, { before: allRows, after: filtered });
  await rows.first().click();
  await dialog.waitFor({ state: "hidden" });
  check("F4: 行で選ぶと欄に入る", (await customer.inputValue()).length > 0, await customer.inputValue());

  // ── 3. ファイル管理（SY06）────────────────────────────────────────────
  let listings = 0;
  page.on("request", (r) => {
    if (r.method() === "GET" && new URL(r.url()).pathname === "/api/admin/files") listings += 1;
  });
  await page.goto(`${APP_URL}/settings/files`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  check("ファイル管理: 一覧を 1 回だけ読む", listings === 1, listings);
  check(
    "ファイル管理: 管理者にアップロードが出る",
    (await page.getByRole("button", { name: "アップロード" }).count()) > 0,
  );
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await page.waitForTimeout(1000);
  check("ファイル管理: 更新で取り直す", listings === 2, listings);

  check("画面エラーなし", pageErrors.length === 0, pageErrors.slice(0, 3));

  await browser.close();
  console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
