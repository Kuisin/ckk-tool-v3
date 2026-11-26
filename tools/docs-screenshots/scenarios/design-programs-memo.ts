/**
 * 設計図 PD06 — 加工プログラム（版ごと）と系列メモ（#972）。
 *
 * 製品 9001（超硬エンドミル φ6×60）の系列:
 *   汎用（v1・v2 確定）/ デモ商事（v1 確定 + **v2 下書き** ← fixtures）/ 兼房（v1 確定 ← fixtures）
 * 指示書 #9001 の顧客はデモ商事なので、工程画面はデモ商事の系列の確定済み最新を見る。
 *
 * 流れ: 下書きの v2 に加工プログラムを 2 本（機械が違う）→ 系列メモ → v2 を確定 →
 *       #9001 の工程実行画面に、その工程のプログラムが機械一致を先頭にして出る。
 * 系列メモは製品の画面だけでなく、版の詳細（書ける）・Web の工程実行画面と
 * 共有端末の工程画面（読むだけ）にも出る — 指示書が見る系列はプログラムと同じ規則。
 * ファイルは上げない（この環境にオブジェクトストレージが無い）。
 */

import type { Locator } from "@playwright/test";
import type { Scn } from "./scn";
import type { Scenario } from "./types";

const ITEM = 9001;
const DEMO = "d0000000-0000-4000-8000-000000000001";
const DRAFT_V2 = "d9000000-0000-4000-8000-0000000000a2";
const DEMO_V1 = "d9000000-0000-4000-8000-000000000003";
const STEP_MACHINING = "dc011000-0000-4000-8000-000000000004"; // #9001 段加工（計画・実績 = NC-01）
const STEP_INSPECTION = "dc011000-0000-4000-8000-000000000005"; // #9001 段加工検査
const STEP_CUTTING = "dc011000-0000-4000-8000-000000000002"; // #9001 切断

const MEMO = "デモ商事向けは首下の逃がしを 0.05 深めに。刃先は出荷前に全数ルーペ確認";

/** 全高で撮る前に上へ戻す（固定ヘッダーが途中に写り込まないように）。 */
async function top(s: Scn): Promise<void> {
  await s.page.evaluate(() => window.scrollTo(0, 0));
}

/** 「加工プログラム」の枠（閲覧 ⇄ 編集のパネル）。 */
function programsPanel(s: Scn): Locator {
  return s.page
    .locator(".mantine-Paper-root")
    .filter({ has: s.page.getByText("この版から起こした加工プログラム", { exact: false }) })
    .last();
}

/** 閲覧モードのプログラムのカード（上から順）の文字。 */
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

export const designProgramsMemo: Scenario = {
  id: "design-programs-memo",
  title: "設計図 — 加工プログラム（版ごと）と系列メモ、工程実行画面への表示",
  feature: "E 加工プログラム・系列メモ (#972)",
  user: "staff",
  kiosk: true,
  fixtures: ["scenarios/fixtures/design-programs-memo.sql"],
  steps: [
    {
      caption: "設計図 (PD06) で製品を開き、デモ商事の系列の下書き v2 を開く — 加工プログラムの枠は閲覧で開く",
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
        s.check("閲覧で開く — 入力欄は出ておらず「編集」ボタンがある", (await panel.getByRole("textbox").count()) === 0 && (await panel.getByRole("button", { name: "編集", exact: true }).count()) === 1, { textbox: await panel.getByRole("textbox").count(), edit: await panel.getByRole("button", { name: "編集", exact: true }).count() });
        await top(s);
      },
    },
    {
      caption: "「編集」→ プログラムを追加 — 名前・工程が空のまま保存すると止まる",
      run: async (s) => {
        const panel = programsPanel(s);
        await s.click(panel.getByRole("button", { name: "編集", exact: true }));
        await s.click(panel.getByRole("button", { name: "プログラムを追加" }));
        await panel.getByRole("textbox", { name: "プログラム名" }).waitFor({ state: "visible" });
        await s.click(panel.getByRole("button", { name: "保存", exact: true }));
        const nameErr = await panel.getByText("プログラム名を入力してください").count();
        const stepErr = await panel.getByText("工程を選択してください").count();
        s.check("「プログラム名を入力してください」が出る", nameErr === 1, nameErr);
        s.check("「工程を選択してください」が出る", stepErr === 1, stepErr);
        const saved = s.sql(`select count(*) from app.design_programs where design_version_id = '${DRAFT_V2}'`);
        s.check("保存されていない（DB に 0 本）", saved === "0", saved);
        await panel.getByRole("textbox", { name: "プログラム名" }).scrollIntoViewIfNeeded();
        await top(s);
      },
    },
    {
      caption: "1 本目（マシニング 1号機・段加工 + 段加工検査の 2 工程）と 2 本目（NC旋盤 1号機・段加工）を入れて保存 — 閲覧に戻る",
      run: async (s) => {
        const p = s.page;
        const panel = programsPanel(s);
        // 1 本目 — 1 本が複数の工程を受け持つ。
        await s.fill(panel.getByRole("textbox", { name: "プログラム名" }).nth(0), "段加工 荒取り（マシニング）");
        await s.fill(panel.getByRole("textbox", { name: "プログラム番号" }).nth(0), "O2001");
        await s.pick(panel.getByRole("combobox", { name: "機械（作業場所）" }).nth(0), "切削エリア / マシニング 1号機", { exact: true });
        const steps0 = panel.getByRole("combobox", { name: "工程", exact: true }).nth(0);
        await s.pick(steps0, "STEP_MACHINING 段加工", { search: "段加工", exact: true });
        await s.pick(steps0, "STEP_INSPECTION 段加工検査", { search: "段加工検査", exact: true });
        await p.keyboard.press("Escape");
        // 2 本目 — 別の作業場所（= 機械）。
        await s.click(panel.getByRole("button", { name: "プログラムを追加" }));
        await s.fill(panel.getByRole("textbox", { name: "プログラム名" }).nth(1), "段加工 仕上げ（NC旋盤）");
        await s.fill(panel.getByRole("textbox", { name: "プログラム番号" }).nth(1), "O1001");
        await s.pick(panel.getByRole("combobox", { name: "機械（作業場所）" }).nth(1), "切削エリア / NC旋盤 1号機", { exact: true });
        await s.pick(panel.getByRole("combobox", { name: "工程", exact: true }).nth(1), "STEP_MACHINING 段加工", { search: "段加工", exact: true });
        await p.keyboard.press("Escape");
        await s.fill(panel.getByRole("textbox", { name: "備考" }).nth(1), "主軸 3000rpm。首下は客先指定の寸法に注意");
        await top(s);
        await s.shot("加工プログラム 2 本を入力（保存前）");

        await s.click(panel.getByRole("button", { name: "保存", exact: true }));
        await s.toast("保存しました");
        await panel.getByRole("button", { name: "編集", exact: true }).waitFor({ state: "visible", timeout: 20_000 });
        s.check("保存すると閲覧に戻る（入力欄が消える）", (await panel.getByRole("textbox").count()) === 0, await panel.getByRole("textbox").count());
        await panel.getByText("段加工 仕上げ（NC旋盤）").waitFor({ state: "visible", timeout: 20_000 });
        const cards = await programCards(panel);
        s.check("閲覧に 2 本並ぶ（入れた順）", cards.length === 2 && cards[0].startsWith("段加工 荒取り（マシニング）") && cards[1].startsWith("段加工 仕上げ（NC旋盤）"), cards);
        s.check("1 本目: 番号 O2001・機械 マシニング 1号機・工程 2 つ・ファイルなし", /O2001/.test(cards[0] ?? "") && /機械（作業場所）: マシニング 1号機/.test(cards[0] ?? "") && /段加工\s?段加工検査/.test(cards[0] ?? "") && /ファイルなし/.test(cards[0] ?? ""), cards[0]);
        s.check("2 本目: 番号 O1001・機械 NC旋盤 1号機・備考つき", /O1001/.test(cards[1] ?? "") && /機械（作業場所）: NC旋盤 1号機/.test(cards[1] ?? "") && /主軸 3000rpm/.test(cards[1] ?? ""), cards[1]);

        const db = s.sqlRows(
          `select p.sort_order || '|' || p.name || '|' || coalesce(p.program_number, '') || '|' || coalesce(wl.code, '-') || '|' ||
                  (select string_agg(c.code, '+' order by c.sort_order) from app.design_program_steps ps join app.process_step_catalog c on c.id = ps.process_step_id where ps.program_id = p.id) || '|' ||
                  (p.file_id is null)
             from app.design_programs p left join app.work_locations wl on wl.id = p.work_location_id
            where p.design_version_id = '${DRAFT_V2}' order by p.sort_order`,
        );
        s.check(
          "DB: 2 本・工程の受け持ち（1 本目 = 2 工程 / 2 本目 = 1 工程）・ファイルなし",
          db.join(" / ") === "0|段加工 荒取り（マシニング）|O2001|MC-01|STEP_MACHINING+STEP_INSPECTION|true / 1|段加工 仕上げ（NC旋盤）|O1001|NC-01|STEP_MACHINING|true",
          db,
        );
        // 履歴に保存の記録が残る。
        await p.reload();
        await s.see("加工プログラムを保存", { exact: false });
        await s.checkVisible("履歴に「v2 の加工プログラムを保存（2 本）」", "v2 の加工プログラムを保存（2 本）", { wait: 5_000 });
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

        await top(s);
      },
    },
    {
      caption: "版の詳細（v1 / v2）にも同じ系列メモが出て、そこからも書ける — 汎用の版には出ない",
      run: async (s) => {
        const p = s.page;
        /** 版の詳細の「系列メモ」の枠。 */
        const seriesPanel = () => p.locator("[data-series-memo]");
        await s.goto(`/production/design-files/versions/${DEMO_V1}`);
        await s.see("手続き状況");
        await seriesPanel().scrollIntoViewIfNeeded();
        s.check("確定済みの v1: 系列メモの枠に同じメモが出る", (await seriesPanel().getByText(MEMO).count()) === 1, await seriesPanel().innerText().catch(() => "枠が無い"));
        s.check("確定済みの版でも系列メモは書ける（凍るのは図面の中身だけ）— 編集のアイコンがある", (await seriesPanel().getByRole("button", { name: "編集" }).count()) === 1, await seriesPanel().getByRole("button").count());
        await s.shot("版の詳細（デモ商事 v1）— 系列メモ");

        await s.goto(`/production/design-files/versions/${DRAFT_V2}`);
        await s.see("手続き状況");
        s.check("下書きの v2: 同じメモが出る（版をまたいで 1 件）", (await seriesPanel().getByText(MEMO).count()) === 1, await seriesPanel().innerText().catch(() => "枠が無い"));

        // 版の詳細から書き直すと、製品の画面の系列の枠にも同じ内容が出る（同じ 1 件）。
        const added = "（版の詳細から追記）";
        await s.click(seriesPanel().getByRole("button", { name: "編集" }));
        const editor = seriesPanel().locator(".ProseMirror");
        await editor.waitFor({ state: "visible", timeout: 20_000 });
        await editor.click();
        await p.keyboard.press("ControlOrMeta+a");
        await p.keyboard.type(MEMO + added);
        await s.click(seriesPanel().getByRole("button", { name: "保存", exact: true }));
        await s.toast("メモを更新しました");
        const rows = s.sqlRows(`select plain_text from app.document_memos where owner_type = 'design_series' and owner_id = '${ITEM}:${DEMO}'`);
        s.check("DB: 系列メモは 1 件のまま、追記が入る", rows.length === 1 && rows[0].includes(added), rows);
        await s.goto(`/production/design-files/${ITEM}?series=${DEMO}`);
        await s.see("系列メモ");
        await s.checkVisible("製品の画面（デモ商事の系列の枠）にも追記が出る", added, { exact: false });

        const generic = s.sql(`select id from app.design_versions where item_id = ${ITEM} and customer_bp_id is null order by version desc limit 1`);
        await s.goto(`/production/design-files/versions/${generic}`);
        await s.see("手続き状況");
        s.check("汎用の版: 系列メモの枠はあるが、デモ商事のメモは出ない", (await seriesPanel().count()) === 1 && (await p.getByText(MEMO).count()) === 0 && (await seriesPanel().getByText("メモはまだありません").count()) === 1, { panel: await seriesPanel().count(), memo: await p.getByText(MEMO).count() });
        await top(s);
      },
    },
    {
      caption: "下書きの v2 を確定する — 確定後は加工プログラムを直せない（編集ボタンが消える）",
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
        const panel = programsPanel(s);
        await panel.scrollIntoViewIfNeeded();
        // 確定の通知が出てから画面が描き直されるまでに一拍ある。編集ボタンが消えるのを待つ。
        await panel.getByRole("button", { name: "編集", exact: true }).waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
        s.check("確定後: 加工プログラムの枠に「編集」が無い", (await panel.getByRole("button", { name: "編集", exact: true }).count()) === 0, await panel.getByRole("button").allInnerTexts());
        s.check("確定後もプログラム 2 本は読める", (await programCards(panel)).length === 2, await programCards(panel));
        await top(s);
      },
    },
    {
      caption: "指示書 #9001 の工程実行画面（段加工）— その工程のプログラムが出て、作業場所（NC旋盤 1号機）と同じ機械のものが先頭",
      run: async (s) => {
        const p = s.page;
        await s.goto(`/production/work-orders/9001/steps/${STEP_MACHINING}`);
        await s.see("作業計画");
        const plan = s.sql(
          `select (select string_agg(distinct wl.code, ',') from app.work_order_step_plans pl join app.work_locations wl on wl.id = pl.work_location_id where pl.work_order_step_id = '${STEP_MACHINING}')
                  || '|' ||
                  (select string_agg(distinct wl.code, ',') from app.work_order_step_actuals a join app.work_locations wl on wl.id = a.work_location_id where a.work_order_step_id = '${STEP_MACHINING}')`,
        );
        s.check("前提: この工程の計画・実績の作業場所は NC-01", plan === "NC-01|NC-01", plan);
        const panel = stepProgramsPanel(s);
        await panel.waitFor({ state: "visible", timeout: 20_000 });
        await panel.scrollIntoViewIfNeeded();
        const cards = await programCards(panel);
        s.check("加工プログラムが 2 本出る", cards.length === 2, cards);
        s.check("先頭は NC旋盤 1号機 用（登録順では 2 本目）—「この機械用」の印つき", /^段加工 仕上げ（NC旋盤）/.test(cards[0] ?? "") && /この機械用/.test(cards[0] ?? ""), cards[0]);
        s.check("2 本目は マシニング 1号機 用 — 印なし", /^段加工 荒取り（マシニング）/.test(cards[1] ?? "") && !/この機械用/.test(cards[1] ?? ""), cards[1]);
        const link = panel.getByRole("link", { name: "設計図 v2" });
        s.check("どの版のプログラムかが出る（設計図 v2 へのリンク）", (await link.count()) === 1 && ((await link.getAttribute("href").catch(() => "")) ?? "").endsWith(DRAFT_V2), await panel.getByRole("link").allInnerTexts());
        await top(s);
        await s.shot("段加工 の工程実行画面 — 加工プログラム（機械一致が先頭）");

        // 別の工程: 段加工検査 は 1 本目だけが受け持つ。切断 はどれも受け持たない。
        await s.goto(`/production/work-orders/9001/steps/${STEP_INSPECTION}`);
        await s.see("作業計画");
        const insp = await programCards(stepProgramsPanel(s));
        s.check("段加工検査: 受け持つ 1 本（荒取り）だけが出る・機械一致の印なし", insp.length === 1 && /^段加工 荒取り（マシニング）/.test(insp[0]) && !/この機械用/.test(insp[0]), insp);
        await top(s);
        await s.shot("段加工検査 の工程実行画面 — 受け持つ 1 本だけ");
        await s.goto(`/production/work-orders/9001/steps/${STEP_CUTTING}`);
        await s.see("作業計画");
        s.check("切断: 受け持つプログラムが無いので枠ごと出ない", (await p.getByRole("heading", { name: "加工プログラム", exact: true }).count()) === 0, await p.getByRole("heading", { name: "加工プログラム", exact: true }).count());
        await top(s);
      },
    },
    {
      caption: "工程実行画面（Web・共有端末）に系列メモが読むだけで出る — 指示書の顧客（デモ商事）の系列のもの",
      run: async (s) => {
        const p = s.page;
        const seriesPanel = p.locator("[data-series-memo]");
        await s.goto(`/production/work-orders/9001/steps/${STEP_MACHINING}`);
        await s.see("作業計画");
        await seriesPanel.waitFor({ state: "visible", timeout: 20_000 });
        await seriesPanel.scrollIntoViewIfNeeded();
        const text = (await seriesPanel.innerText()).replace(/\s+/g, " ");
        s.check("Web の工程画面: 系列メモの枠にデモ商事の系列のメモが出る", text.includes("系列メモ") && text.includes(MEMO) && text.includes("デモ商事株式会社"), text);
        s.check("読むだけ — 編集のボタンも入力欄も無い", (await seriesPanel.getByRole("button").count()) === 0 && (await seriesPanel.locator(".ProseMirror").count()) === 0, await seriesPanel.getByRole("button").count());
        const link = seriesPanel.getByRole("link", { name: "設計図で開く" });
        const href = (await link.getAttribute("href").catch(() => "")) ?? "";
        s.check("書き直し先（設計図のデモ商事の系列）へのリンク", href === `/production/design-files/${ITEM}?series=${DEMO}#series-${DEMO}`, href);
        await s.shot("Web の工程実行画面 — 系列メモ（読むだけ）");

        // 切断の工程にもプログラムは無いが、系列メモは指示書の図面ごとなので出る。
        await s.goto(`/production/work-orders/9001/steps/${STEP_CUTTING}`);
        await s.see("作業計画");
        s.check("プログラムの無い工程（切断）でも系列メモは出る", (await p.locator("[data-series-memo]").getByText(MEMO).count()) === 1, await p.locator("[data-series-memo]").count());

        // 共有端末の工程画面。
        const kiosk = await s.openKiosk(`/steps/${STEP_MACHINING}?from=wo`);
        const kPanel = kiosk.locator("[data-series-memo]");
        await kPanel.waitFor({ state: "visible", timeout: 20_000 });
        const kText = (await kPanel.innerText()).replace(/\s+/g, " ");
        s.check("共有端末の工程画面: 系列メモ（デモ商事の系列）が出る", kText.includes("系列メモ") && kText.includes(MEMO) && kText.includes("デモ商事株式会社"), kText);
        s.check("共有端末: 読むだけ（ボタンなし）", (await kPanel.getByRole("button").count()) === 0, await kPanel.getByRole("button").count());
        await kPanel.scrollIntoViewIfNeeded();
        await s.shot("共有端末の工程画面 — 系列メモ", kiosk);
        await kiosk.close();
      },
    },
  ],
};
