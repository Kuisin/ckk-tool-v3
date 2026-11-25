/**
 * e2e-wip-abort.ts — 指示書の打ち切り（仕掛品の再設計 PR 6）の通し確認。
 *
 * 在庫の仕掛品から始める指示書（e2e-wip-draw の fixtures を流用）を進めて、
 * 途中で打ち切る。単体試験では見えないものを実画面と台帳で見る:
 *   A. 承認設定に段が無い: 申請と同時に適用される。工程待ちの品が、戻した数だけ
 *      仕掛品（ロット = 指示書番号・加工状態・目標製品・仕上がり寸法）で入り、
 *      投入した仕掛品は落ち、伝票の事由は WORK_ORDER_ABORT。指示書は
 *      CANCELLED + aborted_at、残りの工程は閉じる
 *   B. 承認設定に段が 1 つ: 申請は保留され（指示書は進行中のまま）、
 *      承認を待つあいだに工程を進めると、承認しても適用されない（FAILED）
 *   C. いまの状態で申請し直して承認すると適用される（工程内の品が、その工程を
 *      済んでいない加工状態で戻る）
 *   D. 理由が空・寸法が空のままでは「打ち切る」を押せない
 *
 * **使い捨て DB を書き換える。** デモシードを流した DB に対して流すこと:
 *
 *   1. SHOT_DB_CONTAINER=ckk-wipabort-db SHOT_DB_PORT=<空きポート> pnpm docs:seed
 *   2. アプリを起動（APP_URL）
 *   3. DB_CONTAINER=ckk-wipabort-db APP_URL=http://localhost:<port> \
 *        SHOT_DIR=/tmp/wip-abort pnpm exec tsx e2e-wip-abort.ts
 *
 * 最後に「指示書の打ち切り」の承認フローの段を消して終わる（DB を元の設定に戻す）。
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const DB_CONTAINER = process.env.DB_CONTAINER ?? "ckk-wipabort-db";
const SHOT_DIR = process.env.SHOT_DIR;

/** 指示書をつくる製品（e2e-wip-draw の fixtures）。 */
const PRODUCT = 9201;
/** ちょうど: φ6×60 / [切断, センタレス, 全長合わせ] / 5 本 / 目標製品 9001。 */
const BUCKET_EXACT = "dc0f0000-0000-4000-8000-000000000001";

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
    ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "ckk", ...args],
    { input, encoding: "utf8" },
  ).trim();
}
const sql = (query: string): string => psql(["-tAc", query]);

/** fixtures を流し直す + 前の実行が残した打ち切りの痕跡を消す。 */
function resetFixtures(): void {
  psql(
    ["-v", "ON_ERROR_STOP=1", "-q", "-f", "-"],
    `DELETE FROM app.inventory_transactions t
       USING app.inventory_movements m, app.work_orders w
      WHERE t.movement_id = m.id AND m.source_type = 'work_orders'
        AND m.source_id = w.work_order_number::text AND w.product_item_id = ${PRODUCT};
     DELETE FROM app.approval_requests a
       USING app.work_order_aborts x, app.work_orders w
      WHERE a.target_type = 'work_order_aborts' AND a.target_id = x.id::text
        AND x.work_order_id = w.id AND w.product_item_id = ${PRODUCT};`,
  );
  psql(
    ["-v", "ON_ERROR_STOP=1", "-q", "-f", "-"],
    readFileSync(join(import.meta.dirname, "e2e-wip-draw-fixtures.sql"), "utf8"),
  );
}

/** 「指示書の打ち切り」の承認フローの段（0 = 消す / 1 = 指示書と同じグループで 1 段）。 */
function setAbortFlowSteps(n: 0 | 1): void {
  psql(
    ["-v", "ON_ERROR_STOP=1", "-q", "-f", "-"],
    n === 0
      ? `DELETE FROM app.approval_flow_steps WHERE target_type = 'work_order_aborts';`
      : `INSERT INTO app.approval_flows (target_type) VALUES ('work_order_aborts')
           ON CONFLICT (target_type) DO NOTHING;
         DELETE FROM app.approval_flow_steps WHERE target_type = 'work_order_aborts';
         INSERT INTO app.approval_flow_steps (target_type, step_no, name, group_id, mode)
           SELECT 'work_order_aborts', 1, '{"ja":"第一承認","en":"First approval"}'::jsonb,
                  group_id, 'ANY'
             FROM app.approval_flow_steps
            WHERE target_type = 'work_orders' ORDER BY step_no LIMIT 1;`,
  );
}

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

const latestWo = (): number =>
  Number(
    sql(
      `SELECT coalesce(max(work_order_number),0) FROM app.work_orders WHERE product_item_id=${PRODUCT}`,
    ),
  );

/** 在庫の仕掛品（ちょうど 5 本）から始める在庫向けの指示書を作って承認する。 */
async function createApprovedWo(page: Page): Promise<number> {
  await page.goto(`${APP}/production/work-orders/new`, {
    waitUntil: "networkidle",
  });
  await page.getByText("在庫向け（注文明細なし）", { exact: true }).click();
  const product = page.getByPlaceholder("製品コード・名称で検索");
  await product.click();
  await product.fill("2枚刃 φ6×60");
  await page
    .getByRole("option", { name: /超硬ドリル 2枚刃 φ6×60/ })
    .first()
    .click();
  await page.locator("[data-wip-group]").first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await page.getByRole("textbox", { name: /予定数量/ }).fill("5");
  await page
    .locator(`[data-wip-row="${BUCKET_EXACT}"]`)
    .getByRole("checkbox")
    .check();
  await page.waitForTimeout(600);
  const before = latestWo();
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForURL(
    (u) =>
      /\/production\/work-orders\/[^/]+$/.test(u.pathname) &&
      !u.pathname.endsWith("/new"),
    { timeout: 30_000 },
  );
  const wo = latestWo();
  if (wo <= before) throw new Error("work order was not created");

  // 承認依頼の前に作業計画を揃える（作業場所マスタのある環境では必須 — §7）。
  // 画面で 1 工程ずつ入れるのはこの確認の主題ではないので台帳へ直接入れる。
  sql(
    `INSERT INTO app.work_order_step_plans
       (work_order_step_id, user_id, planned_date, planned_start_at, planned_end_at,
        quantity, work_location_id)
     SELECT s.id, (SELECT id FROM app.users WHERE username = 'demo1'), current_date,
            now(), now() + interval '1 hour', 5,
            (SELECT id FROM app.work_locations ORDER BY id LIMIT 1)
       FROM app.work_order_steps s JOIN app.work_orders w ON w.id = s.work_order_id
      WHERE w.work_order_number = ${wo}`,
  );
  const detail = `${APP}/production/work-orders/${wo}`;
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
  return wo;
}

const stepIds = (wo: number): string[] =>
  sql(
    `SELECT string_agg(s.id::text, ',' ORDER BY s.sort_order)
       FROM app.work_order_steps s JOIN app.work_orders w ON w.id = s.work_order_id
      WHERE w.work_order_number = ${wo}`,
  ).split(",");

async function openStep(page: Page, wo: number, stepId: string) {
  await page.goto(`${APP}/production/work-orders/${wo}/steps/${stepId}`, {
    waitUntil: "networkidle",
  });
}

async function startStep(page: Page, wo: number, stepId: string) {
  await openStep(page, wo, stepId);
  const start = page.getByRole("button", { name: "工程開始" });
  if (await start.isVisible().catch(() => false)) {
    await start.click();
    await page.waitForTimeout(1500);
  }
}

async function runStep(page: Page, wo: number, stepId: string) {
  await startStep(page, wo, stepId);
  await openStep(page, wo, stepId);
  await page.getByRole("button", { name: "工程完了" }).click();
  await page
    .getByText("工程を完了しました", { exact: false })
    .first()
    .waitFor({ state: "visible", timeout: 20_000 })
    .catch(() => undefined);
  await page.waitForTimeout(800);
}

/** 指示書詳細の「⋯ → 打ち切り」を開く。 */
async function openAbort(page: Page, wo: number): Promise<void> {
  await page.goto(`${APP}/production/work-orders/${wo}`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "操作メニュー" }).click();
  await page.getByRole("menuitem", { name: "打ち切り" }).click();
  await page.getByRole("dialog").waitFor({ timeout: 10_000 });
}

/** フォームを埋めて「打ち切る」。dims を渡さなければ寸法は空のまま。 */
async function fillAbort(
  page: Page,
  opts: { returnQuantity?: number; dims?: [number, number]; reason?: string },
): Promise<void> {
  const dialog = page.getByRole("dialog");
  if (opts.returnQuantity != null) {
    await dialog
      .getByRole("textbox", { name: /仕掛品として戻す数/ })
      .fill(String(opts.returnQuantity));
  }
  if (opts.dims) {
    await dialog
      .getByRole("textbox", { name: /仕上がり径/ })
      .fill(String(opts.dims[0]));
    await dialog
      .getByRole("textbox", { name: /仕上がり長/ })
      .fill(String(opts.dims[1]));
  }
  if (opts.reason != null) {
    await dialog.getByLabel(/打ち切りの理由/).fill(opts.reason);
  }
  await page.waitForTimeout(300);
}

const confirmButton = (page: Page) =>
  page.getByRole("dialog").getByRole("button", { name: "打ち切る" });

const abortRow = (wo: number): string =>
  sql(
    `SELECT string_agg(x.status, ',' ORDER BY x.requested_at)
       FROM app.work_order_aborts x JOIN app.work_orders w ON w.id = x.work_order_id
      WHERE w.work_order_number = ${wo}`,
  );

const woState = (wo: number): string =>
  sql(
    `SELECT status||'|'||(aborted_at IS NOT NULL) FROM app.work_orders WHERE work_order_number = ${wo}`,
  );

/** 打ち切りで入った仕掛品（ロット = 指示書番号）。 */
const abortedWip = (wo: number): string =>
  sql(
    `SELECT coalesce(string_agg(
              i.quantity::int||'|'||array_to_string(s.step_ids, ',')||'|'||
              i.aimed_item_id||'|'||coalesce(i.finished_diameter_mm::text,'-')||'|'||
              coalesce(i.finished_length_mm::text,'-'), ';'), '')
       FROM app.item_inventory i JOIN app.wip_states s ON s.id = i.wip_state_id
      WHERE i.lot_number = ${wo} AND i.quantity > 0`,
  );

const bucket = (id: string): string =>
  sql(
    `SELECT quantity::int||'/'||reserved_quantity::int FROM app.item_inventory WHERE id='${id}'`,
  );

async function main(): Promise<void> {
  resetFixtures();
  setAbortFlowSteps(0);
  const browser = await chromium.launch();
  const page = await browser.newPage({
    locale: "ja-JP",
    viewport: { width: 1440, height: 900 },
  });
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  await login(page);

  // ── A. 段なし: 申請と同時に適用 ───────────────────────────────────────────
  const woA = await createApprovedWo(page);
  const [issueA, machiningA] = stepIds(woA);
  await runStep(page, woA, issueA);
  await runStep(page, woA, machiningA);
  check("A0 半製品出しと段加工を完了 → 指示書は進行中", woState(woA) === "IN_PROGRESS|false", woState(woA));

  await openAbort(page, woA);
  const dialogText = (await page.getByRole("dialog").innerText()).replace(/\s+/g, " ");
  check(
    "A1 工程待ちの位置が 1 つ（段加工 → 検査、5 本）",
    dialogText.includes("工程待ち") && dialogText.includes("5 本"),
    dialogText.slice(0, 300),
  );
  // D. 理由・寸法が空のうちは押せない
  check("D1 理由も寸法も空なら「打ち切る」は押せない", await confirmButton(page).isDisabled());
  await fillAbort(page, { returnQuantity: 4, reason: "受注取り消し（e2e）" });
  check(
    "D2 形を変える工程が済んだ品を戻すなら寸法が要る",
    await confirmButton(page).isDisabled(),
  );
  await fillAbort(page, { dims: [5.9, 59.5] });
  const scrapShown = await page
    .getByRole("dialog")
    .getByRole("textbox", { name: /^廃棄/ })
    .inputValue();
  check("A2 戻さない 1 本は廃棄として出る", scrapShown === "1", scrapShown);
  await shot(page, "01-abort-form-waiting");
  check("A3 入力が揃うと押せる", await confirmButton(page).isEnabled());
  await confirmButton(page).click();
  await page.getByText("打ち切りました").first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(1000);

  check("A4 申請は APPLIED", abortRow(woA) === "APPLIED", abortRow(woA));
  check("A5 指示書は CANCELLED + aborted_at", woState(woA) === "CANCELLED|true", woState(woA));
  const wipA = abortedWip(woA);
  check(
    "A6 仕掛品 4 本・加工状態に段加工まで・目標製品 9201・寸法 5.9 × 59.5",
    /^4\|5,6,10,\d+\|9201\|5\.9\d*\|59\.5\d*$/.test(wipA),
    wipA,
  );
  check("A7 投入した仕掛品は落ちる（0 本・予約 0）", bucket(BUCKET_EXACT) === "0/0", bucket(BUCKET_EXACT));
  // 承認のときの予約（STOCK_RESERVATION）は別の伝票。打ち切りの入出庫は 1 枚。
  const causeA = sql(
    `SELECT string_agg(m.cause::text, ',' ORDER BY m.cause) FROM app.inventory_movements m
      WHERE m.source_type = 'work_orders' AND m.source_id = '${woA}'
        AND m.cause <> 'STOCK_RESERVATION'`,
  );
  check("A8 打ち切りの入出庫は事由 WORK_ORDER_ABORT の伝票 1 枚", causeA === "WORK_ORDER_ABORT", causeA);
  const openSteps = sql(
    `SELECT count(*) FROM app.work_order_steps s JOIN app.work_orders w ON w.id = s.work_order_id
      WHERE w.work_order_number = ${woA} AND s.status IN ('PENDING','IN_PROGRESS')`,
  );
  check("A9 残りの工程は閉じる", openSteps === "0", openSteps);
  const reservationsA = sql(
    `SELECT coalesce(string_agg(DISTINCT r.status::text, ','), '') FROM app.inventory_reservations r
       JOIN app.work_orders w ON w.id = r.work_order_id WHERE w.work_order_number = ${woA}`,
  );
  check("A10 予約は残らない（RELEASED のみ）", reservationsA === "RELEASED", reservationsA);
  await page.goto(`${APP}/production/work-orders/${woA}`, { waitUntil: "networkidle" });
  check(
    "A1b 加工状態は工程名で出る（開始状態の工程も）",
    !/#\d+ →/.test(dialogText) && dialogText.includes("切断"),
  );
  check(
    "A11 詳細に「打ち切り済み」のカードと理由が出る",
    (await page.getByText("打ち切り済み").first().isVisible()) &&
      (await page.getByText(/受注取り消し（e2e）/).first().isVisible()),
  );
  await shot(page, "02-detail-aborted");
  const audit = sql(
    `SELECT count(*) FROM app.audit_logs WHERE table_name = 'work_orders'
        AND record_id = '${woA}'
        AND after_data::text LIKE '%打ち切り%'`,
  );
  check("A12 監査ログに打ち切りが残る", Number(audit) >= 1, audit);

  // ── B. 段 1 つ: 保留 → 工程が進むと適用されない ───────────────────────────
  resetFixtures();
  setAbortFlowSteps(1);
  const woB = await createApprovedWo(page);
  const [issueB, machiningB] = stepIds(woB);
  await runStep(page, woB, issueB);
  await startStep(page, woB, machiningB);
  await openAbort(page, woB);
  const dialogB = (await page.getByRole("dialog").innerText()).replace(/\s+/g, " ");
  check("B1 工程内の位置が 1 つ（段加工、5 本）", dialogB.includes("工程内") && dialogB.includes("5 本"), dialogB.slice(0, 300));
  await fillAbort(page, { returnQuantity: 5, dims: [5.95, 60], reason: "図面変更（e2e）" });
  await shot(page, "03-abort-form-in-step");
  await confirmButton(page).click();
  await page.getByText("打ち切りを申請しました").first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(1000);
  check("B2 申請は PENDING・指示書は進行中のまま", abortRow(woB) === "PENDING" && woState(woB) === "IN_PROGRESS|false", `${abortRow(woB)} / ${woState(woB)}`);
  await page.goto(`${APP}/production/work-orders/${woB}`, { waitUntil: "networkidle" });
  check(
    "B3 詳細の最上部に打ち切りの承認カード",
    await page.getByText("打ち切りの承認").first().isVisible(),
  );
  await shot(page, "04-detail-pending");
  // 承認を待つあいだに段加工を完了してしまう
  await runStep(page, woB, machiningB);
  await page.goto(`${APP}/production/work-orders/${woB}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "承認", exact: true }).click();
  await page.waitForTimeout(2000);
  check(
    "B4 工程が進んだので承認しても適用されない（FAILED）・指示書は進行中",
    abortRow(woB) === "FAILED" && woState(woB) === "IN_PROGRESS|false",
    `${abortRow(woB)} / ${woState(woB)}`,
  );
  await page.goto(`${APP}/production/work-orders/${woB}`, { waitUntil: "networkidle" });
  check(
    "B5 詳細に「打ち切りを適用できませんでした」",
    await page.getByText("打ち切りを適用できませんでした").first().isVisible(),
  );
  await shot(page, "05-detail-failed");

  // ── C. いまの状態で申請し直して承認 ───────────────────────────────────────
  await openAbort(page, woB);
  await fillAbort(page, { returnQuantity: 5, dims: [5.95, 60], reason: "図面変更（e2e・再申請）" });
  await confirmButton(page).click();
  await page.waitForTimeout(1500);
  await page.goto(`${APP}/production/work-orders/${woB}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "承認", exact: true }).click();
  await page.waitForTimeout(2000);
  check("C1 承認で適用される", abortRow(woB) === "FAILED,APPLIED" && woState(woB) === "CANCELLED|true", `${abortRow(woB)} / ${woState(woB)}`);
  const wipB = abortedWip(woB);
  check(
    "C2 工程待ちの 5 本が段加工まで済んだ加工状態で戻る",
    /^5\|5,6,10,\d+\|9201\|5\.95\d*\|60(\.0*)?$/.test(wipB),
    wipB,
  );
  const approvals = sql(
    `SELECT string_agg(a.status::text, ',' ORDER BY a.requested_at) FROM app.approval_requests a
       JOIN app.work_order_aborts x ON a.target_id = x.id::text
       JOIN app.work_orders w ON w.id = x.work_order_id
      WHERE a.target_type = 'work_order_aborts' AND w.work_order_number = ${woB}`,
  );
  check("C3 承認依頼は 2 件とも承認済み", approvals === "APPROVED,APPROVED", approvals);

  // ── 後始末 ─────────────────────────────────────────────────────────────────
  setAbortFlowSteps(0);
  check("ブラウザのエラーなし", consoleErrors.length === 0, consoleErrors.slice(0, 3));
  await browser.close();
  console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
