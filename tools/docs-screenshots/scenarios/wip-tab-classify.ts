/**
 * 在庫管理の「仕掛品」タブ（仕掛品の再設計 PR 4 — #984）を、人が目で確かめる順に。
 *
 *   - 在庫に置いた仕掛品が 材種 / 径 / 長 → 加工状態 でまとまって出る
 *     （仕上がり寸法・目標製品・ロット・発生工程・経過日数つき）
 *   - 旧「仕掛品」タブ（進行中の指示書の工程別の数）は「工程内」に名前が変わった
 *   - 製品タブは仕掛品を出さず、「使える仕掛品 n 本」から仕掛品タブへ絞り込んで飛べる
 *   - 旧来の半製品（未分類）を「分類する」で仕掛ブランク × 加工状態へ移すと、
 *     未分類から消えて分類先に出る。数量は変わらず、入出庫伝票 1 枚に OUT + IN
 *
 * 準備: e2e-wip-draw-fixtures.sql（仕上がり寸法つきの仕掛品 3 本を足す）。
 * デモシードの 3 本（未加工 2 / 切断›センタレス›段加工 3 / 未分類 4）と合わせて 6 行。
 * チェックの厚い版は e2e-wip-stock.ts（名前付け・モバイル幅も見る）。
 */

import type { Scenario } from "./types";

/** fixtures の仕掛品: φ6×60 / [切断, センタレス, 全長合わせ] / 5 本 / 目標製品 9001。 */
const BUCKET_EXACT = "dc0f0000-0000-4000-8000-000000000001";
/** デモシードの未分類（旧来の半製品）: 製品 9002 の行のまま 4 本。 */
const LEGACY_ROW = "dc050000-0000-4000-8000-000000000007";

const WIP_TOTAL = "select coalesce(sum(quantity),0)::int from app.item_inventory where wip_state_id is not null";

export const wipTabClassify: Scenario = {
  id: "wip-tab-classify",
  title: "仕掛品タブ — 材種 × 加工状態の一覧と、未分類の分類",
  feature: "仕掛品の再設計 (#978–#989)",
  fixtures: ["e2e-wip-draw-fixtures.sql"],
  steps: [
    {
      caption: "在庫管理を開く — タブは 製品 / 素材 / 仕掛品 / 工程内 / ロケーション。仕掛品タブは材種・径・長ごとにまとまり、行は加工状態ごとに出る",
      run: async (s) => {
        const p = s.page;
        await s.goto("/inventory");
        await s.see("在庫管理");
        const tabs = (await p.getByRole("tab").allInnerTexts()).map((t) => t.trim());
        s.check("タブが 製品 / 素材 / 仕掛品 / 工程内 / ロケーション の順に並ぶ", tabs.join(",") === "製品,素材,仕掛品,工程内,ロケーション", tabs);
        await s.click(p.getByRole("tab", { name: "仕掛品" }));
        await p.locator("tr[data-wip-row]").first().waitFor();
        s.check("仕掛品タブは URL に ?tab=wip で載る", new URL(p.url()).searchParams.get("tab") === "wip", p.url());

        const table = (await p.locator("table:visible").first().innerText()).replace(/\s+/g, " ");
        s.check(
          "見出し行は 材種 — 径 × 長（φ6×60 / φ6×80 / φ8×60 の 3 つ）",
          ["φ6 × 60", "φ6 × 80", "φ8 × 60"].every((size) => table.includes(`B01A0001 — K10UF ${size}`)),
          table.slice(0, 300),
        );
        s.check(
          "列は 加工状態 / 仕上がり寸法 / 数量 / 予約 / 利用可能 / 拠点・保管場所 / ロット / 目標製品 / 発生工程 / 経過日数",
          ["加工状態", "仕上がり寸法", "数量", "予約", "利用可能", "拠点 / 保管場所", "ロット", "目標製品", "発生工程", "経過日数"].every((h) => table.includes(h)),
        );
        const exact = (await p.locator(`tr[data-wip-row="${BUCKET_EXACT}"]`).innerText()).replace(/\s+/g, " ");
        s.check(
          "加工状態は済んだ工程の並び（切断 › センタレス › 全長合わせ）、仕上がり寸法 φ6 × 60、ロット 9004、目標製品 超硬エンドミル",
          /切断\s*›\s*センタレス\s*›\s*全長合わせ/.test(exact) && exact.includes("φ6 × 60") && exact.includes("9004") && exact.includes("超硬エンドミル 4枚刃 φ6×60"),
          exact,
        );
        s.check("数量 5 / 予約 0 / 利用可能 5 が並ぶ", /φ6 × 60 5 0 5 /.test(exact), exact);
        s.check("未加工（形を変える工程が 1 つも済んでいない）の行が出る", table.includes("未加工"));
        s.check("発生工程（#指示書番号 工程名）と経過日数が出る", /#9004 段加工/.test(table) && /\d+ 日/.test(table));
        s.check("行き先を決められなかった旧来の半製品は「未分類」にまとまる", table.includes("未分類") && table.includes("行き先を決められなかった旧来の半製品です"));
      },
    },
    {
      caption: "絞り込む — 加工状態「未加工」で 1 行、目標製品で未分類の 1 行。条件は URL に載る",
      run: async (s) => {
        const p = s.page;
        const rows = p.locator("tr[data-wip-row]");
        const all = await rows.count();
        s.check("絞り込む前は 6 行（デモシード 3 + fixtures 3）", all === 6, all);
        await s.pick(p.getByRole("combobox", { name: "加工状態" }), "未加工", { exact: true });
        await p.waitForTimeout(600);
        s.check("加工状態「未加工」で 1 行になる", (await rows.count()) === 1, await rows.count());
        s.check("絞り込みが URL（?state=）に載る", new URL(p.url()).searchParams.has("state"), p.url());
        await s.shot("加工状態で絞り込んだところ");
        await s.click(p.getByRole("button", { name: "リセット" }));
        await p.waitForTimeout(600);
        s.check("リセットで全件に戻る", (await rows.count()) === all, await rows.count());

        await s.pick(p.getByRole("combobox", { name: "目標製品" }), /超硬ドリル 2枚刃 φ4×50/);
        await p.waitForTimeout(600);
        const only = (await rows.allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
        s.check("目標製品「超硬ドリル 2枚刃 φ4×50」で未分類の 1 行だけになる", only.length === 1 && only[0].includes("未分類"), only);
        await s.shot("目標製品で絞り込んだところ");
        await s.click(p.getByRole("button", { name: "リセット" }));
        await p.waitForTimeout(600);
      },
    },
    {
      caption: "「工程内」タブ — 旧「仕掛品」タブ。進行中の指示書の工程ごとの数で、在庫ではない",
      run: async (s) => {
        const p = s.page;
        await s.click(p.getByRole("tab", { name: "工程内" }));
        await p.waitForTimeout(800);
        s.check("URL は ?tab=in-process", new URL(p.url()).searchParams.get("tab") === "in-process", p.url());
        const panel = (await p.getByRole("tabpanel").innerText()).replace(/\s+/g, " ");
        s.check("進行中の指示書 #9001 の工程（段加工）と数が出る", panel.includes("段加工") && /9001/.test(panel), panel.slice(0, 300));
        s.check("在庫の仕掛品の行（data-wip-row）はこのタブに無い", (await p.locator("tr[data-wip-row]:visible").count()) === 0);
      },
    },
    {
      caption: "製品タブ — 仕掛品（半製品）の行は出ない。「使える仕掛品 n 本」を押すと、その製品に使える仕掛品だけに絞った仕掛品タブへ飛ぶ",
      run: async (s) => {
        const p = s.page;
        await s.click(p.getByRole("tab", { name: "製品" }));
        const products = p.locator("table:visible").first();
        await products.waitFor();
        const text = (await products.innerText()).replace(/\s+/g, " ");
        s.check("製品タブに「半製品」の印が無い", !text.includes("半製品"), text.slice(0, 200));
        s.check("製品タブに「使える仕掛品」の列がある", text.includes("使える仕掛品"));
        const link = p.getByRole("link", { name: /に使える仕掛品 \d+ 本を仕掛品タブで見る/ }).first();
        const label = (await link.getAttribute("aria-label")) ?? "";
        const count = Number(label.match(/仕掛品 (\d+) 本/)?.[1] ?? 0);
        s.check("使える仕掛品の本数が出る", count > 0, label);
        await s.shot("製品タブ（使える仕掛品の列）");
        await s.click(link);
        await p.waitForURL(/tab=wip/);
        await p.locator("tr[data-wip-row]").first().waitFor();
        await s.see(/に使える仕掛品$/);
        const shown = await p.locator("tr[data-wip-row]").evaluateAll((trs) =>
          trs.reduce((sum, tr) => sum + Number(tr.querySelectorAll("td")[4]?.textContent ?? 0), 0),
        );
        s.check("絞り込んだ行の利用可能数の合計 = リンクの本数", shown === count, { shown, count });
        await s.shot("その製品に使える仕掛品だけに絞った仕掛品タブ");
        await s.click(p.getByRole("button", { name: "絞り込みを外す" }));
        await p.waitForTimeout(600);
      },
    },
    {
      caption: "未分類の行で「分類する」— 仕掛ブランク（材種・径・長）と加工状態を決める。必須が欠けたままでは確定できない",
      run: async (s) => {
        const p = s.page;
        s.check("分類の前: 未分類の行は 4 本", s.sql(`select quantity::int from app.item_inventory where id='${LEGACY_ROW}'`) === "4");
        await s.click(p.locator(`tr[data-wip-row="${LEGACY_ROW}"]`).getByRole("button", { name: "分類する" }));
        const dialog = p.getByRole("dialog");
        await dialog.getByText("仕掛品を分類する").waitFor();
        s.check(
          "モーダルに元の製品と分類できる数（4 本）が出る",
          (await dialog.innerText()).replace(/\s+/g, " ").includes("超硬ドリル 2枚刃 φ4×50（PRD-202607-0002） ／ 分類できる数 4 本"),
        );
        await s.shot("分類のモーダル（開いた直後）");
        // 何も入れずに確定 → 不備が出て、在庫は動かない
        await s.clickInDialog("分類する");
        const errors = (await dialog.innerText()).replace(/\s+/g, " ");
        s.check(
          "材種・径・長が空だと確定できず、欄ごとに不備が出る",
          errors.includes("材種を選択してください") && errors.includes("径は 0 より大きい数値を入力してください") && errors.includes("長は 0 より大きい数値を入力してください"),
          errors.slice(-260),
        );
        s.check("不備のあいだは在庫が動かない（未分類 4 本のまま）", s.sql(`select quantity::int from app.item_inventory where id='${LEGACY_ROW}'`) === "4");
      },
    },
    {
      caption: "材種 K10UF・φ4 × 50・済んだ工程「切断」を選ぶ — 形を変える工程が済んでいるので仕上がり寸法が必須になる。入れて確定する",
      run: async (s) => {
        const p = s.page;
        const dialog = p.getByRole("dialog");
        const total = s.sql(WIP_TOTAL);
        await s.pick(dialog.getByRole("combobox", { name: /^材種/ }), /K10UF/);
        await s.fill(dialog.getByLabel(/^径/), "4");
        await s.fill(dialog.getByLabel(/^長/), "50");
        await s.pick(dialog.getByRole("combobox", { name: "済んだ工程を追加" }), "切断", { exact: true });
        await s.clickInDialog("分類する");
        s.check(
          "形を変える工程（切断）が済んでいれば、仕上がり径・長が必須になる",
          (await dialog.getByText("仕上がり径を入力してください").isVisible()) && (await dialog.getByText("仕上がり長を入力してください").isVisible()),
        );
        await s.shot("仕上がり寸法が空のまま確定しようとしたところ");
        await s.fill(dialog.getByLabel(/仕上がり径/), "4");
        await s.fill(dialog.getByLabel(/仕上がり長/), "50");
        const stillRed = await dialog.evaluate((d) =>
          Array.from(d.querySelectorAll("input[data-error], .mantine-InputWrapper-error")).map((e) => e.textContent ?? e.outerHTML.slice(0, 80)),
        );
        s.check("入力を揃えると エラーの印（赤枠・文言）が消える", stillRed.length === 0, stillRed);
        await s.shot("入力を揃えた分類のモーダル（4 本すべてを分類する）");
        await s.clickInDialog("分類する");
        await s.toast("仕掛品を分類しました");
        const notice = await p.getByText(/入出庫伝票 \S+/).first().innerText();
        s.check("完了の通知に入出庫伝票の番号（MOV-年度-連番）が出る", /入出庫伝票 MOV-\d{4}-\d{5}/.test(notice), notice);
        s.check("数量の合計は変わらない（行き先だけが変わる）", s.sql(WIP_TOTAL) === total, `${total} → ${s.sql(WIP_TOTAL)}`);
      },
    },
    {
      caption: "分類した 4 本は未分類から消え、仕掛ブランク φ4 × 50 の「切断」の行に出る。台帳は入出庫伝票 1 枚に OUT 4 + IN 4",
      run: async (s) => {
        const p = s.page;
        await p.getByText("φ4 × 50").first().waitFor();
        const table = (await p.locator("table:visible").first().innerText()).replace(/\s+/g, " ");
        s.check("見出し行に B01A0001 — K10UF φ4 × 50 ができる", table.includes("B01A0001 — K10UF φ4 × 50"), table.slice(0, 400));
        s.check("未分類のまとまりが一覧から消える（4 本すべてを分類したので）", !table.includes("未分類"), table.slice(0, 200));
        const target = s.sql(
          `select i.id from app.item_inventory i join app.items b on b.id = i.item_id
            where b.code = 'BLK-B01A0001-4x50' and i.quantity > 0`,
        );
        s.check("分類先のバケットが 1 つできる", /^[0-9a-f-]{36}$/.test(target), target);
        const row = (await p.locator(`tr[data-wip-row="${target}"]`).innerText().catch(() => "")).replace(/\s+/g, " ");
        s.check(
          "分類先の行: 加工状態 切断 / 仕上がり寸法 φ4 × 50 / 数量 4 / 目標製品は元のまま（超硬ドリル 2枚刃 φ4×50）",
          row.includes("切断") && /φ4 × 50 4 0 4 /.test(row) && row.includes("超硬ドリル 2枚刃 φ4×50"),
          row,
        );
        const ledger = s.sql(
          `select i.quantity::int||'|'||array_to_string(st.step_ids, ',')||'|'||i.aimed_item_id||'|'||
                  i.finished_diameter_mm::float||'x'||i.finished_length_mm::float||'|'||b.item_type
             from app.item_inventory i join app.wip_states st on st.id = i.wip_state_id
             join app.items b on b.id = i.item_id where i.id = '${target}'`,
        );
        s.check("台帳: 仕掛ブランクの品目に 4 本・加工状態 [切断=5]・目標製品 9002・仕上がり 4 × 50", ledger === "4|5|9002|4x50|BLANK", ledger);
        s.check("台帳: 未分類の行は 0 本になる", s.sql(`select quantity::int from app.item_inventory where id='${LEGACY_ROW}'`) === "0");
        const movement = s.sql(
          `select m.cause||'|'||count(*)||'|'||string_agg(t.transaction_type||':'||t.quantity::int, ',' order by t.transaction_type)
             from app.inventory_transactions t join app.inventory_movements m on m.id = t.movement_id
            where t.inventory_id in ('${LEGACY_ROW}', '${target}')
            group by m.id, m.cause`,
        );
        s.check("台帳: 1 枚の入出庫伝票に 未分類からの OUT 4 と 分類先への IN 4", /^[A-Z_]+\|2\|IN:4,OUT:4$/.test(movement), movement);
      },
    },
  ],
};
