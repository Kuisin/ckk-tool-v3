/**
 * 指示書の打ち切り（仕掛品の再設計 PR 6 — #987）— 承認設定に段があるとき。
 *
 *   1. 管理者が承認設定（MS0B）で「指示書の打ち切り」に 1 段を足す（画面から）
 *   2. 担当者が進行中の指示書 #9001 の打ち切りを申請する → 保留される
 *      （指示書は進行中のまま・在庫は動かない・同じ指示書に 2 本目は出せない）
 *   3. 承認者が承認する → その場で適用され、品が仕掛品として在庫へ戻る
 *
 * 準備: fixtures/wip-work-order-9001.sql。段が無い場合は wip-abort-return、
 * 「承認を待つ間に工程が進むと適用されない（FAILED）」は e2e-wip-abort.ts が見る。
 */

import type { Scenario } from "./types";

const WO = 9001;
const REASON = "図面変更のため（シナリオ・承認あり）";

const woState = `select status||'|'||(aborted_at is not null) from app.work_orders where work_order_number = ${WO}`;
const abortStatus = `select coalesce(string_agg(x.status, ',' order by x.requested_at), '') from app.work_order_aborts x
                       join app.work_orders w on w.id = x.work_order_id where w.work_order_number = ${WO}`;
const approvalStatus = `select coalesce(string_agg(a.status::text||':'||a.step_no||'/'||a.step_count, ','), '') from app.approval_requests a
                         where a.target_type = 'work_order_aborts'`;
const lotWip = `select coalesce(string_agg(i.quantity::int||'|'||array_to_string(st.step_ids, ',')||'|'||i.aimed_item_id||'|'||
                         coalesce(i.finished_diameter_mm::float::text,'-')||'x'||coalesce(i.finished_length_mm::float::text,'-'),
                       ' ; ' order by i.quantity desc), '')
                  from app.item_inventory i join app.wip_states st on st.id = i.wip_state_id
                 where i.lot_number = ${WO} and i.quantity > 0`;

export const wipAbortApproval: Scenario = {
  id: "wip-abort-approval",
  title: "指示書の打ち切り — 承認の段あり: 申請は保留され、承認で適用される",
  feature: "仕掛品の再設計 (#978–#989)",
  user: "admin",
  fixtures: ["scenarios/fixtures/wip-work-order-9001.sql"],
  steps: [
    {
      caption: "管理者が承認設定（MS0B）を開く —「指示書の打ち切り」は書類種別の 1 つで、はじめは承認なし",
      run: async (s) => {
        const p = s.page;
        await s.goto("/master/approval-settings");
        await s.see("指示書の打ち切り");
        const link = p.locator('a[href="/master/approval-settings/flows/work_order_aborts"]').first();
        s.check("「指示書の打ち切り」の行に設定への入口がある", (await link.count()) === 1);
        s.check("はじめは段が無い（承認なし = 申請と同時に適用）", s.sql("select count(*) from app.approval_flow_steps where target_type = 'work_order_aborts'") === "0");
        await link.scrollIntoViewIfNeeded();
        await s.shot("承認設定の一覧（指示書の打ち切り = 承認なし）");
        await s.click(link);
        await s.see("指示書の打ち切りの承認フロー");
      },
    },
    {
      caption: "「段を追加」→ 承認グループに「第一承認グループ（デモ）」を選んで保存する",
      run: async (s) => {
        const p = s.page;
        await s.click(p.getByRole("button", { name: "段を追加" }));
        await s.pick(p.getByRole("combobox", { name: /承認グループ/ }).first(), /第一承認グループ（デモ）/);
        await s.shot("打ち切りの承認フロー（1 段を足したところ）");
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(/\/master\/approval-settings(\?|$)/);
        const flow = s.sql(
          `select string_agg(f.step_no||':'||(g.name->>'ja')||':'||f.mode, ',' order by f.step_no)
             from app.approval_flow_steps f join app.approval_groups g on g.id = f.group_id where f.target_type = 'work_order_aborts'`,
        );
        s.check("台帳: 指示書の打ち切りに 1 段（第一承認グループ・いずれか 1 名）が入る", flow === "1:第一承認グループ（デモ）:ANY", flow);
        const card = p.locator('a[href="/master/approval-settings/flows/work_order_aborts"]').first();
        await card.scrollIntoViewIfNeeded();
        const main = (await p.locator("main").innerText()).replace(/\s+/g, " ");
        const section = main.slice(main.lastIndexOf("指示書の打ち切り"));
        s.check(
          "一覧の「指示書の打ち切り」が 承認なし ではなくなり、第一承認グループ（デモ）の 1 段が出る",
          !section.startsWith("指示書の打ち切り 承認なし") && section.includes("第一承認グループ（デモ）"),
          section.slice(0, 260),
        );
      },
    },
    {
      caption: "担当者が進行中の指示書 #9001 の打ち切りを申請する（戻す数 51・仕上がり φ5.95 × 60・理由）— ここからは担当者の画面",
      run: async (s) => {
        const p = s.page;
        await s.switchUser("staff", `/production/work-orders/${WO}`);
        await s.see("進行中");
        await s.menu("打ち切り");
        const dialog = p.getByRole("dialog");
        await dialog.getByText("指示書の打ち切り").first().waitFor();
        await s.fill(dialog.getByRole("textbox", { name: /仕上がり径/ }), "5.95");
        await s.fill(dialog.getByRole("textbox", { name: /仕上がり長/ }), "60");
        await s.fill(dialog.getByLabel(/打ち切りの理由/), REASON);
        await s.shot("打ち切りの申請フォーム（全数 51 本を戻す）");
        await s.clickInDialog("打ち切る");
        await s.toast("打ち切りを申請しました");
        s.check("台帳: 申請は PENDING・承認依頼は 1/1 段で PENDING", s.sql(abortStatus) === "PENDING" && s.sql(approvalStatus) === "PENDING:1/1", `${s.sql(abortStatus)} / ${s.sql(approvalStatus)}`);
        s.check("台帳: 指示書は進行中のまま・在庫は動かない", s.sql(woState) === "IN_PROGRESS|false" && s.sql(lotWip) === "", `${s.sql(woState)} / ${s.sql(lotWip)}`);
      },
    },
    {
      caption: "申請した担当者の画面 —「打ち切り承認依頼中」と出て、承認ボタンは無い。同じ指示書に 2 本目の申請は出せない",
      run: async (s) => {
        const p = s.page;
        await s.goto(`/production/work-orders/${WO}`);
        await s.see("打ち切り承認依頼中");
        const body = (await p.locator("main").innerText()).replace(/\s+/g, " ");
        s.check("カードに理由と 戻す数 51 本 / 廃棄 0 本・「承認されるまで指示書は進行中のまま」が出る", body.includes(REASON) && /仕掛品として戻す数 51 本 \/ 廃棄 0 本/.test(body) && body.includes("承認されるまで指示書は進行中のままです"), body.slice(0, 400));
        s.check("担当者（承認グループに居ない）には承認ボタンが出ない", (await p.getByRole("button", { name: "承認", exact: true }).count()) === 0);
        await s.click(p.getByRole("button", { name: "操作メニュー" }).first());
        const item = p.getByRole("menuitem", { name: "打ち切り" });
        const blocked = (await item.count()) === 0 || (await item.isDisabled());
        await s.shot("承認依頼中の操作メニュー");
        s.check("承認依頼中は「打ち切り」をもう一度出せない", blocked, (await item.count()) ? (await item.innerText()).replace(/\s+/g, " ") : "メニューに無い");
        await p.keyboard.press("Escape");
      },
    },
    {
      caption: "承認者が承認する — 未処理一覧に載り、指示書の最上部に「打ち切りの承認」カードが出る（ここからは承認者の画面）",
      run: async (s) => {
        const p = s.page;
        await s.switchUser("approver", "/general/tasks");
        await s.click(p.getByRole("tab", { name: /承認依頼中/ }));
        await p.waitForTimeout(600);
        const tasks = (await p.getByRole("tabpanel").innerText()).replace(/\s+/g, " ");
        s.check("未処理一覧（CM01）の「承認依頼中」に指示書の打ち切りの承認依頼が載る", tasks.includes("打ち切り"), tasks.slice(0, 700));
        await s.shot("承認者の未処理一覧");
        await s.goto(`/production/work-orders/${WO}`);
        await s.see("打ち切りの承認");
        s.check("承認・差し戻しのボタンが出る", (await p.getByRole("button", { name: "承認", exact: true }).count()) > 0 && (await p.getByRole("button", { name: "差し戻し" }).count()) > 0);
        await s.shot("打ち切りの承認カード（承認者）");
        await s.click(p.getByRole("button", { name: "承認", exact: true }).first());
        await s.see("打ち切り済み");
        s.check("台帳: 申請は APPLIED・承認依頼は APPROVED・指示書は CANCELLED + aborted_at", s.sql(abortStatus) === "APPLIED" && s.sql(approvalStatus) === "APPROVED:1/1" && s.sql(woState) === "CANCELLED|true", `${s.sql(abortStatus)} / ${s.sql(approvalStatus)} / ${s.sql(woState)}`);
        const record = s.sql(
          `select coalesce(string_agg(u.username||':'||r.action, ','), '') from app.approval_records r
             join app.approval_requests a on a.id = r.approval_request_id join app.users u on u.id = r.approver_id
            where a.target_type = 'work_order_aborts'`,
        );
        s.check("台帳: 承認記録に承認者（demo_shot）が残る", record === "demo_shot:APPROVED", record);
      },
    },
    {
      caption: "適用の結果 — 51 本が ロット 9001・加工状態 [切断, センタレス]・仕上がり φ5.95 × 60 の仕掛品として在庫に入り、仕掛品タブに出る",
      run: async (s) => {
        const p = s.page;
        const wip = s.sql(lotWip);
        s.check("仕掛品: 51 本・加工状態 [5, 6]・目標製品 9001・仕上がり 5.95 × 60（+ 切断の半製品 2 本が未加工で入る）", wip === "51|5,6|9001|5.95x60 ; 2||9001|6x60", wip);
        const body = (await p.locator("main").innerText()).replace(/\s+/g, " ");
        s.check("詳細のカードに 理由・戻した数 51 本 / 廃棄 0 本 が出る", body.includes(REASON) && /仕掛品として戻した数 51 本 \/ 廃棄 0 本/.test(body), body.slice(0, 400));
        await s.goto("/inventory?tab=wip");
        await p.locator("tr[data-wip-row]").first().waitFor();
        const id = s.sql(`select i.id from app.item_inventory i where i.lot_number = ${WO} and i.quantity = 51 and i.wip_state_id is not null`);
        const row = (await p.locator(`tr[data-wip-row="${id}"]`).innerText().catch(() => "")).replace(/\s+/g, " ");
        s.check(
          "仕掛品タブの行: 切断 › センタレス / φ5.95 × 60 / 数量 51・予約 0・利用可能 51 / ロット 9001",
          /切断\s*›\s*センタレス/.test(row) && /φ5\.95 × 60 51 0 51 /.test(row) && row.includes("9001"),
          row,
        );
      },
    },
  ],
};
