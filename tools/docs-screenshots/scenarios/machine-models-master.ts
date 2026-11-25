/**
 * 作業場所マスタ (MS0D) の「機種」— 登録・機械への割り当て・使用中は削除できない。
 *
 * シード（masters-demo-seed）: NC旋盤 A型（NC-01・NC-02）/ マシニング V5（MC-01）/
 * 円筒研磨機 C型（GR-01・GR-02）。加工プログラムは production-demo-seed が機種に当てる。
 */

import type { Locator } from "@playwright/test";
import type { Scn } from "./scn";
import type { Scenario } from "./types";

async function top(s: Scn): Promise<void> {
  await s.page.evaluate(() => window.scrollTo(0, 0));
}

/** 作業場所タブのある行（コードで引く）。 */
function locationRow(s: Scn, code: string): Locator {
  return s.page.getByRole("row").filter({ has: s.page.getByText(code, { exact: true }) }).first();
}

/** 機種タブのある行（コードで引く）。 */
function modelRow(s: Scn, code: string): Locator {
  return s.page.getByRole("row").filter({ has: s.page.getByText(code, { exact: true }) }).first();
}

async function openModelsTab(s: Scn): Promise<void> {
  await s.click(s.page.getByRole("tab", { name: "機種" }));
  await s.page.getByRole("button", { name: "機種を追加" }).waitFor({ state: "visible" });
}

const usage = (code: string) =>
  `select (select count(*) from app.work_locations wl where wl.machine_model_id = m.id) || '/' ||
          (select count(distinct p.program_key) from app.design_program_machine_models pm join app.design_programs p on p.id = pm.program_id where pm.machine_model_id = m.id)
     from app.machine_models m where m.code = '${code}'`;

export const machineModelsMaster: Scenario = {
  id: "machine-models-master",
  title: "作業場所マスタ — 機種を登録し、機械に割り当てる（使用中の機種は削除できない）",
  feature: "加工プログラムの機種・版",
  user: "admin",
  steps: [
    {
      caption: "作業場所 (MS0D) を開く —「作業場所」「機種」のタブ。機械の表に機種が出る",
      run: async (s) => {
        await s.goto("/master/work-locations");
        await s.see("切削エリア");
        s.check("タブが 2 つ（作業場所 / 機種）", (await s.page.getByRole("tab", { name: "作業場所" }).count()) === 1 && (await s.page.getByRole("tab", { name: "機種" }).count()) === 1);
        const nc01 = (await locationRow(s, "NC-01").innerText()).replace(/\s+/g, " ");
        s.check("NC-01 の行に機種「NC旋盤 A型」", nc01.includes("NC旋盤 A型"), nc01);
        const mc01 = (await locationRow(s, "MC-01").innerText()).replace(/\s+/g, " ");
        s.check("MC-01 の行に機種「マシニング V5」", mc01.includes("マシニング V5"), mc01);
        await top(s);
      },
    },
    {
      caption: "「機種」タブ — 機種ごとに 機械 / プログラムの数が出る",
      run: async (s) => {
        await openModelsTab(s);
        const row = (await modelRow(s, "NC-LATHE-A").innerText()).replace(/\s+/g, " ");
        const db = s.sql(usage("NC-LATHE-A"));
        s.check("NC旋盤 A型: 機械 2 台 / プログラム（DB の数と一致）", row.includes(`機械 ${db.split("/")[0]} 台 / プログラム ${db.split("/")[1]} 本`) && db.startsWith("2/"), { row, db });
        s.check("ヘッダーの操作は「機種を追加」に替わる（グループ追加は出ない）", (await s.page.getByRole("button", { name: "グループ追加" }).count()) === 0);
        await top(s);
      },
    },
    {
      caption: "「機種を追加」— コード・名称（多言語）・メーカーを入れて追加する",
      run: async (s) => {
        const p = s.page;
        await s.click(p.getByRole("button", { name: "機種を追加" }));
        const dlg = p.getByRole("dialog");
        await dlg.getByText("メーカー").first().waitFor();
        await s.click(dlg.getByRole("button", { name: "追加", exact: true }));
        await s.toast(/コード|入力/);
        s.check("空のままでは追加されない", s.sql("select count(*) from app.machine_models") === "3");
        await s.fill(dlg.getByRole("textbox", { name: /機種のコード/ }), "LATHE-B");
        await s.fill(dlg.getByRole("textbox", { name: /^名称（日本語）/ }), "NC旋盤 B型");
        await s.fill(dlg.getByRole("textbox", { name: /メーカー/ }), "デモ工機");
        await s.shot("機種の追加（入力済み）");
        await s.click(dlg.getByRole("button", { name: "追加", exact: true }));
        await s.toast("機種を追加しました");
        await modelRow(s, "LATHE-B").waitFor({ state: "visible", timeout: 20_000 });
        const db = s.sql("select code || '|' || (name->>'ja') || '|' || coalesce(maker, '') || '|' || is_active from app.machine_models where code = 'LATHE-B'");
        s.check("DB: LATHE-B / NC旋盤 B型 / デモ工機 / 有効", db === "LATHE-B|NC旋盤 B型|デモ工機|true", db);
        s.check("追加した機種は 機械 0 台 / プログラム 0 本", (await modelRow(s, "LATHE-B").innerText()).includes("機械 0 台 / プログラム 0 本"));
      },
    },
    {
      caption: "作業場所タブで NC-02 を編集し、機種を「NC旋盤 B型」に替える",
      run: async (s) => {
        const p = s.page;
        await s.click(p.getByRole("tab", { name: "作業場所" }));
        await locationRow(s, "NC-02").waitFor({ state: "visible" });
        await s.click(locationRow(s, "NC-02").getByRole("button", { name: "作業場所を編集" }));
        const dlg = p.getByRole("dialog");
        const select = dlg.getByRole("textbox", { name: /機種/ }).or(dlg.getByRole("combobox", { name: /機種/ })).first();
        await select.waitFor({ state: "visible" });
        await s.pick(select, "NC旋盤 B型（LATHE-B）", { exact: true });
        await s.shot("作業場所の編集 — 機種を選ぶ");
        await s.click(dlg.getByRole("button", { name: "保存", exact: true }));
        await s.toast("作業場所を更新しました");
        await locationRow(s, "NC-02").getByText("NC旋盤 B型").waitFor({ state: "visible", timeout: 20_000 });
        const db = s.sql("select m.code from app.work_locations wl join app.machine_models m on m.id = wl.machine_model_id where wl.code = 'NC-02'");
        s.check("DB: NC-02 の機種は LATHE-B", db === "LATHE-B", db);
        s.check("DB: NC旋盤 A型 の機械は 1 台に減る", s.sql(usage("NC-LATHE-A")).startsWith("1/"), s.sql(usage("NC-LATHE-A")));
        await top(s);
      },
    },
    {
      caption: "使われている機種（NC旋盤 A型）は削除できない — 使われていない機種は削除できる",
      run: async (s) => {
        const p = s.page;
        await openModelsTab(s);
        await s.click(modelRow(s, "NC-LATHE-A").getByRole("button", { name: "機種を削除" }));
        const dlg = p.getByRole("dialog");
        await dlg.getByText("が使っています", { exact: false }).waitFor({ state: "visible" });
        await s.shot("使用中の機種の削除確認（警告つき）");
        await s.click(dlg.getByRole("button", { name: /削除/ }).last());
        await s.toast(/削除できません/);
        s.check("DB: NC-LATHE-A は残る", s.sql("select count(*) from app.machine_models where code = 'NC-LATHE-A'") === "1");
        await p.keyboard.press("Escape");

        // 使われていない機種を 1 つ作って消す。
        s.sqlExec(`INSERT INTO app.machine_models (code, name, sort_order, updated_at) VALUES ('UNUSED-X', '{"ja": "使わない機種"}'::jsonb, 99, now());`);
        await p.reload();
        await openModelsTab(s);
        await s.click(modelRow(s, "UNUSED-X").getByRole("button", { name: "機種を削除" }));
        await s.click(p.getByRole("dialog").getByRole("button", { name: /削除/ }).last());
        await s.toast("機種「使わない機種」を削除しました");
        s.check("DB: UNUSED-X は消える", s.sql("select count(*) from app.machine_models where code = 'UNUSED-X'") === "0");
        await top(s);
      },
    },
  ],
};
