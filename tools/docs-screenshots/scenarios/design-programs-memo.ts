/**
 * 設計図 PD06 — 加工プログラム（版ごと・機種に当てる）と系列メモ（#972 → 機種）。
 *
 * 製品 9001（超硬エンドミル φ6×60）の系列:
 *   汎用（v1・v2 確定）/ デモ商事（v1 確定 + **v2 下書き** ← fixtures）/ 兼房（v1 確定 ← fixtures）
 * 指示書 #9001 の顧客はデモ商事なので、工程画面はデモ商事の系列の確定済み最新を見る。
 *
 * 流れ: 下書きの v2 に加工プログラムを 2 本（機種が違う）→ 系列メモ → v2 を確定 →
 *       確定後もプログラムの枠は操作できる（図面の確定とは独立）→
 *       #9001 の工程実行画面に、その工程のプログラムが機種一致を先頭にして出る。
 * 承認設定（MS0B）の「加工プログラムの変更」は段なし = 申請と同時に反映。
 * 段あり・使用済みの版・新しい版は design-program-versions が見る。
 * ファイルは上げない（この環境にオブジェクトストレージが無い）。
 */

import type { Locator } from "@playwright/test";
import type { Scn } from "./scn";
import type { Scenario } from "./types";

const ITEM = 9001;
const DEMO = "d0000000-0000-4000-8000-000000000001";
const DRAFT_V2 = "d9000000-0000-4000-8000-0000000000a2";
const DEMO_V1 = "d9000000-0000-4000-8000-000000000003";
const STEP_MACHINING = "dc011000-0000-4000-8000-000000000004"; // #9001 段加工（計画・実績 = NC-01 = NC旋盤 A型）
const STEP_INSPECTION = "dc011000-0000-4000-8000-000000000005"; // #9001 段加工検査
const STEP_CUTTING = "dc011000-0000-4000-8000-000000000002"; // #9001 切断

const MEMO = "デモ商事向けは首下の逃がしを 0.05 深めに。刃先は出荷前に全数ルーペ確認";

/** 全高で撮る前に上へ戻す（固定ヘッダーが途中に写り込まないように）。 */
async function top(s: Scn): Promise<void> {
  await s.page.evaluate(() => window.scrollTo(0, 0));
}

/** 「加工プログラム」の枠。 */
function programsPanel(s: Scn): Locator {
  return s.page
    .locator(".mantine-Paper-root")
    .filter({ has: s.page.getByText("この版から起こした加工プログラム", { exact: false }) })
    .last();
}

/** 閲覧のプログラムのカード（上から順）の文字。 */
async function programCards(scope: Locator): Promise<string[]> {
  const cards = await scope.locator(".mantine-SimpleGrid-root > .mantine-Paper-root").allInnerTexts();
  return cards.map((c) => c.replace(/\s+/g, " ").trim());
}

/** 工程実行画面の「加工プログラム」の枠。 */
function stepProgramsPanel(s: Scn): Locator {
  return s.page
    .locator(".mantine-Paper-root")
    .filter({ has: s.page.getByRole("heading", { name: "加工プログラム", exact: true }) })
    .last();
}

/** 申請モーダルに 1 本ぶんを入れる。 */
async function fillProgram(
  s: Scn,
  v: { name: string; number: string; model: string; steps: [string, string][]; notes?: string },
): Promise<void> {
  const dlg = s.page.getByRole("dialog");
  await s.fill(dlg.getByRole("textbox", { name: "プログラム名" }), v.name);
  await s.fill(dlg.getByRole("textbox", { name: "プログラム番号" }), v.number);
  await s.pick(dlg.getByRole("combobox", { name: "機種", exact: true }), v.model, { exact: true });
  await s.page.keyboard.press("Escape");
  const steps = dlg.getByRole("combobox", { name: "工程", exact: true });
  for (const [label, search] of v.steps) await s.pick(steps, label, { search, exact: true });
  await s.page.keyboard.press("Escape");
  if (v.notes) await s.fill(dlg.getByRole("textbox", { name: "備考" }), v.notes);
}

export const designProgramsMemo: Scenario = {
  id: "design-programs-memo",
  title: "設計図 — 加工プログラム（機種に当てる）と系列メモ、工程実行画面への表示",
  feature: "E 加工プログラム・系列メモ (#972) / 機種",
  user: "staff",
  fixtures: ["scenarios/fixtures/design-programs-memo.sql"],
  steps: [
    {
      caption: "設計図 (PD06) で製品を開き、デモ商事の系列の下書き v2 を開く — 加工プログラムの枠は閲覧の形で、追加は「プログラムを追加」から",
      run: async (s) => {
        const p = s.page;
        await s.goto(`/production/design-files/${ITEM}`);
        await s.see("系列メモ");
        s.check("系列が 3 本（汎用・デモ商事・兼房）— 系列メモの枠も 3 つ", (await p.getByText("系列メモ", { exact: true }).count()) === 3, await p.getByText("系列メモ", { exact: true }).count());
        await top(s);
        await s.shot("製品の設計図 — 系列ごとに版と系列メモ");
        await s.goto(`/production/design-files/${ITEM}?series=${DEMO}`);
        await s.see("デモ商事株式会社");
        s.check("受注元で絞ると系列は 1 本", (await p.getByText("系列メモ", { exact: true }).count()) === 1, await p.getByText("系列メモ", { exact: true }).count());
        await s.click(p.getByRole("button", { name: "v2 を開く" }));
        await s.waitForUrl(new RegExp(`/production/design-files/versions/${DRAFT_V2}`));
        await s.see("確定待ちの下書きです");

        const panel = programsPanel(s);
        await panel.scrollIntoViewIfNeeded();
        s.check("加工プログラムの枠に「加工プログラムはありません」", (await panel.getByText("加工プログラムはありません").count()) === 1, await panel.innerText());
        s.check("閲覧の形 — 入力欄は無く「プログラムを追加」ボタンがある", (await panel.getByRole("textbox").count()) === 0 && (await panel.getByRole("button", { name: "プログラムを追加" }).count()) === 1, { textbox: await panel.getByRole("textbox").count(), add: await panel.getByRole("button", { name: "プログラムを追加" }).count() });
        const flow = s.sql("select count(*) from app.approval_flow_steps where target_type = 'design_program_changes'");
        s.check("前提: 承認設定「加工プログラムの変更」は段なし（= 申請と同時に反映）", flow === "0", flow);
        await top(s);
      },
    },
    {
      caption: "「プログラムを追加」— 名前・工程が空のまま申請すると止まる（何も記録されない）",
      run: async (s) => {
        const panel = programsPanel(s);
        await s.click(panel.getByRole("button", { name: "プログラムを追加" }));
        const dlg = s.page.getByRole("dialog");
        await dlg.getByRole("textbox", { name: "プログラム名" }).waitFor({ state: "visible" });
        await s.click(dlg.getByRole("button", { name: "申請する" }));
        const nameErr = await dlg.getByText("プログラム名を入力してください").count();
        const stepErr = await dlg.getByText("工程を選択してください").count();
        s.check("「プログラム名を入力してください」が出る", nameErr === 1, nameErr);
        s.check("「工程を選択してください」が出る", stepErr === 1, stepErr);
        const saved = s.sql(`select (select count(*) from app.design_programs where design_version_id = '${DRAFT_V2}') || '/' || (select count(*) from app.design_program_changes)`);
        s.check("保存されていない（プログラム 0 本・申請 0 件）", saved === "0/0", saved);
        await s.shot("追加のモーダル（空のまま申請）");
      },
    },
    {
      caption: "1 本目（マシニング V5・段加工 + 段加工検査の 2 工程）と 2 本目（NC旋盤 A型・段加工）を申請 — 段なしなのでその場で反映",
      run: async (s) => {
        const p = s.page;
        const panel = programsPanel(s);
        // 1 本目 — 1 本が複数の工程を受け持つ。（モーダルは開いたまま）
        await fillProgram(s, {
          name: "段加工 荒取り（マシニング）",
          number: "O2001",
          model: "マシニング V5（MC-V5）",
          steps: [["STEP_MACHINING 段加工", "段加工"], ["STEP_INSPECTION 段加工検査", "段加工検査"]],
        });
        await s.shot("1 本目を入力（申請前）");
        await s.click(p.getByRole("dialog").getByRole("button", { name: "申請する" }));
        await s.toast("反映しました");
        await panel.getByText("段加工 荒取り（マシニング）").waitFor({ state: "visible", timeout: 20_000 });

        // 2 本目 — 別の機種。
        await s.click(panel.getByRole("button", { name: "プログラムを追加" }));
        await fillProgram(s, {
          name: "段加工 仕上げ（NC旋盤）",
          number: "O1001",
          model: "NC旋盤 A型（NC-LATHE-A）",
          steps: [["STEP_MACHINING 段加工", "段加工"]],
          notes: "主軸 3000rpm。首下は客先指定の寸法に注意",
        });
        await s.click(p.getByRole("dialog").getByRole("button", { name: "申請する" }));
        await s.toast("反映しました");
        await panel.getByText("段加工 仕上げ（NC旋盤）").waitFor({ state: "visible", timeout: 20_000 });
        const cards = await programCards(panel);
        s.check("閲覧に 2 本並ぶ（入れた順）", cards.length === 2 && cards[0].startsWith("段加工 荒取り（マシニング）") && cards[1].startsWith("段加工 仕上げ（NC旋盤）"), cards);
        s.check("1 本目: v1・番号 O2001・機種 マシニング V5・工程 2 つ・未使用・ファイルなし", /v1/.test(cards[0] ?? "") && /O2001/.test(cards[0] ?? "") && /機種: マシニング V5/.test(cards[0] ?? "") && /段加工\s?段加工検査/.test(cards[0] ?? "") && /未使用/.test(cards[0] ?? "") && /ファイルなし/.test(cards[0] ?? ""), cards[0]);
        s.check("2 本目: 番号 O1001・機種 NC旋盤 A型・備考つき", /O1001/.test(cards[1] ?? "") && /機種: NC旋盤 A型/.test(cards[1] ?? "") && /主軸 3000rpm/.test(cards[1] ?? ""), cards[1]);
        s.check("未使用の版には「直す」「削除」が出る（「新しい版を作る」は出ない）", (await panel.getByRole("button", { name: "直す" }).count()) === 2 && (await panel.getByRole("button", { name: "削除" }).count()) === 2 && (await panel.getByRole("button", { name: "新しい版を作る" }).count()) === 0);

        const db = s.sqlRows(
          `select p.sort_order || '|' || p.revision || '|' || (p.program_key = p.id) || '|' || p.name || '|' || coalesce(p.program_number, '') || '|' ||
                  coalesce((select string_agg(m.code, '+' order by m.code) from app.design_program_machine_models pm join app.machine_models m on m.id = pm.machine_model_id where pm.program_id = p.id), '-') || '|' ||
                  (select string_agg(c.code, '+' order by c.sort_order) from app.design_program_steps ps join app.process_step_catalog c on c.id = ps.process_step_id where ps.program_id = p.id) || '|' ||
                  (p.file_id is null)
             from app.design_programs p
            where p.design_version_id = '${DRAFT_V2}' order by p.sort_order`,
        );
        s.check(
          "DB: 2 本とも v1・機種・工程の受け持ち（1 本目 = 2 工程 / 2 本目 = 1 工程）・ファイルなし",
          db.join(" / ") === "0|1|true|段加工 荒取り（マシニング）|O2001|MC-V5|STEP_MACHINING+STEP_INSPECTION|true / 1|1|true|段加工 仕上げ（NC旋盤）|O1001|NC-LATHE-A|STEP_MACHINING|true",
          db,
        );
        const changes = s.sql("select string_agg(kind || ':' || status, ',' order by requested_at) from app.design_program_changes");
        s.check("DB: 申請 2 件とも ADD で APPLIED（段なし = 申請と同時に反映）", changes === "ADD:APPLIED,ADD:APPLIED", changes);
        // 履歴に反映の記録が残る。
        await p.reload();
        await s.checkVisible("履歴に「設計図 v2：加工プログラム「段加工 仕上げ（NC旋盤）」の追加を反映」", "設計図 v2：加工プログラム「段加工 仕上げ（NC旋盤）」の追加を反映", { wait: 10_000 });
        await top(s);
      },
    },
    {
      caption: "系列メモを書く — デモ商事の系列（v1・v2 共通）に出て、汎用・兼房の系列には出ない",
      run: async (s) => {
        const p = s.page;
        await s.goto(`/production/design-files/${ITEM}?series=${DEMO}`);
        await s.see("系列メモ");
        await s.click(p.getByRole("button", { name: "メモを追加" }));
        const editor = p.locator(".ProseMirror").first();
        await editor.waitFor({ state: "visible", timeout: 20_000 });
        await editor.click();
        await p.keyboard.type(MEMO);
        await top(s);
        await s.shot("系列メモを入力（保存前）");
        await s.click(p.getByRole("button", { name: "保存", exact: true }).first());
        await s.toast("メモを更新しました");
        await s.see(MEMO);
        const versions = await p.getByRole("button", { name: /^v\d+ を開く$/ }).count();
        s.check("この系列の枠には v1 と v2 の両方が並び、メモは枠に 1 つ（版をまたいで共通）", versions === 2 && (await p.getByText(MEMO).count()) === 1, { versions, memo: await p.getByText(MEMO).count() });
        const owner = s.sql("select owner_type || '|' || owner_id from app.document_memos where owner_type = 'design_series'");
        s.check("DB: メモの持ち主は「品目:受注元」（版ではない）", owner === `design_series|${ITEM}:${DEMO}`, owner);
        await top(s);
        await s.shot("デモ商事の系列 — 系列メモあり");

        // ほかの系列には出ない。
        await s.goto(`/production/design-files/${ITEM}?series=generic`);
        await s.see("系列メモ");
        s.check("汎用の系列には出ない", (await p.getByText(MEMO).count()) === 0 && (await p.getByText("メモはまだありません").count()) === 1, { memo: await p.getByText(MEMO).count(), empty: await p.getByText("メモはまだありません").count() });
        const kanefusa = s.sql("select id from app.business_partners where name->>'ja' = '兼房株式会社'");
        await s.goto(`/production/design-files/${ITEM}?series=${kanefusa}`);
        await s.see("兼房株式会社");
        s.check("別の受注元（兼房）の系列には出ない", (await p.getByText(MEMO).count()) === 0 && (await p.getByText("メモはまだありません").count()) === 1, { memo: await p.getByText(MEMO).count(), empty: await p.getByText("メモはまだありません").count() });
        await top(s);
        await s.shot("兼房の系列 — 系列メモなし");

        // 版の詳細からは見えるか（合否ではなく、どこに出るかの記録）。
        await s.goto(`/production/design-files/versions/${DEMO_V1}`);
        await s.see("手続き状況");
        const onV1 = await p.getByText(MEMO).count();
        await s.goto(`/production/design-files/versions/${DRAFT_V2}`);
        await s.see("手続き状況");
        const onV2 = await p.getByText(MEMO).count();
        s.check(
          "（観察・合否なし）版の詳細画面（v1 / v2）に系列メモは出るか",
          true,
          onV1 + onV2 > 0 ? `出る（v1=${onV1} v2=${onV2}）` : "出ない — 系列メモが読めるのは製品の画面（系列の枠）だけ。版の詳細・工程実行画面・共有端末からは見えない",
        );
        await top(s);
      },
    },
    {
      caption: "下書きの v2 を確定する — 確定後も加工プログラムは足し・直しができる（図面の確定とは独立）",
      run: async (s) => {
        const p = s.page;
        // いま #9001 が見ているのは確定済みの v1（プログラムなし）。
        await s.goto(`/production/work-orders/9001/steps/${STEP_MACHINING}`);
        await s.see("作業計画");
        s.check("確定前: 工程実行画面に加工プログラムは出ない（下書きの版は使われない）", (await p.getByRole("heading", { name: "加工プログラム", exact: true }).count()) === 0, await p.getByRole("heading", { name: "加工プログラム", exact: true }).count());

        await s.goto(`/production/design-files/versions/${DRAFT_V2}`);
        await s.click(p.getByRole("button", { name: "確定", exact: true }).first());
        await top(s);
        await s.shot("確定の確認");
        await s.clickInDialog(/確定/, { exact: false });
        await s.see("確定済み", { exact: false });
        const status = s.sql(`select status from app.design_versions where id = '${DRAFT_V2}'`);
        s.check("DB: v2 が CONFIRMED", status === "CONFIRMED", status);
        await p.reload();
        const panel = programsPanel(s);
        await panel.scrollIntoViewIfNeeded();
        s.check("確定後もプログラム 2 本は読める", (await programCards(panel)).length === 2, await programCards(panel));
        s.check("確定後も「プログラムを追加」「直す」がある", (await panel.getByRole("button", { name: "プログラムを追加" }).count()) === 1 && (await panel.getByRole("button", { name: "直す" }).count()) === 2, await panel.getByRole("button").allInnerTexts());
        await top(s);
      },
    },
    {
      caption: "指示書 #9001 の工程実行画面（段加工）— その工程のプログラムが出て、機械（NC旋盤 1号機 = NC旋盤 A型）と同じ機種のものが先頭",
      run: async (s) => {
        const p = s.page;
        await s.goto(`/production/work-orders/9001/steps/${STEP_MACHINING}`);
        await s.see("作業計画");
        const plan = s.sql(
          `select (select string_agg(distinct wl.code || ':' || coalesce(m.code, '-'), ',') from app.work_order_step_plans pl join app.work_locations wl on wl.id = pl.work_location_id left join app.machine_models m on m.id = wl.machine_model_id where pl.work_order_step_id = '${STEP_MACHINING}')
                  || '|' ||
                  (select string_agg(distinct wl.code || ':' || coalesce(m.code, '-'), ',') from app.work_order_step_actuals a join app.work_locations wl on wl.id = a.work_location_id left join app.machine_models m on m.id = wl.machine_model_id where a.work_order_step_id = '${STEP_MACHINING}')`,
        );
        s.check("前提: この工程の計画・実績の機械は NC-01（機種 NC-LATHE-A）", plan === "NC-01:NC-LATHE-A|NC-01:NC-LATHE-A", plan);
        const panel = stepProgramsPanel(s);
        await panel.waitFor({ state: "visible", timeout: 20_000 });
        await panel.scrollIntoViewIfNeeded();
        const cards = await programCards(panel);
        s.check("加工プログラムが 2 本出る", cards.length === 2, cards);
        s.check("先頭は NC旋盤 A型 用（登録順では 2 本目）—「この機種用」の印つき", /^段加工 仕上げ（NC旋盤）/.test(cards[0] ?? "") && /この機種用/.test(cards[0] ?? ""), cards[0]);
        s.check("2 本目は マシニング V5 用 — 印なし", /^段加工 荒取り（マシニング）/.test(cards[1] ?? "") && !/この機種用/.test(cards[1] ?? ""), cards[1]);
        const link = panel.getByRole("link", { name: "設計図 v2" });
        s.check("どの版のプログラムかが出る（設計図 v2 へのリンク）", (await link.count()) === 1 && ((await link.getAttribute("href").catch(() => "")) ?? "").endsWith(DRAFT_V2), await panel.getByRole("link").allInnerTexts());
        await top(s);
        await s.shot("段加工 の工程実行画面 — 加工プログラム（機種一致が先頭）");

        // 別の工程: 段加工検査 は 1 本目だけが受け持つ。切断 はどれも受け持たない。
        await s.goto(`/production/work-orders/9001/steps/${STEP_INSPECTION}`);
        await s.see("作業計画");
        const insp = await programCards(stepProgramsPanel(s));
        s.check("段加工検査: 受け持つ 1 本（荒取り）だけが出る・機種一致の印なし", insp.length === 1 && /^段加工 荒取り（マシニング）/.test(insp[0]) && !/この機種用/.test(insp[0]), insp);
        await top(s);
        await s.shot("段加工検査 の工程実行画面 — 受け持つ 1 本だけ");
        await s.goto(`/production/work-orders/9001/steps/${STEP_CUTTING}`);
        await s.see("作業計画");
        s.check("切断: 受け持つプログラムが無いので枠ごと出ない", (await p.getByRole("heading", { name: "加工プログラム", exact: true }).count()) === 0, await p.getByRole("heading", { name: "加工プログラム", exact: true }).count());
        await top(s);
      },
    },
  ],
};
