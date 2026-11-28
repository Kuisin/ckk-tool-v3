/**
 * e2e-ship-shortage.ts — 「在庫が足りないまま出荷する」を、使い捨て DB +
 * 本番ビルドに対して**実際に操作して**確かめる。
 *
 * 見ているもの:
 *   A. 在庫が足りないとき
 *      A1. 出荷の確認を押すと、**出荷せずに**「在庫が足りません」が出る
 *      A2. 足りない品目のコードと不足数が出ている
 *      A3. 「在庫を見る」が 在庫・所要量 (ST03) を品目つきで指している
 *      A4. 「やめる」で閉じると **出荷されていない**（状態は確定のまま）
 *      A5. もう一度出して「このまま出荷する」を押すと出荷される
 *      A6. 出荷後は注意（在庫が足りないまま出荷しました）が出たままになる
 *      A7. 台帳: バケットが -4、伝票の明細に「在庫不足のまま出庫」が 1 行
 *   B. 在庫が足りているとき
 *      B1. 確認を押すと**ダイアログは出ず**そのまま出荷される
 *      B2. 台帳: 出した分だけ減り、「在庫不足のまま出庫」の行は増えない
 *   C. 画面が壊れていない（pageerror / console error）
 *
 * 落ちたときに原因を追えるよう、check() には**実測値**を添えること。
 *
 * 使い方（smoke-flows.ts と同じ流儀。CI では動かさない）:
 *   1. 使い捨て DB を起こしてデモシードを流す
 *      （SHOT_DB_CONTAINER=ckk-ship-db SHOT_DB_PORT=55443 pnpm docs:seed）
 *   2. docker exec -i ckk-ship-db psql -U postgres -d ckk -f - < e2e-ship-shortage-fixtures.sql
 *   3. nextjs-web をその DB 向けに本番ビルドして :3105 で起動
 *   4. pnpm exec tsx e2e-ship-shortage.ts
 *
 * **2 は必須** — デモシードには在庫の足りない確定済み出荷書が無い。
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";

const APP = process.env.APP_URL ?? "http://localhost:3105";
const DB_CONTAINER = process.env.SHOT_DB_CONTAINER ?? "ckk-ship-db";
/**
 * 出荷書は**旧番号**で指す。画面に出る番号（`DOR-2026-000NN`）は DB が INSERT 時に
 * 振り、流した順で変わる。fixtures / デモシードは旧番号（legacy_number）を
 * 付けて入れるので:
 *   URL … 旧番号のままでよい（詳細ページが正規の URL `CKK~DOR-…` へ送る）
 *   SQL … legacy_number か app.to_doc_ref('delivery_orders', 旧番号) で引く
 */
/** 在庫の足りない出荷書（fixtures が作る）。品目 9003 × ロット 9999 × 4 本。 */
const SHORT_DOR = process.env.SHORT_DOR ?? "DOR-209901-00001";
/** 在庫が足りる出荷書（デモシード）。品目 9001 × ロット無し × 20 本。 */
const OK_DOR = process.env.OK_DOR ?? "DOR-202607-00002";

const results: string[] = [];
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
const pageErrors: string[] = [];

function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failed++;
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`;
  results.push(line);
  console.log(line);
}

/** DB へ直接聞く（画面が言っていることと台帳が一致しているかの裏取り）。 */
function sql(query: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", process.env.DB_NAME ?? "ckk", "-tAc", query],
    { encoding: "utf8" },
  ).trim();
}

async function login(page: Page): Promise<void> {
  await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "開発用アカウントでログイン" }).click();
  await page.getByLabel("ユーザー名").fill("demo1");
  await page.getByLabel("パスワード", { exact: false }).first().fill("demo2026");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
}

/** 出荷書を開いて ⋯ →「出荷」→ 確認ダイアログの「出荷する」まで進める。 */
async function pressShip(page: Page, docNumber: string): Promise<void> {
  await page.goto(`${APP}/shipping/delivery-orders/${docNumber}`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "操作メニュー" }).click();
  await page.getByRole("menuitem", { name: "出荷" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "出荷する" }).click();
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(`${page.url()} :: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/avatars|favicon|\/api\/pdf\//.test(m.text())) {
      pageErrors.push(`${page.url()} :: console ${m.text()}`);
    }
  });

  await login(page);

  // ── A. 在庫が足りないとき ────────────────────────────────────────────────
  await pressShip(page, SHORT_DOR);

  const shortageDialog = page.getByRole("dialog", { name: "在庫が足りません" });
  const appeared = await shortageDialog
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  check("A1 在庫が足りないと確認ダイアログが出る", appeared);
  await shot(page, "01-shortage-dialog");

  if (appeared) {
    const body = (await shortageDialog.innerText()).replace(/\s+/g, " ");
    check(
      "A2 足りない品目と不足数が出ている",
      body.includes("PRD-202607-0003") && /\b4\b/.test(body),
      body.slice(0, 160),
    );

    const href = await shortageDialog
      .getByRole("link", { name: /在庫を見る/ })
      .getAttribute("href");
    check(
      "A3 「在庫を見る」が ST03 を品目つきで指している",
      href != null &&
        href.startsWith("/inventory/requirements?") &&
        href.includes("item=9003"),
      `href=${href}`,
    );

    // A3b: 文字とアイコンが 1 行に収まっている（アイコンだけ次の行へ落ちていた）
    const link = shortageDialog.getByRole("link", { name: /在庫を見る/ });
    const lines = await link.evaluate((el) => {
      const icon = el.querySelector("svg");
      const box = el.getBoundingClientRect();
      const ib = icon?.getBoundingClientRect();
      return { height: Math.round(box.height), iconTop: ib ? Math.round(ib.top - box.top) : -1 };
    });
    check(
      "A3b 「在庫を見る」のアイコンが文字と同じ行にある（折り返さない）",
      lines.height <= 30 && lines.iconTop >= 0 && lines.iconTop < 16,
      JSON.stringify(lines),
    );

    // A4: やめる → 出荷されていない
    await page.getByRole("button", { name: "キャンセル" }).click();
    await shortageDialog.waitFor({ state: "hidden", timeout: 10_000 });
    await shot(page, "02-cancelled-still-confirmed");
    const statusAfterCancel = sql(
      `SELECT status FROM app.delivery_orders WHERE legacy_number='${SHORT_DOR}'`,
    );
    check(
      "A4 やめると出荷されない",
      statusAfterCancel === "CONFIRMED",
      `status=${statusAfterCancel}`,
    );

    // A5: もう一度出して「このまま出荷する」
    await pressShip(page, SHORT_DOR);
    await shortageDialog.waitFor({ state: "visible", timeout: 15_000 });
    await shortageDialog.getByRole("button", { name: "このまま出荷する" }).click();

    const shipped = await page
      .getByText("出荷しました", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    check("A5 このまま出荷すると出荷される", shipped);

    const warned = await page
      .getByText("在庫が足りないまま出荷しました", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    check("A6 出荷後に注意が出る", warned);
    await shot(page, "03-shipped-with-shortage-warning");

    // A7: 台帳の裏取り
    const bucket = sql(
      `SELECT COALESCE(sum(quantity),0) FROM app.item_inventory WHERE item_id=9003 AND lot_number=9999`,
    );
    check("A7a バケットがマイナスになっている", bucket === "-4.000", `quantity=${bucket}`);

    const shortLines = sql(
      `SELECT count(*) FROM app.inventory_transactions t
         JOIN app.inventory_movements m ON m.id = t.movement_id
        WHERE m.source_id=app.to_doc_ref('delivery_orders','${SHORT_DOR}') AND t.notes LIKE '%shippedWithoutStock%'`,
    );
    check("A7b 伝票に「在庫不足のまま出庫」の行がある", shortLines === "1", `rows=${shortLines}`);
  }

  // ── B. 在庫が足りているとき ──────────────────────────────────────────────
  const beforeOk = sql(
    `SELECT COALESCE(sum(quantity),0) FROM app.item_inventory
      WHERE item_id=9001 AND custody_bp_id IS NULL AND wip_state_id IS NULL`,
  );
  await page.goto(`${APP}/shipping/delivery-orders/${OK_DOR}`, {
    waitUntil: "networkidle",
  });
  await shot(page, "04-enough-stock-before-ship");
  await pressShip(page, OK_DOR);
  const dialogB = await page
    .getByRole("dialog", { name: "在庫が足りません" })
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  check("B1 在庫が足りればダイアログは出ない", !dialogB);

  // 出荷できたかは**台帳と状態で見る**。通知は A の分（自動で閉じない注意）が
  // 残っていて取り違えるので、UI の文字では判定しない。
  await page
    .getByText("出荷しました", { exact: false })
    .last()
    .waitFor({ state: "visible", timeout: 20_000 })
    .catch(() => undefined);
  const okStatus = sql(
    `SELECT status FROM app.delivery_orders WHERE legacy_number='${OK_DOR}'`,
  );
  check("B1b そのまま出荷される", okStatus === "SHIPPED", `status=${okStatus}`);
  await shot(page, "05-enough-stock-shipped");

  const afterOk = sql(
    `SELECT COALESCE(sum(quantity),0) FROM app.item_inventory
      WHERE item_id=9001 AND custody_bp_id IS NULL AND wip_state_id IS NULL`,
  );
  check(
    "B2a 出した分だけ在庫が減る",
    Number(beforeOk) - Number(afterOk) === 20,
    `${beforeOk} → ${afterOk}`,
  );
  const okShortLines = sql(
    `SELECT count(*) FROM app.inventory_transactions t
       JOIN app.inventory_movements m ON m.id = t.movement_id
      WHERE m.source_id=app.to_doc_ref('delivery_orders','${OK_DOR}') AND t.notes LIKE '%shippedWithoutStock%'`,
  );
  check(
    "B2b 足りているときは「在庫不足のまま出庫」の行が無い",
    okShortLines === "0",
    `rows=${okShortLines}`,
  );

  check("C 画面に未捕捉のエラーが無い", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

  await browser.close();
  console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`} (${results.length} checks)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
