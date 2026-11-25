/**
 * e2e-wip-draw.ts — 在庫の仕掛品から指示書を始める（仕掛品の再設計 PR 5）の通し確認。
 *
 * 単体試験では見えないものを実画面と台帳で見る:
 *   A. 指示書ビルダーの「使える仕掛品」が ちょうど / 長い / 太い の 3 区分に
 *      分かれて出る。加工状態が合わないものは畳まれている
 *   B. **別の製品を目標にした仕掛品**を選ぶと、済んでいる工程が灰色になり、
 *      保存した指示書は半製品出しから始まる（素材なし・工程リストの版は増えない）
 *   C. 指示書詳細に「開始状態」と投入する仕掛品が出る。承認前は未予約
 *   D. 承認すると選んだバケットが予約され、仕掛品タブの利用可能数が減る
 *   E. 全工程を完了すると、選んだバケットから落ちる（RELEASE + OUT）。
 *      目標製品が違うバケットから落ち、完成品はこの指示書の製品で入る
 *   F. 加工状態が合わない仕掛品は理由が無いと保存できない／理由は監査ログに残る
 *   G. 承認後にキャンセルすると予約が解放される
 *   H. 共有端末の指示書スキャンに開始状態と飛ばした工程が出る（KIOSK_URL を
 *      渡したときだけ）
 *   I. モバイル幅で候補がカードになり、横にはみ出さない
 *
 * **使い捨て DB を書き換える。** デモシードを流した DB に対して流すこと
 * （fixtures は毎回流し直すので、何度流しても同じところから始まる）:
 *
 *   1. SHOT_DB_CONTAINER=ckk-wipdraw-db SHOT_DB_PORT=<空きポート> pnpm docs:seed
 *   2. アプリを起動（APP_URL）。共有端末も見るなら KIOSK_URL も
 *   3. DB_CONTAINER=ckk-wipdraw-db APP_URL=http://localhost:<port> \
 *        SHOT_DIR=/tmp/wip-draw pnpm exec tsx e2e-wip-draw.ts
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const KIOSK = process.env.KIOSK_URL;
const DB_CONTAINER = process.env.DB_CONTAINER ?? "ckk-wipdraw-db";
/** 画面の写しを残す先（省略時は残さない）。 */
const SHOT_DIR = process.env.SHOT_DIR;

/** 指示書をつくる製品（fixtures）。仕掛品の目標製品は**これではない**。 */
const PRODUCT = 9201;
/** ちょうど: φ6×60 / [切断, センタレス, 全長合わせ] / 5 本 / 目標製品 9001。 */
const BUCKET_EXACT = "dc0f0000-0000-4000-8000-000000000001";
/** その他: φ6×60 / [切断, センタレス, 段加工]（全長合わせが抜けている）/ 3 本。 */
const BUCKET_OTHER = "dc050000-0000-4000-8000-000000000006";

let failed = 0;
function check(name: string, ok: boolean, actual?: unknown): void {
  if (!ok) failed += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${actual === undefined ? "" : `  → ${typeof actual === "string" ? actual : JSON.stringify(actual)}`}`,
  );
}

function psql(args: string[], input?: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", process.env.DB_NAME ?? "ckk", ...args],
    { input, encoding: "utf8" },
  ).trim();
}

/** fixtures を流し直す（冪等 — 前の実行が作った指示書・予約も消す）。 */
function resetFixtures(): void {
  psql(
    ["-v", "ON_ERROR_STOP=1", "-q", "-f", "-"],
    readFileSync(
      join(import.meta.dirname, "e2e-wip-draw-fixtures.sql"),
      "utf8",
    ),
  );
}

/** DB へ直接聞く（画面が言っていることと台帳が一致しているかの裏取り）。 */
const sql = (query: string): string => psql(["-tAc", query]);

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOT_DIR) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

async function login(page: Page): Promise<void> {
  await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "開発用アカウントでログイン" })
    .click();
  await page.getByLabel("ユーザー名").fill("demo1");
  await page
    .getByLabel("パスワード", { exact: false })
    .first()
    .fill("demo2026");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
}

/** 在庫向けの指示書ビルダーを開き、製品 9201 を選んで候補が出るまで待つ。 */
async function openBuilder(page: Page): Promise<void> {
  await page.goto(`${APP}/production/work-orders/new`, {
    waitUntil: "networkidle",
  });
  await page.getByText("在庫向け（注文明細なし）", { exact: true }).click();
  const product = page.getByPlaceholder("製品コード・名称で検索");
  await product.click();
  await product.fill("2枚刃 φ6×60");
  await page.getByRole("option", { name: /超硬ドリル 2枚刃 φ6×60/ }).first().click();
  // 工程リスト（準備 + 製造）が入り、候補が引かれるまで
  await page.locator("[data-wip-group]").first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
}

const row = (page: Page, inventoryId: string) =>
  page.locator(`[data-wip-row="${inventoryId}"]`);

const bucket = (inventoryId: string): string =>
  sql(
    `SELECT quantity::int||'/'||reserved_quantity::int FROM app.item_inventory WHERE id='${inventoryId}'`,
  );

/**
 * 保存後に飛ぶ指示書の詳細。URL の id はロット番号（通し連番）か書類番号で、
 * 書類番号は DB が振る — URL からは読まず DB から引き直す。
 */
const DETAIL_URL = (u: URL): boolean =>
  /\/production\/work-orders\/[^/]+$/.test(u.pathname) &&
  !u.pathname.endsWith("/new");

/** 書類番号（表示用。DB が振る）。 */
const docNumberOf = (woNumber: number): string =>
  sql(
    `SELECT coalesce(doc_number,'') FROM app.work_orders WHERE work_order_number = ${woNumber}`,
  );

const latestWo = (): number =>
  Number(
    sql(
      `SELECT coalesce(max(work_order_number),0) FROM app.work_orders WHERE product_item_id=${PRODUCT}`,
    ),
  );

const stepCodes = (woNumber: number): string =>
  sql(
    `SELECT string_agg(c.code, ',' ORDER BY s.sort_order)
       FROM app.work_order_steps s
       JOIN app.process_step_catalog c ON c.id = s.process_step_id
       JOIN app.work_orders w ON w.id = s.work_order_id
      WHERE w.work_order_number = ${woNumber}`,
  );

/**
 * 承認依頼に要る作業計画（社内工程ごとに 日付 + 作業場所）を入れる。計画そのものは
 * この試験の対象ではないので、画面を通さず直接入れる。
 */
function planAllSteps(woNumber: number): void {
  sql(
    `INSERT INTO app.work_order_step_plans (work_order_step_id, planned_date, work_location_id)
     SELECT s.id, current_date, (SELECT min(id) FROM app.work_locations)
       FROM app.work_order_steps s JOIN app.work_orders w ON w.id = s.work_order_id
      WHERE w.work_order_number = ${woNumber}`,
  );
}

/** 承認依頼 → 段数ぶん承認（demo1 は fixtures で承認グループに入っている）。 */
async function approve(page: Page, woNumber: number): Promise<void> {
  const detail = `${APP}/production/work-orders/${woNumber}`;
  await page.goto(detail, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "承認依頼", exact: true }).click();
  await page.waitForTimeout(1500);
  for (let i = 0; i < 4; i += 1) {
    await page.goto(detail, { waitUntil: "networkidle" });
    const btn = page.getByRole("button", { name: "承認", exact: true });
    if (!(await btn.isVisible().catch(() => false))) break;
    await btn.click();
    await page.waitForTimeout(1500);
  }
}

/** 1 工程を開始 → 完了する（数量は既定のまま = 全数良品）。 */
async function runStep(
  page: Page,
  woNumber: number,
  stepId: string,
): Promise<void> {
  await page.goto(`${APP}/production/work-orders/${woNumber}/steps/${stepId}`, {
    waitUntil: "networkidle",
  });
  const start = page.getByRole("button", { name: "工程開始" });
  if (await start.isVisible().catch(() => false)) {
    await start.click();
    await page.waitForTimeout(1200);
  }
  await page.getByRole("button", { name: "工程完了" }).click();
  await page
    .getByText("工程を完了しました", { exact: false })
    .first()
    .waitFor({ state: "visible", timeout: 20_000 })
    .catch(() => undefined);
  await page.waitForTimeout(800);
}

async function main(): Promise<void> {
  resetFixtures();
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

  await login(page);
  const routeVersionsBefore = sql(
    "SELECT count(*) FROM app.product_process_route_versions",
  );

  // ── A. 使える仕掛品が 3 区分に分かれて出る ────────────────────────────────
  await openBuilder(page);
  const groups = await page
    .locator("[data-wip-group]:visible")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-wip-group")));
  check(
    "A1 ちょうど / 長い / 太い が別々の区分で出る",
    groups.join(",") === "exact,longer,largerDiameter",
    groups,
  );
  const groupText = async (g: string) =>
    (await page.locator(`[data-wip-group="${g}"]`).innerText()).replace(
      /\s+/g,
      " ",
    );
  const exactText = await groupText("exact");
  check(
    "A2 ちょうど: 加工状態・仕上がり寸法・目標製品・ロット・利用可能数・飛ばす工程",
    exactText.includes("切断") &&
      exactText.includes("全長合わせ") &&
      exactText.includes("φ6 × 60") &&
      exactText.includes("超硬エンドミル") &&
      exactText.includes("#9004") &&
      exactText.includes("未加工"),
    exactText.slice(0, 260),
  );
  check(
    "A3 長い: φ6×80 の仕掛品（全長合わせは飛ばさない）",
    (await groupText("longer")).includes("φ6 × 80") &&
      !/飛ばす工程[\s\S]*全長合わせ/.test(
        (await row(page, "dc0f0000-0000-4000-8000-000000000002").innerText())
          .split("φ6 × 80")
          .pop() ?? "",
      ),
    (await groupText("longer")).slice(0, 200),
  );
  check(
    "A4 太い: φ8×60 の仕掛品",
    (await groupText("largerDiameter")).includes("φ8 × 60"),
    (await groupText("largerDiameter")).slice(0, 160),
  );
  check(
    "A5 加工状態が合わない仕掛品は畳まれている",
    (await page
      .getByRole("button", { name: /加工状態が合わない仕掛品（1 件）を表示/ })
      .isVisible()) && !(await row(page, BUCKET_OTHER).isVisible()),
  );
  await shot(page, "01-builder-candidates");

  // ── B. 別の製品を目標にした仕掛品を選ぶ ──────────────────────────────────
  await page.getByRole("textbox", { name: /予定数量/ }).fill("5");
  await row(page, BUCKET_EXACT).getByRole("checkbox").check();
  await page.waitForTimeout(600);
  const summary = (
    await page.locator("[data-wip-summary]").innerText()
  ).replace(/\s+/g, " ");
  check(
    "B1 選ぶと投入数と飛ばす工程が出る",
    summary.includes("投入 5 本 / 予定数量 5 本") &&
      ["切断", "センタレス", "全長合わせ"].every((n) => summary.includes(n)) &&
      summary.includes("半製品出しから始まります"),
    summary.slice(0, 240),
  );
  const skippedInList = await page
    .locator("[data-skipped]")
    .evaluateAll((els) =>
      els.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ")),
    );
  check(
    "B2 工程リストで済んでいる 3 工程が灰色（仕掛品で済み）",
    skippedInList.length === 3 &&
      skippedInList.every((t) => t.includes("仕掛品で済み")),
    skippedInList,
  );
  check(
    "B3 仕掛品から始めるので使用素材の欄が消える",
    (await page.getByPlaceholder("素材コード・名称で検索").count()) === 0,
  );
  check(
    "B4 加工状態の違う仕掛品は選べない（混ぜられない）",
    await row(page, "dc0f0000-0000-4000-8000-000000000002")
      .getByRole("checkbox")
      .isDisabled(),
  );
  await shot(page, "02-builder-selected");

  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForURL(DETAIL_URL, { timeout: 30_000 });
  const wo = latestWo();
  check("B5 指示書が作られる", wo > 0, `${docNumberOf(wo)} / ロット ${wo}`);
  check(
    "B6 工程は 半製品出し → 段加工 → 検査 → 承認（済んでいる 3 工程は載らない）",
    stepCodes(wo) ===
      "SEMI_FINISHED_ISSUE,STEP_MACHINING,STEP_INSPECTION,STEP_INSPECTION_APPROVAL",
    stepCodes(wo),
  );
  const woRow = sql(
    `SELECT coalesce(material_item_id::text,'-')||'|'||
            (SELECT array_to_string(step_ids, ',') FROM app.wip_states WHERE id = w.start_wip_state_id)||'|'||
            coalesce(wip_override_reason,'-')||'|'||
            (SELECT string_agg(inventory_id::text||':'||quantity, ',') FROM app.work_order_wip_draws d WHERE d.work_order_id = w.id)
       FROM app.work_orders w WHERE work_order_number = ${wo}`,
  );
  check(
    "B7 素材なし・開始状態 [切断, センタレス, 全長合わせ]・投入 5 本",
    woRow === `-|5,6,10|-|${BUCKET_EXACT}:5`,
    woRow,
  );
  check(
    "B8 製品の工程リストに新しい版ができていない（飛ばすのはこの指示書だけ）",
    sql("SELECT count(*) FROM app.product_process_route_versions") ===
      routeVersionsBefore,
    `${routeVersionsBefore} → ${sql("SELECT count(*) FROM app.product_process_route_versions")}`,
  );
  check("B9 保存しただけでは予約されない", bucket(BUCKET_EXACT) === "5/0", bucket(BUCKET_EXACT));

  // ── C. 指示書詳細の開始状態 ───────────────────────────────────────────────
  await page.goto(`${APP}/production/work-orders/${wo}`, {
    waitUntil: "networkidle",
  });
  const startWip = (
    await page.locator("[data-start-wip]").first().innerText()
  ).replace(/\s+/g, " ");
  check(
    "C1 開始状態・飛ばした工程・投入する仕掛品（目標製品つき）が出る",
    startWip.includes("開始状態") &&
      startWip.includes("飛ばした工程") &&
      startWip.includes("全長合わせ") &&
      startWip.includes("5 本") &&
      startWip.includes("目標製品: 超硬エンドミル") &&
      startWip.includes("未予約"),
    startWip.slice(0, 320),
  );
  await shot(page, "03-detail-draft");

  // 編集で開き直しても選択が戻り、保存しても工程・版・投入が変わらない
  await page.goto(`${APP}/production/work-orders/${wo}/edit`, {
    waitUntil: "networkidle",
  });
  await page.locator("[data-wip-summary]").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  check(
    "C2 編集で開くと選んだ仕掛品と飛ばす工程が戻る",
    (await row(page, BUCKET_EXACT).getByRole("checkbox").isChecked()) &&
      (await page.locator("[data-skipped]").count()) === 3,
    {
      checked: await row(page, BUCKET_EXACT).getByRole("checkbox").isChecked(),
      skipped: await page.locator("[data-skipped]").count(),
    },
  );
  await shot(page, "03b-edit");
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForURL(DETAIL_URL, { timeout: 30_000 });
  check(
    "C3 編集して保存しても工程・投入・工程リストの版が変わらない",
    stepCodes(wo) ===
      "SEMI_FINISHED_ISSUE,STEP_MACHINING,STEP_INSPECTION,STEP_INSPECTION_APPROVAL" &&
      sql(
        `SELECT string_agg(inventory_id::text||':'||quantity, ',') FROM app.work_order_wip_draws d
           JOIN app.work_orders w ON w.id = d.work_order_id WHERE w.work_order_number = ${wo}`,
      ) === `${BUCKET_EXACT}:5` &&
      sql("SELECT count(*) FROM app.product_process_route_versions") ===
        routeVersionsBefore,
    `${stepCodes(wo)} / 版 ${sql("SELECT count(*) FROM app.product_process_route_versions")}`,
  );

  // ── D. 承認 → 予約 ────────────────────────────────────────────────────────
  planAllSteps(wo);
  await approve(page, wo);
  const status = sql(
    `SELECT status||'/'||approval_status FROM app.work_orders WHERE work_order_number=${wo}`,
  );
  check("D1 承認済みになる", status === "APPROVED/APPROVED", status);
  check("D2 選んだバケットが 5 本予約される", bucket(BUCKET_EXACT) === "5/5", bucket(BUCKET_EXACT));
  const reservation = sql(
    `SELECT string_agg(r.inventory_type||':'||r.quantity::int||':'||r.status, ',')
       FROM app.inventory_reservations r JOIN app.work_orders w ON w.id = r.work_order_id
      WHERE w.work_order_number = ${wo}`,
  );
  check(
    "D3 予約は仕掛品の 1 行だけ（素材の予約は無い）",
    reservation === "PRODUCT:5:RESERVED",
    reservation,
  );
  await page.goto(`${APP}/production/work-orders/${wo}`, {
    waitUntil: "networkidle",
  });
  check(
    "D4 指示書詳細に予約済が出る",
    (await page.locator("[data-start-wip]").first().innerText()).includes(
      "予約済 5 本",
    ),
  );
  await shot(page, "04-detail-approved");
  await page.goto(`${APP}/inventory?tab=wip`, { waitUntil: "networkidle" });
  const tabRow = (
    await page.locator(`tr[data-wip-row="${BUCKET_EXACT}"]`).innerText()
  ).replace(/\s+/g, " ");
  check(
    "D5 仕掛品タブの利用可能数が予約ぶん減る（在庫 5 / 予約 5 / 利用可能 0）",
    /\b5\b[\s\S]*\b5\b[\s\S]*\b0\b/.test(tabRow),
    tabRow.slice(0, 200),
  );
  await shot(page, "05-wip-tab-reserved");
  // 予約済みの仕掛品は、別の指示書の候補から消える（使える数が 0）
  await openBuilder(page);
  check(
    "D6 予約済みのバケットは別の指示書の候補に出ない",
    (await row(page, BUCKET_EXACT).count()) === 0,
  );

  // ── E. 完了 → 選んだバケットから落ちる ───────────────────────────────────
  const steps = sql(
    `SELECT string_agg(s.id::text, ',' ORDER BY s.sort_order)
       FROM app.work_order_steps s JOIN app.work_orders w ON w.id = s.work_order_id
      WHERE w.work_order_number = ${wo}`,
  ).split(",");
  for (const stepId of steps) await runStep(page, wo, stepId);
  const done = sql(
    `SELECT status FROM app.work_orders WHERE work_order_number=${wo}`,
  );
  check("E1 全工程を完了すると指示書が完了する", done === "COMPLETED", done);
  check("E2 選んだバケットが 0 本・予約 0 になる", bucket(BUCKET_EXACT) === "0/0", bucket(BUCKET_EXACT));
  const txs = sql(
    `SELECT string_agg(t.transaction_type||':'||t.quantity::int, ',' ORDER BY t.created_at, t.transaction_type)
       FROM app.inventory_transactions t
      WHERE t.inventory_id = '${BUCKET_EXACT}'`,
  );
  check(
    "E3 台帳: 承認の RESERVE → 完了の RELEASE + OUT",
    txs === "RESERVE:5,OUT:5,RELEASE:5" || txs === "RESERVE:5,RELEASE:5,OUT:5",
    txs,
  );
  check(
    "E4 予約行は RELEASED（CONFIRMED のまま残らない）",
    sql(
      `SELECT string_agg(r.status::text, ',') FROM app.inventory_reservations r
         JOIN app.work_orders w ON w.id = r.work_order_id WHERE w.work_order_number = ${wo}`,
    ) === "RELEASED",
  );
  const finished = sql(
    `SELECT coalesce(sum(quantity)::int,0) FROM app.item_inventory
      WHERE item_id = ${PRODUCT} AND lot_number = ${wo} AND wip_state_id IS NULL`,
  );
  check("E5 完成品はこの指示書の製品（9201）で 5 本入る", finished === "5", finished);
  check(
    "E6 ほかの仕掛品には手を付けていない",
    bucket("dc050000-0000-4000-8000-000000000002") === "2/0" &&
      bucket("dc0f0000-0000-4000-8000-000000000002") === "4/0" &&
      bucket(BUCKET_OTHER) === "3/0",
    [
      bucket("dc050000-0000-4000-8000-000000000002"),
      bucket("dc0f0000-0000-4000-8000-000000000002"),
      bucket(BUCKET_OTHER),
    ],
  );
  const movement = sql(
    `SELECT count(DISTINCT t.movement_id) FROM app.inventory_transactions t
       JOIN app.inventory_movements m ON m.id = t.movement_id
      WHERE m.cause = 'WORK_ORDER_COMPLETION' AND m.source_type = 'work_orders'
        AND m.source_id = '${wo}'`,
  );
  check("E7 完了の入出庫は 1 枚の伝票に入る", movement === "1", movement);

  // ── F. 加工状態が合わない仕掛品は理由が要る ──────────────────────────────
  await openBuilder(page);
  await page
    .getByRole("button", { name: /加工状態が合わない仕掛品（1 件）を表示/ })
    .click();
  // 予定数量を先に入れる — 選んだときの投入数の既定は予定数量（使える数まで）。
  await page.getByRole("textbox", { name: /予定数量/ }).fill("3");
  await row(page, BUCKET_OTHER).getByRole("checkbox").check();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForTimeout(800);
  check(
    "F1 理由が無いと保存できない",
    latestWo() === wo &&
      (await page.getByText("理由を入力してください").first().isVisible()),
    `最新の指示書 ${latestWo()}`,
  );
  await shot(page, "06-builder-other");
  await page
    .getByLabel(/加工状態が合わない仕掛品を使う理由/)
    .fill("現物を確認。全長は仕上がっている");
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForURL(DETAIL_URL, { timeout: 30_000 });
  const woOther = latestWo();
  const otherRow = sql(
    `SELECT wip_override_reason FROM app.work_orders WHERE work_order_number=${woOther}`,
  );
  check(
    "F2 理由を入れると保存でき、指示書に残る",
    woOther > wo && otherRow === "現物を確認。全長は仕上がっている",
    `${docNumberOf(woOther)} / ${otherRow}`,
  );
  check(
    "F3 先頭から一致した 切断・センタレス だけを飛ばす（全長合わせ・段加工は残る）",
    stepCodes(woOther) ===
      "SEMI_FINISHED_ISSUE,LENGTH_ADJUST,STEP_MACHINING,STEP_INSPECTION,STEP_INSPECTION_APPROVAL",
    stepCodes(woOther),
  );
  const audit = sql(
    `SELECT after_data->'wipStart'->>'overrideReason' FROM app.audit_logs
      WHERE table_name = 'work_orders' AND action = 'CREATE'
      ORDER BY id DESC LIMIT 1`,
  );
  check(
    "F4 理由が監査ログに残る",
    audit === "現物を確認。全長は仕上がっている",
    audit,
  );

  // ── G. 承認後にキャンセル → 予約解放 ─────────────────────────────────────
  planAllSteps(woOther);
  await approve(page, woOther);
  check("G1 承認で予約される", bucket(BUCKET_OTHER) === "3/3", bucket(BUCKET_OTHER));
  await page.goto(`${APP}/production/work-orders/${woOther}`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "操作メニュー" }).first().click().catch(() => undefined);
  await page.getByRole("menuitem", { name: /キャンセル/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /キャンセル|実行/ })
    .last()
    .click();
  await page.waitForTimeout(1500);
  const cancelled = sql(
    `SELECT status FROM app.work_orders WHERE work_order_number=${woOther}`,
  );
  check("G2 キャンセルできる", cancelled === "CANCELLED", cancelled);
  check("G3 キャンセルで予約が解放される", bucket(BUCKET_OTHER) === "3/0", bucket(BUCKET_OTHER));

  // ── I. モバイル幅: 候補はカードになり、横にはみ出さない ───────────────────
  await page.setViewportSize({ width: 390, height: 844 });
  await openBuilder(page);
  await row(page, "dc050000-0000-4000-8000-000000000002")
    .getByRole("checkbox")
    .check();
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  check(
    "I1 モバイル幅で候補がカード表示になり、横にはみ出さない",
    overflow <= 0 &&
      (await page.locator("[data-wip-group] table:visible").count()) === 0 &&
      (await page.locator("[data-wip-summary]").isVisible()),
    { overflow },
  );
  await shot(page, "08-mobile");
  await page.setViewportSize({ width: 1440, height: 900 });

  // ── H. 共有端末の指示書スキャン ──────────────────────────────────────────
  if (KIOSK) {
    // 共有端末は別の主体（端末トークン + QR カード + PIN）。デモシードの撮影用の
    // 端末とカードで入る（e2e-kiosk-inspection-approval.ts と同じ）。
    const ctx = await browser.newContext({
      locale: "ja-JP",
      viewport: { width: 1280, height: 800 },
      hasTouch: true,
    });
    await ctx.addCookies([
      {
        name: "kiosk_device",
        value: "ckk-shot-device-token-fixed-0001",
        url: KIOSK,
      },
    ]);
    const kp = await ctx.newPage();
    await kp.goto(`${KIOSK}/login`, { waitUntil: "networkidle" });
    const access = await kp.request.post(`${KIOSK}/api/qr/access`, {
      data: { cardId: "SHT1234567890ABC" },
    });
    const { ticket } = (await access.json()) as { ticket: string };
    await kp.request.post(`${KIOSK}/api/kiosk/pin`, {
      data: { ticket, purpose: "PIN_VERIFY", pin: "4321" },
    });
    await kp.goto(`${KIOSK}/wo-scan/${wo}`, { waitUntil: "networkidle" });
    const kiosk = (await kp.locator("body").innerText()).replace(/\s+/g, " ");
    check(
      "H1 共有端末に開始状態と飛ばした工程が出る",
      kiosk.includes("開始状態") &&
        kiosk.includes("仕掛品で済んでいるので行わない工程") &&
        kiosk.includes("全長合わせ"),
      kiosk.slice(0, 300),
    );
    await shot(kp, "07-kiosk-wo-scan");
    // 素材から作る指示書には開始状態を出さない
    await kp.goto(`${KIOSK}/wo-scan/9001`, { waitUntil: "networkidle" });
    check(
      "H2 素材から作る指示書には開始状態が出ない",
      !(await kp.locator("body").innerText()).includes("開始状態"),
    );
    await ctx.close();
  } else {
    console.log("SKIP  H 共有端末（KIOSK_URL が無い）");
  }

  check("画面のコンソールにエラーが無い", consoleErrors.length === 0, consoleErrors.slice(0, 5));
  await browser.close();
  console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
