/**
 * 工程マスタ (MS08) の「使える指示書種別」が**実際に効く**ことを確かめる。
 * 単体試験は純関数しか見ないので、マスタを変えたら指示書ビルダーの候補が
 * 変わる、という一連はここでしか確かめられない。
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";

const APP = process.env.APP_URL ?? "http://localhost:3126";
const DB = process.env.SHOT_DB_CONTAINER ?? "ckk-wotype-db";
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
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const sql = (q: string): string =>
  execFileSync("docker", ["exec", "-i", DB, "psql", "-U", "postgres", "-d", process.env.DB_NAME ?? "ckk", "-t", "-A", "-c", q])
    .toString().trim();

async function login(page: Page): Promise<void> {
  await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "開発用アカウントでログイン" }).click();
  await page.getByLabel("ユーザー名").fill("demo1");
  await page.getByLabel("パスワード", { exact: false }).first().fill("demo2026");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

/**
 * 再研磨の指示書ビルダーが**候補のチェックボックスとして**その工程を出すか。
 * 本文の文字列で見ると、工程リストのバッジや別の欄の語まで拾ってしまう。
 */
async function offeredOnRegrindBuilder(
  page: Page,
  stepName: string,
  shotName: string,
): Promise<boolean> {
  // URL の `?type=REGRIND` はもう効かない（a947c649「指示書の種別を注文明細から
  // 決める」— URL の type は 在庫分 / 製造分 の希望だけを伝える）。注文明細を
  // 連れていないビルダーでは種別を画面で選べるので、そこで「再研磨」を選ぶ。
  await page.goto(`${APP}/production/work-orders/new`, {
    waitUntil: "networkidle",
  });
  await page.getByText("再研磨", { exact: true }).first().click();
  // 再研磨に切り替わると、再研磨でしか使えない工程（製品受入）が候補に出る。
  await page
    .locator("label")
    .filter({ hasText: "製品受入（再研磨）" })
    .first()
    .waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await shot(page, shotName);
  // 候補のラベルは「工程名 + バッジ（同期 / 社内 / 要: …）」なので、
  // 名前そのものではなく**先頭の語**で照合する（exact 一致は必ず外れる）。
  const labels = await page.locator("label").allInnerTexts();
  return labels.some((t) => t.trim().split(/\s+/)[0] === stepName);
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // **毎回まっさらから始める。** この試験はマスタを書き換えるので、前回の値が
  // 残っていると 2 回目から「変更前」の検査が本題と関係なく落ちる
  // （e2e-regrind と同じ流儀 — 実際に一度踏んだ）。
  sql(
    `UPDATE app.process_step_catalog
        SET allowed_work_order_types = ARRAY['MANUFACTURE']::app."WORK_ORDER_TYPE"[]
      WHERE code = 'CYLINDER_MACHINING'`,
  );

  await login(page);

  const cylId = sql("SELECT id FROM app.process_step_catalog WHERE code='CYLINDER_MACHINING'");
  const issueId = sql("SELECT id FROM app.process_step_catalog WHERE code='PRODUCT_ISSUE'");

  // ── A. 一覧に列と絞り込みがある ──────────────────────────────────────────
  await page.goto(`${APP}/master/process-steps?workOrderType=REGRIND`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(800);
  // 行そのものを数える（本文の文字列だと列見出しや絞り込みの選択肢まで拾う）。
  // 先頭セルは一括選択のチェックボックスなので、行ごと読んでコードを拾う。
  const rowTexts = await page.locator("table tbody tr").allInnerTexts();
  const codes = rowTexts.map((t) => (t.match(/[A-Z][A-Z0-9_]{3,}/) ?? [""])[0]);
  check(
    "A1 指示書種別で絞り込むと再研磨で使える工程だけが並ぶ",
    codes.includes("REGRIND_OD") &&
      codes.includes("REGRIND_RECEIPT") &&
      !codes.includes("CYLINDER_MACHINING") &&
      !codes.includes("PRODUCT_ISSUE"),
    `${codes.length} 行: ${codes.slice(0, 8).join(", ")}`,
  );
  await shot(page, "01-list-filtered-regrind");

  // ── B. 編集画面に 3 つのチェックボックスが出る ──────────────────────────
  await page.goto(`${APP}/master/process-steps/${cylId}/edit`, { waitUntil: "networkidle" });
  const cylBody = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const boxes = page.getByRole("checkbox", { name: "再研磨", exact: true });
  check(
    "B1 使える指示書種別の欄が出る（再研磨は未チェック）",
    cylBody.includes("使える指示書種別") && !(await boxes.first().isChecked()),
    cylBody.slice(cylBody.indexOf("使える指示書種別"), cylBody.indexOf("使える指示書種別") + 90),
  );
  await shot(page, "02-edit-cylinder-machining");

  // ── C. 開始工程は選ばせない ──────────────────────────────────────────────
  await page.goto(`${APP}/master/process-steps/${issueId}/edit`, { waitUntil: "networkidle" });
  const issueBody = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const issueBox = page.getByRole("checkbox", { name: "製造分", exact: true }).first();
  check(
    "C1 製品出し（在庫）は開始工程なので種別を変えられない",
    (await issueBox.isDisabled()) && issueBody.includes("開始工程"),
    issueBody.slice(issueBody.indexOf("使える指示書種別"), issueBody.indexOf("使える指示書種別") + 120),
  );
  await shot(page, "03-edit-start-step-locked");

  // ── D. 変える前: 再研磨の指示書に円筒加工は出ない ───────────────────────
  check(
    "D1 変更前は再研磨の候補に円筒加工が無い",
    !(await offeredOnRegrindBuilder(page, "円筒加工", "04-regrind-builder-before")),
  );

  // ── E. マスタで再研磨を許す → 候補に出る ────────────────────────────────
  await page.goto(`${APP}/master/process-steps/${cylId}/edit`, { waitUntil: "networkidle" });
  await page.getByRole("checkbox", { name: "再研磨", exact: true }).first().check();
  await page.getByRole("button", { name: "保存" }).click();
  await page
    .waitForURL((u) => !u.pathname.endsWith("/edit"), { timeout: 30_000 })
    .catch(async () => {
      const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      console.log("  [save did not navigate] ", body.slice(0, 400));
    });
  const saved = sql(`SELECT array_to_string(allowed_work_order_types,',') FROM app.process_step_catalog WHERE id=${cylId}`);
  check("E1 保存できて行に入る", saved.includes("REGRIND") && saved.includes("MANUFACTURE"), saved);
  check(
    "E2 設定を変えると再研磨の候補に円筒加工が出る",
    await offeredOnRegrindBuilder(page, "円筒加工", "05-regrind-builder-after"),
  );

  // ── F. 空にはできない ────────────────────────────────────────────────────
  await page.goto(`${APP}/master/process-steps/${cylId}/edit`, { waitUntil: "networkidle" });
  for (const n of ["製造分", "再研磨"]) {
    const b = page.getByRole("checkbox", { name: n, exact: true }).first();
    if (await b.isChecked()) await b.uncheck();
  }
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForTimeout(1200);
  await shot(page, "06-empty-types-rejected");
  const stillEditing = new URL(page.url()).pathname.endsWith("/edit");
  const afterEmpty = sql(`SELECT array_to_string(allowed_work_order_types,',') FROM app.process_step_catalog WHERE id=${cylId}`);
  check(
    "F1 1 つも選ばずに保存できない（行も変わらない）",
    stillEditing && afterEmpty.includes("REGRIND"),
    `url=${new URL(page.url()).pathname} row=${afterEmpty}`,
  );

  check("G 画面に未捕捉のエラーが無い", errors.length === 0, errors.slice(0, 2).join(" | "));
  await browser.close();
  console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
