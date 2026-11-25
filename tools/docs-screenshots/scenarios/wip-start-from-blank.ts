/**
 * 在庫の仕掛品から指示書を始める（仕掛品の再設計 PR 5 — #986）を、人が目で確かめる順に。
 *
 *   1. 指示書ビルダーの「使える仕掛品」が ちょうど / 長い / 太い の 3 区分に**分かれて**出る
 *   2. 1 つ選ぶと、その加工状態で済んでいる工程が灰色になり（この指示書では行わない）、
 *      使用素材の欄が消える。加工状態の違う仕掛品は混ぜられない
 *   3. 保存すると、半製品出しから始まる指示書になり、投入する仕掛品が記録される
 *      （work_order_wip_draws）。この時点では予約しない
 *   4. 承認（2 段）で選んだバケットが予約される → 仕掛品タブの利用可能数が減る
 *   5. 全工程を完了すると、選んだバケットから落ちる（RELEASE + OUT）。完成品は
 *      この指示書の製品で入る
 *
 * 準備: e2e-wip-draw-fixtures.sql（製品 9201・仕掛品 3 本）。作業計画は画面から入れる
 * （e2e-wip-draw.ts は SQL で入れている）。台帳を細かく見る版・理由つきの「加工状態が
 * 合わない仕掛品」・キャンセルでの解放・共有端末は e2e-wip-draw.ts が見る。
 */

import { WORK_ORDER_URL } from "../doc-number";
import type { Scn } from "./scn";
import type { Scenario } from "./types";

/** ちょうど: φ6×60 / [切断, センタレス, 全長合わせ] / 5 本 / 目標製品 9001（この指示書の製品ではない）。 */
const BUCKET_EXACT = "dc0f0000-0000-4000-8000-000000000001";
/** 長い: φ6×80 / [切断, センタレス] / 4 本。 */
const BUCKET_LONGER = "dc0f0000-0000-4000-8000-000000000002";
/** 太い: φ8×60 / [切断] / 3 本。 */
const BUCKET_LARGER = "dc0f0000-0000-4000-8000-000000000003";
/** 加工状態が合わない: φ6×60 / [切断, センタレス, 段加工]（全長合わせが抜けている）/ 3 本。 */
const BUCKET_OTHER = "dc050000-0000-4000-8000-000000000006";
const PRODUCT = 9201;

const bucket = (id: string) => `select quantity::int||'/'||reserved_quantity::int from app.item_inventory where id = '${id}'`;
const latestWo = `select coalesce(max(work_order_number), 0) from app.work_orders where product_item_id = ${PRODUCT}`;
const stepCodes = (wo: string) =>
  `select string_agg(c.code, ',' order by s.sort_order) from app.work_order_steps s
     join app.process_step_catalog c on c.id = s.process_step_id join app.work_orders w on w.id = s.work_order_id
    where w.work_order_number = ${wo}`;
const stepId = (wo: string, code: string) =>
  `select s.id from app.work_order_steps s join app.process_step_catalog c on c.id = s.process_step_id
     join app.work_orders w on w.id = s.work_order_id where w.work_order_number = ${wo} and c.code = '${code}'`;

/** 工程を開いて 開始 → 完了（数量は既定のまま = 全数良品）。 */
async function runStep(s: Scn, wo: string, code: string): Promise<void> {
  const p = s.page;
  await s.goto(`/production/work-orders/${wo}/steps/${s.sql(stepId(wo, code))}`);
  await s.click(p.getByRole("button", { name: "工程開始" }).first());
  const complete = p.getByRole("button", { name: "工程完了", exact: true }).first();
  await complete.waitFor({ state: "visible", timeout: 20_000 });
  await s.click(complete);
  await s.toast("工程を完了しました");
}

export const wipStartFromBlank: Scenario = {
  id: "wip-start-from-blank",
  title: "在庫の仕掛品から指示書を始める — 候補 3 区分・済んだ工程を飛ばす・承認で予約・完了で消費",
  feature: "仕掛品の再設計 (#978–#989)",
  fixtures: ["e2e-wip-draw-fixtures.sql"],
  steps: [
    {
      caption: "指示書の新規作成で「在庫向け」と製品（超硬ドリル 2枚刃 φ6×60）を選ぶ —「使える仕掛品」が ちょうど / 長い / 太い の 3 区分に分かれて出る",
      run: async (s) => {
        const p = s.page;
        await s.goto("/production/work-orders/new");
        await s.click(p.getByText("在庫向け（注文明細なし）", { exact: true }));
        await s.pick(p.getByPlaceholder("製品コード・名称で検索"), /超硬ドリル 2枚刃 φ6×60/, { search: "2枚刃 φ6×60" });
        await p.locator("[data-wip-group]").first().waitFor({ timeout: 30_000 });
        await p.waitForTimeout(800);
        await s.see("使える仕掛品");
        const groups = await p.locator("[data-wip-group]:visible").evaluateAll((els) => els.map((e) => e.getAttribute("data-wip-group")));
        s.check("区分は ちょうど / 長い / 太い の 3 つが別々に出る", groups.join(",") === "exact,longer,largerDiameter", groups);
        const text = async (g: string) => (await p.locator(`[data-wip-group="${g}"]`).innerText()).replace(/\s+/g, " ");
        const exact = await text("exact");
        s.check(
          "ちょうど（径も長さも同じ）: 加工状態・仕上がり寸法 φ6 × 60・目標製品（別の製品）・ロット・利用可能数・飛ばす工程が並ぶ",
          exact.includes("ちょうど") && /切断\s*›\s*センタレス\s*›\s*全長合わせ/.test(exact) && exact.includes("φ6 × 60") && exact.includes("超硬エンドミル 4枚刃 φ6×60") && exact.includes("#9004") && exact.includes("飛ばす工程"),
          exact.slice(0, 300),
        );
        s.check("ちょうど には未加工（素材を切っただけ手前の品）も出る — 飛ばす工程はありません", exact.includes("未加工") && exact.includes("飛ばす工程はありません"), exact.slice(0, 300));
        const longer = await text("longer");
        s.check("長い（径は同じで長い = 切って使う）: φ6 × 80・飛ばすのは 切断 と センタレス だけ（全長合わせは残る）", longer.includes("長い") && longer.includes("φ6 × 80") && !/φ6 × 80[\s\S]*全長合わせ/.test(longer), longer.slice(0, 260));
        const larger = await text("largerDiameter");
        s.check("太い（径が太い = 削って使う）: φ8 × 60・目標製品は超硬リーマ", larger.includes("太い") && larger.includes("φ8 × 60") && larger.includes("超硬リーマ"), larger.slice(0, 260));
        s.check(
          "加工状態が工程の先頭部分になっていない仕掛品は畳まれている（1 件）",
          (await p.getByRole("button", { name: /加工状態が合わない仕掛品（1 件）を表示/ }).isVisible()) && !(await p.locator(`[data-wip-row="${BUCKET_OTHER}"]`).isVisible()),
        );
        await p.locator("[data-wip-group]").first().scrollIntoViewIfNeeded();
      },
    },
    {
      caption: "予定数量 5 で「ちょうど」の 5 本を選ぶ — 済んでいる 3 工程（切断・センタレス・全長合わせ）が灰色になり、半製品出しから始まる指示書になる。使用素材の欄は消える",
      run: async (s) => {
        const p = s.page;
        await s.fill(p.getByRole("textbox", { name: /予定数量/ }), "5");
        await s.click(p.locator(`[data-wip-row="${BUCKET_EXACT}"]`).getByRole("checkbox"));
        await p.waitForTimeout(600);
        const summary = (await p.locator("[data-wip-summary]").innerText()).replace(/\s+/g, " ");
        s.check(
          "選ぶと 投入 5 本 / 予定数量 5 本 と、行わない工程（切断・センタレス・全長合わせ）が出る",
          summary.includes("投入 5 本 / 予定数量 5 本") && ["切断", "センタレス", "全長合わせ"].every((n) => summary.includes(n)) && summary.includes("半製品出しから始まります"),
          summary.slice(0, 300),
        );
        const skipped = await p.locator("[data-skipped]").evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ")));
        s.check("工程リストで 3 工程が「仕掛品で済み」になる", skipped.length === 3 && skipped.every((t) => t.includes("仕掛品で済み")), skipped);
        s.check("仕掛品から始めるので使用素材の欄が消える", (await p.getByPlaceholder("素材コード・名称で検索").count()) === 0);
        s.check(
          "加工状態の違う仕掛品（長い・太い）は選べなくなる（1 枚の指示書に加工状態は 1 つ）",
          (await p.locator(`[data-wip-row="${BUCKET_LONGER}"]`).getByRole("checkbox").isDisabled()) && (await p.locator(`[data-wip-row="${BUCKET_LARGER}"]`).getByRole("checkbox").isDisabled()),
        );
        // 作業計画・工程納期の行は「この指示書で実際に行う工程」— 先頭は半製品出しのはず。
        const planRows = await p
          .locator("h4", { hasText: "作業計画（担当者）" })
          .locator("xpath=ancestor::*[contains(@class,'form-section') or self::section or contains(@class,'mantine-Paper-root')][1]")
          .innerText()
          .then((t) => t.replace(/\s+/g, " "))
          .catch(() => "");
        s.check(
          "作業計画の 1 行目の工程名が「半製品出し（在庫）」になっている（素材出しのままになっていない）",
          planRows.includes("半製品出し（在庫）") && !planRows.includes("素材出し（在庫）"),
          planRows.slice(0, 200),
        );
        await p.locator("[data-wip-group]").first().scrollIntoViewIfNeeded();
      },
    },
    {
      caption: "作業計画（工程ごとの作業場所）を入れて保存する — 工程は 半製品出し → 段加工 → 検査 → 承認 の 4 つ。投入する仕掛品が記録され、まだ予約はされない",
      run: async (s) => {
        const p = s.page;
        const locations = p.getByRole("combobox", { name: "作業場所" });
        const rows = await locations.count();
        s.check("作業計画の行は、実際に行う 4 工程ぶん（飛ばす 3 工程は出ない）", rows === 4, rows);
        for (let i = 0; i < rows; i++) await s.pick(locations.nth(i), /./);
        await s.shot("保存する前のビルダー（仕掛品を選び、作業計画を入れたところ）");
        const versions = s.sql("select count(*) from app.product_process_route_versions");
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(WORK_ORDER_URL);
        await s.see("承認依頼が必要です");
        const wo = s.sql(latestWo);
        s.check("指示書が作られる", Number(wo) > 0, `ロット ${wo} / ${s.sql(`select doc_number from app.work_orders where work_order_number = ${wo}`)}`);
        s.check(
          "工程は 半製品出し → 段加工 → 段加工検査 → 段加工検査承認（済んでいる 3 工程は載らない）",
          s.sql(stepCodes(wo)) === "SEMI_FINISHED_ISSUE,STEP_MACHINING,STEP_INSPECTION,STEP_INSPECTION_APPROVAL",
          s.sql(stepCodes(wo)),
        );
        const row = s.sql(
          `select coalesce(material_item_id::text,'-')||'|'||(select array_to_string(step_ids, ',') from app.wip_states where id = w.start_wip_state_id)||'|'||
                  (select string_agg(d.inventory_id::text||':'||d.quantity, ',') from app.work_order_wip_draws d where d.work_order_id = w.id)
             from app.work_orders w where work_order_number = ${wo}`,
        );
        s.check("台帳: 使用素材なし・開始状態 [切断=5, センタレス=6, 全長合わせ=10]・投入の記録（work_order_wip_draws）に選んだバケット 5 本", row === `-|5,6,10|${BUCKET_EXACT}:5`, row);
        s.check("製品の工程リストに新しい版ができていない（飛ばすのはこの指示書だけ）", s.sql("select count(*) from app.product_process_route_versions") === versions);
        s.check("保存しただけでは予約されない（在庫 5 / 予約 0）", s.sql(bucket(BUCKET_EXACT)) === "5/0", s.sql(bucket(BUCKET_EXACT)));
        const start = (await p.locator("[data-start-wip]").first().innerText()).replace(/\s+/g, " ");
        s.check(
          "詳細に 開始状態・飛ばした工程・投入する仕掛品（ロット・本数・目標製品）・未予約 が出る",
          start.includes("開始状態") && start.includes("飛ばした工程") && start.includes("全長合わせ") && start.includes("ロット #9004") && start.includes("5 本") && start.includes("目標製品: 超硬エンドミル") && start.includes("未予約"),
          start.slice(0, 320),
        );
        const plans = s.sql(
          `select count(*)||'|'||count(*) filter (where p.planned_date = (now() at time zone 'Asia/Tokyo')::date)||'|'||min(p.planned_date)::text
             from app.work_order_step_plans p join app.work_order_steps st on st.id = p.work_order_step_id
             join app.work_orders w on w.id = st.work_order_id where w.work_order_number = ${wo}`,
        );
        s.check(
          "作業計画が 4 工程ぶん保存され、計画日は画面に出ていた今日（JST）の日付のまま入る",
          /^4\|4\|/.test(plans),
          `行数|今日の行数|保存された日付 = ${plans}（今日 = ${s.sql("select (now() at time zone 'Asia/Tokyo')::date")}）`,
        );
      },
    },
    {
      caption: "承認を依頼し、承認者が 2 段を承認する — 承認のときに選んだバケットが予約される（ここからは承認者の画面）",
      run: async (s) => {
        const p = s.page;
        const wo = s.sql(latestWo);
        await s.click(p.getByRole("button", { name: "承認依頼", exact: true }).first());
        await s.see(/承認待ち|承認依頼中/);
        s.check("承認依頼の時点ではまだ予約されない", s.sql(bucket(BUCKET_EXACT)) === "5/0", s.sql(bucket(BUCKET_EXACT)));
        await s.switchUser("approver", `/production/work-orders/${wo}`);
        await s.see("承認してください");
        await s.click(p.getByRole("button", { name: "承認", exact: true }).first());
        await s.see(/第 2\/2 段/);
        await s.click(p.getByRole("button", { name: "承認", exact: true }).first());
        await s.see("承認済");
        s.check("台帳: 承認で選んだバケットが 5 本予約される（在庫 5 / 予約 5）", s.sql(bucket(BUCKET_EXACT)) === "5/5", s.sql(bucket(BUCKET_EXACT)));
        const reservation = s.sql(
          `select string_agg(r.inventory_type||':'||r.quantity::int||':'||r.status, ',') from app.inventory_reservations r
             join app.work_orders w on w.id = r.work_order_id where w.work_order_number = ${wo}`,
        );
        s.check("台帳: 予約は仕掛品の 1 行だけ（素材の予約は無い）", reservation === "PRODUCT:5:RESERVED", reservation);
        await s.goto(`/production/work-orders/${wo}`);
        const start = (await p.locator("[data-start-wip]").first().innerText()).replace(/\s+/g, " ");
        s.check("詳細の投入する仕掛品が「予約済 5 本」になる", start.includes("予約済 5 本"), start.slice(0, 320));
      },
    },
    {
      caption: "在庫管理の仕掛品タブ — 選んだ行が 数量 5 / 予約 5 / 利用可能 0 になり、ほかの指示書の候補からは消える",
      run: async (s) => {
        const p = s.page;
        await s.goto("/inventory?tab=wip");
        await p.locator("tr[data-wip-row]").first().waitFor();
        const row = (await p.locator(`tr[data-wip-row="${BUCKET_EXACT}"]`).innerText()).replace(/\s+/g, " ");
        s.check("仕掛品タブ: φ6 × 60 の行が 5 / 5 / 0（数量 / 予約 / 利用可能）", /φ6 × 60 5 5 0 /.test(row), row);
        await s.shot("仕掛品タブ（予約されたところ）");
        await s.goto("/production/work-orders/new");
        await s.click(p.getByText("在庫向け（注文明細なし）", { exact: true }));
        await s.pick(p.getByPlaceholder("製品コード・名称で検索"), /超硬ドリル 2枚刃 φ6×60/, { search: "2枚刃 φ6×60" });
        await p.locator("[data-wip-group]").first().waitFor({ timeout: 30_000 });
        await p.waitForTimeout(800);
        s.check("予約済みのバケットは別の指示書の候補に出ない", (await p.locator(`[data-wip-row="${BUCKET_EXACT}"]`).count()) === 0);
        await p.locator("[data-wip-group]").first().scrollIntoViewIfNeeded();
      },
    },
    {
      caption: "工程を進める（担当者の画面）— 半製品出し（在庫）から始める。半製品出しが終わるまで、次の段加工は開始できないはず",
      run: async (s) => {
        const p = s.page;
        const wo = s.sql(latestWo);
        await s.switchUser("staff", `/production/work-orders/${wo}`);
        await s.see("工程ワークフロー");
        // 半製品出しの前に段加工の画面を開く — 受け入れる品がまだ無いので、開始できないのが正しい。
        await s.goto(`/production/work-orders/${wo}/steps/${s.sql(stepId(wo, "STEP_MACHINING"))}`);
        await s.see("段加工");
        const early = (await p.locator("main").innerText()).replace(/\s+/g, " ");
        s.check(
          "半製品出しが未完了のうちは、段加工に「開始できません」が出て 工程開始 を押せない",
          early.includes("開始できません") && (await p.getByRole("button", { name: "工程開始" }).count()) === 0,
          `工程開始ボタン ${await p.getByRole("button", { name: "工程開始" }).count()} 個 / 開始できません ${early.includes("開始できません")}`,
        );
        await s.shot("半製品出しの前に開いた段加工の画面");
        await runStep(s, wo, "SEMI_FINISHED_ISSUE");
        const issue = s.sql(
          `select s.status||'|'||s.input_quantity||'|'||s.output_success_quantity from app.work_order_steps s where s.id = '${s.sql(stepId(wo, "SEMI_FINISHED_ISSUE"))}'`,
        );
        s.check("半製品出しは 受入 5 / 良品 5 で完了する", issue === "COMPLETED|5|5", issue);
        s.check("工程の途中では在庫はまだ落ちない（予約のまま 5 / 5）", s.sql(bucket(BUCKET_EXACT)) === "5/5", s.sql(bucket(BUCKET_EXACT)));
      },
    },
    {
      caption: "残りの工程（段加工 → 段加工検査 → 段加工検査承認）を完了する — 指示書が完了し、選んだ仕掛品が在庫から落ち、完成品がこの指示書の製品で入る",
      run: async (s) => {
        const p = s.page;
        const wo = s.sql(latestWo);
        await runStep(s, wo, "STEP_MACHINING");
        await runStep(s, wo, "STEP_INSPECTION");
        await runStep(s, wo, "STEP_INSPECTION_APPROVAL");
        await s.goto(`/production/work-orders/${wo}`);
        await s.see("完了", { exact: true });
        s.check("指示書は COMPLETED", s.sql(`select status from app.work_orders where work_order_number = ${wo}`) === "COMPLETED");
        s.check("選んだバケットは 0 本・予約 0 になる", s.sql(bucket(BUCKET_EXACT)) === "0/0", s.sql(bucket(BUCKET_EXACT)));
        const txs = s.sql(
          `select string_agg(t.transaction_type||':'||t.quantity::int, ',' order by t.transaction_type::text) from app.inventory_transactions t where t.inventory_id = '${BUCKET_EXACT}'`,
        );
        s.check("台帳: 承認の RESERVE 5 → 完了の RELEASE 5 + OUT 5", txs === "OUT:5,RELEASE:5,RESERVE:5", txs);
        const finished = s.sql(`select coalesce(sum(quantity),0)::int from app.item_inventory where item_id = ${PRODUCT} and lot_number = ${wo} and wip_state_id is null`);
        s.check("完成品はこの指示書の製品（超硬ドリル 2枚刃 φ6×60）で 5 本・ロット = 指示書番号で入る", finished === "5", finished);
        s.check(
          "ほかの仕掛品には手を付けていない（長い 4 / 太い 3 / 未加工 2 / 合わない 3）",
          [BUCKET_LONGER, BUCKET_LARGER, "dc050000-0000-4000-8000-000000000002", BUCKET_OTHER].map((id) => s.sql(bucket(id))).join(",") === "4/0,3/0,2/0,3/0",
        );
        await s.shot("完了した指示書");
        await s.goto("/inventory?tab=wip");
        await p.locator("tr[data-wip-row]").first().waitFor();
        s.check("仕掛品タブから、使い切った行（φ6 × 60・切断 › センタレス › 全長合わせ）が消える", (await p.locator(`tr[data-wip-row="${BUCKET_EXACT}"]`).count()) === 0);
        await s.shot("仕掛品タブ（使い切ったあと）");
        await s.click(p.getByRole("tab", { name: "製品" }));
        const products = p.locator("table:visible").first();
        await products.waitFor();
        const text = (await products.innerText()).replace(/\s+/g, " ");
        s.check("製品タブに 超硬ドリル 2枚刃 φ6×60 の完成品が出る", text.includes("超硬ドリル 2枚刃 φ6×60"), text.slice(0, 400));
      },
    },
  ],
};
