/**
 * 指示書の打ち切り（仕掛品の再設計 PR 6 — #987）— 承認設定に段が無いとき。
 *
 *   進行中の指示書 #9001（段加工の工程内に 51 本）を打ち切る:
 *   - 理由は必須、形を変える工程（切断・センタレス）が済んだ品を戻すなら仕上がり寸法も必須
 *   - 戻さない分は廃棄として明示される（戻す数 + 廃棄 = その位置の本数）
 *   - 「指示書の打ち切り」に承認の段が無いので、申請と同時に適用される
 *   - 指示書は キャンセル + 打ち切り済み、残りの工程は閉じ、品は仕掛品として在庫に戻る
 *     （ロット = 指示書番号・加工状態・目標製品・仕上がり寸法つき）
 *
 * 準備: fixtures/wip-work-order-9001.sql（デモシードが先に置いた見本の仕掛品を消す）。
 * 承認を通す場合は wip-abort-approval、台帳を細かく見る版は e2e-wip-abort.ts。
 */

import type { Scenario } from "./types";

const WO = 9001;
const REASON = "受注取り消しのため（シナリオ）";

const woState = `select status||'|'||(aborted_at is not null) from app.work_orders where work_order_number = ${WO}`;
/** ロット 9001 の仕掛品: 数量|加工状態|目標製品|仕上がり径x長（数量の多い順）。 */
const lotWip = `select coalesce(string_agg(i.quantity::int||'|'||array_to_string(st.step_ids, ',')||'|'||i.aimed_item_id||'|'||
                         coalesce(i.finished_diameter_mm::float::text,'-')||'x'||coalesce(i.finished_length_mm::float::text,'-'),
                       ' ; ' order by i.quantity desc), '')
                  from app.item_inventory i join app.wip_states st on st.id = i.wip_state_id
                 where i.lot_number = ${WO} and i.quantity > 0`;

export const wipAbortReturn: Scenario = {
  id: "wip-abort-return",
  title: "指示書の打ち切り — 承認の段なし: 申請と同時に適用され、品が仕掛品として在庫へ戻る",
  feature: "仕掛品の再設計 (#978–#989)",
  fixtures: ["scenarios/fixtures/wip-work-order-9001.sql"],
  steps: [
    {
      caption: "進行中の指示書 #9001 を開き、⋯ →「打ち切り」— 流れの途中にある品が位置ごとに出る（段加工の工程内に 51 本）",
      run: async (s) => {
        const p = s.page;
        await s.goto(`/production/work-orders/${WO}`);
        await s.see("進行中");
        s.check("打ち切る前: 指示書は進行中・ロット 9001 の仕掛品は在庫に無い", s.sql(woState) === "IN_PROGRESS|false" && s.sql(lotWip) === "", `${s.sql(woState)} / ${s.sql(lotWip)}`);
        await s.shot("打ち切る前の指示書（進行中）");
        await s.menu("打ち切り");
        const dialog = p.getByRole("dialog");
        await dialog.getByText("指示書の打ち切り").first().waitFor();
        const text = (await dialog.innerText()).replace(/\s+/g, " ");
        s.check("位置は 1 つ: 工程内 / 段加工 / 51 本", text.includes("工程内") && text.includes("段加工") && text.includes("51 本"), text.slice(0, 260));
        s.check("加工状態は工程名で出る（切断 → センタレス。段加工は済んでいないので含まない）", text.includes("加工状態: 切断 → センタレス") && !text.includes("センタレス → 段加工"), text.slice(0, 260));
        s.check("戻す数の既定は全数（51）・廃棄 0", (await dialog.getByRole("textbox", { name: /仕掛品として戻す数/ }).inputValue()) === "51" && (await dialog.getByRole("textbox", { name: /^廃棄/ }).inputValue()) === "0");
        s.check("承認の案内（段があれば承認、無ければすぐ適用）が出る", text.includes("段が無ければすぐに適用されます"));
        s.check("理由も寸法も空のうちは「打ち切る」を押せない", await dialog.getByRole("button", { name: "打ち切る" }).isDisabled());
      },
    },
    {
      caption: "戻す数を 40 にすると残り 11 本は廃棄になる。理由を入れても、仕上がり寸法が空のままでは押せない",
      run: async (s) => {
        const dialog = s.page.getByRole("dialog");
        await s.fill(dialog.getByRole("textbox", { name: /仕掛品として戻す数/ }), "40");
        s.check("戻さない 11 本が廃棄の欄に出る", (await dialog.getByRole("textbox", { name: /^廃棄/ }).inputValue()) === "11", await dialog.getByRole("textbox", { name: /^廃棄/ }).inputValue());
        await s.fill(dialog.getByLabel(/打ち切りの理由/), REASON);
        const text = (await dialog.innerText()).replace(/\s+/g, " ");
        s.check("仕上がり寸法の不備が出る（形を変える工程が済んだ品を戻すので必須）", text.includes("仕上がり径を入力してください") && text.includes("仕上がり長を入力してください"), text.slice(-260));
        s.check("寸法が空のうちは「打ち切る」を押せない", await dialog.getByRole("button", { name: "打ち切る" }).isDisabled());
      },
    },
    {
      caption: "仕上がり寸法 φ5.9 × 59.5 を入れると押せるようになる。理由を消すとまた押せない（理由は常に必須）",
      run: async (s) => {
        const dialog = s.page.getByRole("dialog");
        const confirm = dialog.getByRole("button", { name: "打ち切る" });
        await s.fill(dialog.getByRole("textbox", { name: /仕上がり径/ }), "5.9");
        await s.fill(dialog.getByRole("textbox", { name: /仕上がり長/ }), "59.5");
        s.check("入力が揃うと「打ち切る」を押せる", await confirm.isEnabled());
        await s.fill(dialog.getByLabel(/打ち切りの理由/), "");
        s.check("理由を消すと押せない", await confirm.isDisabled());
        await s.shot("理由が空のとき（押せない）");
        await s.fill(dialog.getByLabel(/打ち切りの理由/), REASON);
        s.check("理由を入れ直すと押せる", await confirm.isEnabled());
      },
    },
    {
      caption: "「打ち切る」— 承認の段が無いのですぐに適用される。指示書は打ち切り済み（キャンセル）になり、理由と戻した数・廃棄が出る",
      run: async (s) => {
        const p = s.page;
        s.check("承認設定「指示書の打ち切り」に段は無い", s.sql("select count(*) from app.approval_flow_steps where target_type = 'work_order_aborts'") === "0");
        await s.clickInDialog("打ち切る");
        await s.toast("打ち切りました");
        await s.see("打ち切り済み");
        const body = (await p.locator("main").innerText()).replace(/\s+/g, " ");
        s.check("カードに理由と 戻した数 40 本 / 廃棄 11 本 が出る", body.includes(REASON) && /仕掛品として戻した数 40 本 \/ 廃棄 11 本/.test(body), body.slice(0, 400));
        const badges = (await p.locator("h2").first().locator("xpath=..").innerText()).replace(/\s+/g, " ");
        s.check("題の横の状態は「キャンセル」+「打ち切り」（ただのキャンセルと見分けが付く）", badges.includes("キャンセル") && badges.includes("打ち切り"), badges);
        s.check("台帳: 申請は APPLIED、指示書は CANCELLED + aborted_at", s.sql(`select string_agg(x.status, ',') from app.work_order_aborts x join app.work_orders w on w.id = x.work_order_id where w.work_order_number = ${WO}`) === "APPLIED" && s.sql(woState) === "CANCELLED|true", s.sql(woState));
        s.check("台帳: 承認依頼は作られない（段が無いので素通し）", s.sql("select count(*) from app.approval_requests where target_type = 'work_order_aborts'") === "0");
        const steps = s.sql(
          `select string_agg(c.code||'='||s.status, ',' order by s.sort_order) from app.work_order_steps s
             join app.work_orders w on w.id = s.work_order_id join app.process_step_catalog c on c.id = s.process_step_id
            where w.work_order_number = ${WO} and s.sort_order >= 4`,
        );
        s.check("台帳: 進行中・未着手だった工程（段加工・検査・承認）は CANCELLED で閉じる", steps === "STEP_MACHINING=CANCELLED,STEP_INSPECTION=CANCELLED,STEP_INSPECTION_APPROVAL=CANCELLED", steps);
        s.check(
          "台帳: 進行中だった工程のセッションロックが外れる",
          s.sql(`select count(*) from app.work_order_steps s join app.work_orders w on w.id = s.work_order_id where w.work_order_number = ${WO} and s.session_locked_by is not null`) === "0",
        );
      },
    },
    {
      caption: "台帳を確かめる — 戻した 40 本が ロット 9001・加工状態 [切断, センタレス]・目標製品・仕上がり寸法つきで入り、伝票の事由は WORK_ORDER_ABORT。素材の予約は解除され、注文明細は未手配に戻る",
      run: async (s) => {
        await s.goto(`/production/work-orders/${WO}`);
        await s.see("打ち切り済み");
        const wip = s.sql(lotWip);
        s.check(
          "仕掛品: 40 本・加工状態 [5=切断, 6=センタレス]・目標製品 9001・仕上がり 5.9 × 59.5（+ 切断で半製品に振り分けてあった 2 本が、未加工・ブランクの寸法 6 × 60 で入る）",
          wip === "40|5,6|9001|5.9x59.5 ; 2||9001|6x60",
          wip,
        );
        const causes = s.sql(
          `select coalesce(string_agg(distinct m.cause::text, ','), '') from app.inventory_movements m
            where m.source_type = 'work_orders' and m.source_id = '${WO}' and m.created_at > now() - interval '10 minutes'`,
        );
        s.check("入出庫伝票の事由は WORK_ORDER_ABORT", causes === "WORK_ORDER_ABORT", causes);
        const reservations = s.sql(
          `select coalesce(string_agg(distinct r.status::text, ','), '') from app.inventory_reservations r
             join app.work_orders w on w.id = r.work_order_id where w.work_order_number = ${WO}`,
        );
        s.check("予約は残らない（RESERVED / CONFIRMED のままの行が無い）", !/RESERVED|CONFIRMED/.test(reservations), reservations);
        // この明細（受注 150）は ほかの指示書（#9003 に 10・#9004 に 50）にも割り当ててあるので、
        // 状態は「製造中」のまま。この指示書のロット番号だけが外れ、割当 50 本ぶんが未手配に戻る。
        const line = s.sql("select status||'|'||coalesce(lot_number::text,'-') from app.order_lines where id = 'e0000000-0000-4000-8000-000000000001'");
        s.check("割り当てていた注文明細からこの指示書のロット番号が外れる（ほかの指示書にも割当があるので状態は製造中のまま）", line === "IN_PRODUCTION|-", line);
        const allocated = s.sql(
          `select coalesce(sum(a.quantity),0)::int from app.work_order_order_lines a join app.work_orders w on w.id = a.work_order_id
            where a.order_line_id = 'e0000000-0000-4000-8000-000000000001' and w.status <> 'CANCELLED'`,
        );
        s.check("生きている指示書への割当は 60 本（#9003 の 10 + #9004 の 50）— 打ち切った 50 本ぶんは数えない", allocated === "60", allocated);
        const audit = s.sql(`select count(*) from app.audit_logs where table_name = 'work_orders' and record_id = '${WO}' and after_data::text like '%打ち切り%'`);
        s.check("監査ログに打ち切りが残る", Number(audit) >= 1, audit);
        s.check("打ち切り済みの指示書には「打ち切り」の操作がもう出ない（メニューに無いか、押せない）", await (async () => {
          await s.click(s.page.getByRole("button", { name: "操作メニュー" }).first());
          const item = s.page.getByRole("menuitem", { name: "打ち切り" });
          const gone = (await item.count()) === 0 || (await item.isDisabled());
          await s.shot("打ち切り済みの指示書の操作メニュー");
          await s.page.keyboard.press("Escape");
          return gone;
        })());
      },
    },
    {
      caption: "在庫管理の仕掛品タブ — 戻した品が 切断 › センタレス・仕上がり φ5.9 × 59.5・ロット 9001・目標製品つきで並ぶ（次の指示書の候補になる）",
      run: async (s) => {
        const p = s.page;
        await s.goto("/inventory?tab=wip");
        await p.locator("tr[data-wip-row]").first().waitFor();
        const id = s.sql(`select i.id from app.item_inventory i where i.lot_number = ${WO} and i.quantity = 40 and i.wip_state_id is not null`);
        const row = (await p.locator(`tr[data-wip-row="${id}"]`).innerText().catch(() => "")).replace(/\s+/g, " ");
        s.check(
          "行: 切断 › センタレス / φ5.9 × 59.5 / 数量 40・予約 0・利用可能 40 / ロット 9001 / 目標製品 超硬エンドミル",
          /切断\s*›\s*センタレス/.test(row) && /φ5\.9 × 59\.5 40 0 40 /.test(row) && row.includes("9001") && row.includes("超硬エンドミル 4枚刃 φ6×60"),
          row,
        );
        await s.shot("仕掛品タブ（打ち切りで戻した品）");
        // 未処理指示書（PD05）: 打ち切った 50 本ぶんが未手配に戻っている（受注 150 − 手配済 60 = 90）。
        await s.goto("/production/pending-work-orders");
        const pending = (await p.locator("table tbody tr", { hasText: "ORD-2026-00003-01" }).first().innerText().catch(() => "")).replace(/\s+/g, " ");
        s.check("未処理指示書の未手配に、この明細が 受注 150 / 手配済 60 / 未手配 90 で出る", /150\D+60\D+90/.test(pending), pending);
      },
    },
  ],
};
