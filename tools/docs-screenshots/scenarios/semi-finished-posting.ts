/**
 * 仕掛品の計上（仕掛品の再設計 PR 3 — #983）— 工程の完了で半製品に振り分けた分が、
 * 指示書の完了で「発生元の工程ごとに 1 本ずつ」仕掛品の在庫に入る。
 *
 *   - 仕上がり寸法の欄は、**品物が工程を離れて在庫に入る完了でだけ**出る
 *     （不良なし・廃棄だけ の完了では出ない。半製品の数を入れた瞬間に出る）
 *   - 在庫に入る加工状態は読み取り専用で、振り分けた工程そのものは含まない
 *     （段加工の途中で振り分けた分 = 切断 → センタレス まで）
 *   - 形を変える工程が済んでいれば仕上がり寸法が必須。入れるまで完了できない
 *   - 在庫に入るのは**指示書の完了のとき**。発生元の工程ごとに別のバケットになる
 *     （切断で振り分けた 2 本 = 未加工 / 段加工で振り分けた 3 本 = 切断 › センタレス）
 *
 * 使うのはデモの進行中の指示書 #9001（段加工が進行中・受入 51。承認者 demo_shot が
 * 作業中なので、承認者の画面で進める）。準備: fixtures/wip-work-order-9001.sql。
 */

import type { Scn } from "./scn";
import type { Scenario } from "./types";

const WO = 9001;
const STEP_MACHINING = "dc011000-0000-4000-8000-000000000004";
const STEP_INSPECTION = "dc011000-0000-4000-8000-000000000005";
const STEP_APPROVAL = "dc011000-0000-4000-8000-000000000006";

const stepUrl = (id: string) => `/production/work-orders/${WO}/steps/${id}`;
const WIP_TITLE = "在庫に置く仕掛品";

/** ロット 9001 の仕掛品: 数量|加工状態|目標製品|仕上がり|発生工程 code（数量の多い順）。 */
const lotWip = `select coalesce(string_agg(i.quantity::int||'|'||array_to_string(st.step_ids, ',')||'|'||i.aimed_item_id||'|'||
                         coalesce(i.finished_diameter_mm::float::text,'-')||'x'||coalesce(i.finished_length_mm::float::text,'-')||'|'||
                         coalesce((select c.code from app.work_order_steps s join app.process_step_catalog c on c.id = s.process_step_id where s.id = i.source_step_id), '-'),
                       ' ; ' order by i.quantity desc), '')
                  from app.item_inventory i join app.wip_states st on st.id = i.wip_state_id
                 where i.lot_number = ${WO} and i.quantity > 0`;

/** 工程を開いて 開始 → 完了（数量は既定のまま = 全数良品）。 */
async function runStep(s: Scn, stepId: string): Promise<void> {
  const p = s.page;
  await s.goto(stepUrl(stepId));
  await s.click(p.getByRole("button", { name: "工程開始" }).first());
  const complete = p.getByRole("button", { name: "工程完了", exact: true }).first();
  await complete.waitFor({ state: "visible", timeout: 20_000 });
  await s.click(complete);
  await s.toast("工程を完了しました");
}

export const semiFinishedPosting: Scenario = {
  id: "semi-finished-posting",
  title: "半製品の計上 — 仕上がり寸法は在庫に入る完了でだけ聞かれ、指示書の完了で発生元の工程ごとに在庫へ入る",
  feature: "仕掛品の再設計 (#978–#989)",
  user: "approver",
  fixtures: ["scenarios/fixtures/wip-work-order-9001.sql"],
  steps: [
    {
      caption: "進行中の工程「段加工」（受入 51）を開く — 不良が無い完了では「在庫に置く仕掛品」の欄は出ない",
      run: async (s) => {
        const p = s.page;
        await s.goto(stepUrl(STEP_MACHINING));
        await s.see("数量・不良");
        const form = (await p.locator("main").innerText()).replace(/\s+/g, " ");
        s.check("受入数 51・良品数 51・総不良数 0", /受入数 51 固定 良品数 51 自動計算 総不良数 0/.test(form), form.slice(form.indexOf("数量・不良"), form.indexOf("数量・不良") + 120));
        s.check("不良なしでは仕掛品の記録欄が出ない", (await p.getByText(WIP_TITLE).count()) === 0);
        s.check("そのまま完了できる（工程完了が押せる）", await p.getByRole("button", { name: "工程完了", exact: true }).isEnabled());
      },
    },
    {
      caption: "不良を 1 行足す（種別 = 廃棄・1 本）— 廃棄は在庫に入らないので、まだ記録欄は出ない",
      run: async (s) => {
        const p = s.page;
        await s.click(p.getByRole("button", { name: "不良を追加" }).first());
        await s.pick(p.getByRole("combobox", { name: "不良種類" }).first(), /./);
        await s.fill(p.getByRole("textbox", { name: "詳細" }).first(), "段付き部の寸法外れ");
        s.check("種別の既定は廃棄", (await p.getByRole("combobox", { name: "種別" }).first().inputValue()) === "廃棄");
        s.check("廃棄だけの完了では仕掛品の記録欄が出ない", (await p.getByText(WIP_TITLE).count()) === 0);
        s.check("良品数は 50 に自動計算される", /良品数 50 自動計算 総不良数 1/.test((await p.locator("main").innerText()).replace(/\s+/g, " ")));
      },
    },
    {
      caption: "種別を「半製品」にして 3 本にする —「在庫に置く仕掛品」が出て、加工状態（切断 → センタレス）と仕上がり寸法（必須）を聞かれる。入れるまで完了できない",
      run: async (s) => {
        const p = s.page;
        await s.pick(p.getByRole("combobox", { name: "種別" }).first(), "半製品", { exact: true });
        await s.fill(p.getByRole("textbox", { name: "本数" }).first(), "3");
        await p.getByText(WIP_TITLE).first().waitFor();
        const form = (await p.locator("main").innerText()).replace(/\s+/g, " ");
        const wip = form.slice(form.indexOf(WIP_TITLE), form.indexOf(WIP_TITLE) + 260);
        s.check("半製品の数を入れると記録欄が出る", wip.startsWith(WIP_TITLE), wip);
        s.check(
          "加工状態は「半製品に振り分けた分: 切断 → センタレス」— 振り分けた工程（段加工）は含まない",
          wip.includes("半製品に振り分けた分 切断 → センタレス") && !wip.includes("センタレス → 段加工"),
          wip,
        );
        s.check("形を変える工程が済んでいるので仕上がり寸法が必須（不備が出る）", wip.includes("仕上がり径を入力してください") && wip.includes("仕上がり長を入力してください"), wip);
        s.check("寸法が空のうちは完了できない", await p.getByRole("button", { name: "工程完了", exact: true }).isDisabled());
        s.check("良品 48 / 半製品 3", /良品数 48 自動計算 総不良数 3/.test(form) && form.includes("半製品 3"));
      },
    },
    {
      caption: "仕上がり φ5.8 × 59 を入れて工程を完了する — 寸法は工程に保存される。在庫にはまだ入らない（入るのは指示書の完了のとき）",
      run: async (s) => {
        const p = s.page;
        await s.fill(p.getByRole("textbox", { name: /仕上がり径/ }), "5.8");
        await s.fill(p.getByRole("textbox", { name: /仕上がり長/ }), "59");
        const complete = p.getByRole("button", { name: "工程完了", exact: true });
        s.check("寸法を入れると完了できる", await complete.isEnabled());
        await s.shot("完了の直前（半製品 3 本・仕上がり φ5.8 × 59）");
        await s.click(complete);
        await s.toast("工程を完了しました");
        const step = s.sql(
          `select status||'|'||input_quantity||'|'||output_success_quantity||'|'||output_defect_semi_finished||'|'||
                  coalesce(finished_diameter_mm::float::text,'-')||'x'||coalesce(finished_length_mm::float::text,'-')
             from app.work_order_steps where id = '${STEP_MACHINING}'`,
        );
        s.check("工程: 完了・受入 51・良品 48・半製品 3・仕上がり 5.8 × 59 が保存される", step === "COMPLETED|51|48|3|5.8x59", step);
        s.check("まだ在庫には入っていない（指示書は進行中）", s.sql(lotWip) === "" && s.sql(`select status from app.work_orders where work_order_number = ${WO}`) === "IN_PROGRESS", s.sql(lotWip));
      },
    },
    {
      caption: "残りの工程（段加工検査 → 段加工検査承認）を完了する — 指示書が完了になる",
      run: async (s) => {
        await runStep(s, STEP_INSPECTION);
        await s.shot("段加工検査を完了したところ");
        await runStep(s, STEP_APPROVAL);
        await s.goto(`/production/work-orders/${WO}`);
        await s.see("完了", { exact: true });
        s.check("指示書は COMPLETED", s.sql(`select status from app.work_orders where work_order_number = ${WO}`) === "COMPLETED");
      },
    },
    {
      caption: "台帳 — 半製品は発生元の工程ごとに別のバケットへ入る: 切断の 2 本は未加工（ブランクの寸法）、段加工の 3 本は 切断 › センタレス・φ5.8 × 59",
      run: async (s) => {
        const wip = s.sql(lotWip);
        s.check(
          "ロット 9001 の仕掛品が 2 行: 3 本 [切断, センタレス] 5.8 × 59（発生工程 段加工）/ 2 本 [] 6 × 60（発生工程 切断）",
          wip === "3|5,6|9001|5.8x59|STEP_MACHINING ; 2||9001|6x60|CUTTING",
          wip,
        );
        const finished = s.sql(`select coalesce(sum(quantity),0)::int from app.item_inventory where item_id = 9001 and lot_number = ${WO} and wip_state_id is null`);
        s.check("完成品は良品の 48 本だけがロット 9001 で入る（半製品は完成品に数えない）", finished === "48", finished);
        const movement = s.sql(
          `select count(distinct m.id)||'|'||coalesce(string_agg(distinct m.cause::text, ','), '') from app.inventory_movements m
            where m.source_type = 'work_orders' and m.source_id = '${WO}' and m.created_at > now() - interval '10 minutes'`,
        );
        s.check("完了の入出庫は 1 枚の伝票（事由 WORK_ORDER_COMPLETION）", movement === "1|WORK_ORDER_COMPLETION", movement);
        const ins = s.sql(
          `select coalesce(string_agg(t.transaction_type||':'||t.quantity::int, ',' order by t.quantity desc), '')
             from app.inventory_transactions t join app.item_inventory i on i.id = t.inventory_id
            where i.lot_number = ${WO} and i.wip_state_id is not null`,
        );
        s.check("仕掛品の入庫は IN 3 と IN 2 の 2 行（1 本にまとめない）", ins === "IN:3,IN:2", ins);
      },
    },
    {
      caption: "在庫管理 — 仕掛品タブに 2 行で出る（加工状態・仕上がり寸法・ロット・目標製品・発生工程つき）。製品タブの在庫には半製品が混ざらない",
      run: async (s) => {
        const p = s.page;
        await s.goto("/inventory?tab=wip");
        await p.locator("tr[data-wip-row]").first().waitFor();
        const rowOf = async (qty: number) => {
          const id = s.sql(`select i.id from app.item_inventory i where i.lot_number = ${WO} and i.quantity = ${qty} and i.wip_state_id is not null`);
          return (await p.locator(`tr[data-wip-row="${id}"]`).innerText().catch(() => "")).replace(/\s+/g, " ");
        };
        const machined = await rowOf(3);
        s.check(
          "段加工で振り分けた 3 本: 切断 › センタレス / φ5.8 × 59 / 3・0・3 / ロット 9001 / 目標製品 超硬エンドミル / 発生工程 #9001 段加工",
          /切断\s*›\s*センタレス/.test(machined) && /φ5\.8 × 59 3 0 3 /.test(machined) && machined.includes("超硬エンドミル 4枚刃 φ6×60") && machined.includes("#9001 段加工"),
          machined,
        );
        const cut = await rowOf(2);
        s.check(
          "切断で振り分けた 2 本: 未加工 / 仕上がり φ6 × 60（ブランクの寸法）/ 2・0・2 / 発生工程 #9001 切断",
          cut.includes("未加工") && /φ6 × 60 2 0 2 /.test(cut) && cut.includes("#9001 切断"),
          cut,
        );
        await s.shot("仕掛品タブ（#9001 の半製品 2 行）");
        await s.click(p.getByRole("tab", { name: "製品" }));
        const products = p.locator("table:visible").first();
        await products.waitFor();
        const text = (await products.innerText()).replace(/\s+/g, " ");
        s.check("製品タブに半製品の印が無い", !text.includes("半製品"), text.slice(0, 300));
      },
    },
  ],
};
