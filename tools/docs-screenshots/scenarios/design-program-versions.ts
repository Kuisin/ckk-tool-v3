/**
 * 加工プログラムの版・使用済み・承認つきの変更（機種 PR）。
 *
 * シード: デモ商事の系列 v1（確定済み）に 3 本 — 使用済み 2 本 + 「v1 使用済み → v2 現行・未使用」1 本。
 * 準備（fixtures/design-program-versions.sql）: これから開始する段加工を 2 つ（#9201 / #9202、機械 NC-02）。
 *
 *   1. 版の画面: 使用済み / 未使用の印、使用済みの版は「新しい版を作る」「廃止する」だけ、過去の版が読める
 *   2. 段なし: 未使用の版を「直す」→ 申請と同時にその場で反映（行は増えない）
 *   3. 開始済みの工程（#9001 段加工）は**開始したときの版（v1）**を出す — Web・共有端末とも
 *   4. 共有端末で #9201 段加工を開始 → そのとき出ていた版が記録され、使用済みになる
 *   5. 承認設定に段を足す → 使用済みの版の「新しい版を作る」は保留（承認依頼中）。未処理一覧に
 *      「製品 v版 / プログラム名」で出る
 *   6. 未使用の版を直す申請の承認待ちのあいだに、その版が使われる → 承認しても反映されず FAILED
 *   7. 承認者が新しい版を承認 → v3 ができる。開始済みの #9201 は v2 のまま、未開始の #9202 は v3
 */

import type { Locator, Page } from "@playwright/test";
import type { Scn } from "./scn";
import type { Scenario } from "./types";

const VERSION = "d9000000-0000-4000-8000-000000000003";
const STEP_9001 = "dc011000-0000-4000-8000-000000000004"; // #9001 段加工（開始済み・v1 で開始）
const STEP_9201 = "dc092010-0000-4000-8000-000000000001";
const STEP_9202 = "dc092020-0000-4000-8000-000000000001";
const STEP_KEY = "da000000-0000-4000-8000-000000000002"; // 段加工（荒・仕上げ）の program_key
const NAME = "段加工（荒・仕上げ）";

let kiosk: Page;

async function top(s: Scn): Promise<void> {
  await s.page.evaluate(() => window.scrollTo(0, 0));
}

function programsPanel(s: Scn): Locator {
  return s.page
    .locator(".mantine-Paper-root")
    .filter({ has: s.page.getByText("この版から起こした加工プログラム", { exact: false }) })
    .last();
}

/** プログラム 1 本のカード（名前で引く）。 */
function card(s: Scn, name: string): Locator {
  return programsPanel(s)
    .locator(".mantine-SimpleGrid-root > .mantine-Paper-root")
    .filter({ has: s.page.getByText(name, { exact: true }).first() })
    .first();
}

async function cardText(s: Scn, name: string): Promise<string> {
  return (await card(s, name).innerText()).replace(/\s+/g, " ");
}

function stepPanel(page: Page, web: boolean): Locator {
  return page
    .locator(".mantine-Paper-root")
    .filter({ has: page.getByRole("heading", { name: "加工プログラム", exact: true }) })
    .last()
    .locator(web ? ".mantine-SimpleGrid-root > .mantine-Paper-root" : ".mantine-Paper-root");
}

async function stepCards(page: Page, web: boolean): Promise<string[]> {
  return (await stepPanel(page, web).allInnerTexts()).map((c) => c.replace(/\s+/g, " "));
}

/** 段加工（荒・仕上げ）の版の並び（revision:番号:現行か）。 */
const revisions = `select string_agg(p.revision || ':' || coalesce(p.program_number, '') || ':' || (p.superseded_at is null), ',' order by p.revision)
                     from app.design_programs p where p.program_key = '${STEP_KEY}'`;

export const designProgramVersions: Scenario = {
  id: "design-program-versions",
  title: "加工プログラム — 版・使用済み・承認つきの変更（開始した工程は開始時の版を見続ける）",
  feature: "加工プログラムの機種・版",
  user: "staff",
  kiosk: true,
  fixtures: ["scenarios/fixtures/design-program-versions.sql"],
  steps: [
    {
      caption: "確定済みの版の加工プログラム — 使用済み / 未使用の印。使用済みの版には「新しい版を作る」「廃止する」だけが出て、過去の版が読める",
      run: async (s) => {
        await s.goto(`/production/design-files/versions/${VERSION}`);
        await s.see("確定済み", { exact: false });
        const panel = programsPanel(s);
        await panel.scrollIntoViewIfNeeded();
        s.check("確定済みの版でも「プログラムを追加」がある", (await panel.getByRole("button", { name: "プログラムを追加" }).count()) === 1);

        const cut = await cardText(s, "素材の切断・外径");
        s.check("素材の切断・外径: v1・使用済み（1 工程）・機種 NC旋盤 A型", /v1/.test(cut) && /使用済み（1 工程）/.test(cut) && /機種: NC旋盤 A型/.test(cut), cut);
        s.check("使用済みの版: 「新しい版を作る」「廃止する」はあり、「直す」「削除」は無い",
          (await card(s, "素材の切断・外径").getByRole("button", { name: "新しい版を作る" }).count()) === 1 &&
            (await card(s, "素材の切断・外径").getByRole("button", { name: "廃止する" }).count()) === 1 &&
            (await card(s, "素材の切断・外径").getByRole("button", { name: "直す" }).count()) === 0 &&
            (await card(s, "素材の切断・外径").getByRole("button", { name: "削除" }).count()) === 0,
          await card(s, "素材の切断・外径").getByRole("button").allInnerTexts());

        const stepCard = await cardText(s, NAME);
        s.check(`${NAME}: 現行は v2・未使用・O1202・「過去の版（1）」`, /v2/.test(stepCard) && /未使用/.test(stepCard) && /O1202/.test(stepCard) && /過去の版（1）/.test(stepCard), stepCard);
        s.check(`${NAME} v2（未使用だが v1 は使用済み）: 「直す」「廃止する」はあり、「削除」は無い`,
          (await card(s, NAME).getByRole("button", { name: "直す" }).count()) === 1 &&
            (await card(s, NAME).getByRole("button", { name: "廃止する" }).count()) === 1 &&
            (await card(s, NAME).getByRole("button", { name: "削除" }).count()) === 0,
          await card(s, NAME).getByRole("button").allInnerTexts());
        await s.click(card(s, NAME).getByRole("button", { name: /過去の版/ }));
        await card(s, NAME).getByText("O1201").waitFor({ state: "visible", timeout: 10_000 });
        const withHistory = await cardText(s, NAME);
        s.check("過去の版を開くと v1（O1201・使用済み 1 工程）が読める", /v1/.test(withHistory) && /O1201/.test(withHistory) && /使用済み（1 工程）/.test(withHistory), withHistory);
        await top(s);
        await s.shot("版の画面 — 使用済み / 未使用・過去の版");
      },
    },
    {
      caption: "承認の段なし: 未使用の v2 を「直す」（番号 O1202 → O1203）— 申請と同時にその場で反映され、行は増えない",
      run: async (s) => {
        const p = s.page;
        await s.click(card(s, NAME).getByRole("button", { name: "直す" }));
        const dlg = p.getByRole("dialog");
        await dlg.getByRole("textbox", { name: "プログラム番号" }).waitFor({ state: "visible" });
        s.check("モーダルの説明は「その場で直します」", (await dlg.getByText("まだ工程で使われていない版を、その場で直します。").count()) === 1);
        await s.fill(dlg.getByRole("textbox", { name: "プログラム番号" }), "O1203");
        await s.fill(dlg.getByRole("textbox", { name: "申請メモ" }), "仕上げのサイクルを変更");
        await s.shot("直す — 申請のモーダル");
        await s.click(dlg.getByRole("button", { name: "申請する" }));
        await s.toast("反映しました");
        await card(s, NAME).getByText("O1203").waitFor({ state: "visible", timeout: 20_000 });
        s.check("DB: 同じ v2 の行が書き換わる（v1 は O1201 のまま・行は 2 つ）", s.sql(revisions) === "1:O1201:false,2:O1203:true", s.sql(revisions));
        s.check("DB: 申請は EDIT:APPLIED", s.sql("select string_agg(kind || ':' || status, ',') from app.design_program_changes") === "EDIT:APPLIED");
      },
    },
    {
      caption: "開始済みの工程（#9001 段加工）は、開始したときの版（v1 = O1201）を出し続ける — Web と共有端末",
      run: async (s) => {
        await s.goto(`/production/work-orders/9001/steps/${STEP_9001}`);
        await s.see("作業計画");
        await s.checkVisible("「この工程を開始したときの版を表示しています」", "この工程を開始したときの版を表示しています");
        const web = await stepCards(s.page, true);
        const machining = web.find((c) => c.startsWith(NAME)) ?? "";
        s.check(`Web: ${NAME} は v1（O1201）— 現行の v2（O1203）ではない`, /v1/.test(machining) && /O1201/.test(machining) && !/O1203/.test(machining), web);
        s.check("Web: NC旋盤 A型 用が先頭で「この機種用」", /^段加工（荒・仕上げ）/.test(web[0] ?? "") && /この機種用/.test(web[0] ?? ""), web);
        await top(s);
        await s.shot("開始済みの工程（Web）— 開始時の版");

        kiosk = await s.openKiosk(`/steps/${STEP_9001}`);
        await kiosk.getByRole("heading", { name: "加工プログラム" }).waitFor({ state: "visible", timeout: 20_000 });
        const kc = await stepCards(kiosk, false);
        const km = kc.find((c) => c.includes(NAME)) ?? "";
        s.check(`共有端末: ${NAME} は v1（O1201）・「この機種用」`, /v1/.test(km) && /O1201/.test(km) && !/O1203/.test(km) && /この機種用/.test(km), kc);
        await s.shot("開始済みの工程（共有端末）— 開始時の版", kiosk);
      },
    },
    {
      caption: "共有端末で #9201 の段加工を開始する — そのとき出ていた版（段加工 v2 = O1203 ほか）が記録され、使用済みになる",
      run: async (s) => {
        await kiosk.goto(`${new URL(kiosk.url()).origin}/steps/${STEP_9201}`);
        await kiosk.getByRole("heading", { name: "加工プログラム" }).waitFor({ state: "visible", timeout: 20_000 });
        const before = await stepCards(kiosk, false);
        s.check("開始前: 現行版（段加工 v2 = O1203）が出る", before.some((c) => c.includes(NAME) && /O1203/.test(c)), before);
        s.check("開始前は記録なし", s.sql(`select count(*) from app.work_order_step_programs where step_id = '${STEP_9201}'`) === "0");
        const lot = kiosk.getByRole("textbox", { name: /ロット\/伝票コード/ });
        if ((await lot.count()) > 0) await lot.first().fill("LOT-9201");
        await kiosk.getByRole("button", { name: "工程開始" }).first().click();
        await kiosk.getByRole("button", { name: "工程完了" }).waitFor({ state: "visible", timeout: 20_000 });
        const rec = s.sqlRows(
          `select p.name || ':v' || p.revision from app.work_order_step_programs u join app.design_programs p on p.id = u.program_id
            where u.step_id = '${STEP_9201}' order by p.name`,
        );
        s.check("DB: 開始で出ていた 2 本の版が記録される（段加工 v2・マシニング用 v1）", rec.join(",") === "段加工（マシニング用）:v1,段加工（荒・仕上げ）:v2", rec);
        await s.shot("#9201 段加工を開始した（共有端末）", kiosk);

        await s.goto(`/production/design-files/versions/${VERSION}`);
        await programsPanel(s).scrollIntoViewIfNeeded();
        const c = await cardText(s, NAME);
        s.check(`版の画面: ${NAME} v2 が「使用済み（1 工程）」になり、「直す」が「新しい版を作る」に替わる`, /使用済み（1 工程）/.test(c) && (await card(s, NAME).getByRole("button", { name: "新しい版を作る" }).count()) === 1 && (await card(s, NAME).getByRole("button", { name: "直す" }).count()) === 0, c);
      },
    },
    {
      caption: "承認設定に段を足す（加工プログラムの変更 = 第一承認グループ）→ 使用済みの v2 の「新しい版を作る」は保留される",
      run: async (s) => {
        const p = s.page;
        s.sqlExec(`
          INSERT INTO app.approval_flows (target_type, updated_at) VALUES ('design_program_changes', now()) ON CONFLICT DO NOTHING;
          INSERT INTO app.approval_flow_steps (target_type, step_no, name, group_id, mode)
          SELECT 'design_program_changes', 1, '{"ja": "第一承認", "en": "First approval"}'::jsonb, g.id, 'ANY'
            FROM app.approval_groups g WHERE g.name->>'ja' = '第一承認グループ（デモ）';
        `);
        await s.goto("/master/approval-settings");
        await s.see("加工プログラムの変更");
        const main = (await p.locator("main").innerText()).replace(/\s+/g, " ");
        const section = main.slice(main.lastIndexOf("加工プログラムの変更"));
        s.check("承認設定（MS0B）に「加工プログラムの変更」があり、第一承認グループの 1 段が出る", section.includes("第一承認グループ（デモ）"), section.slice(0, 200));
        await s.shot("承認設定 — 加工プログラムの変更");

        await s.goto(`/production/design-files/versions/${VERSION}`);
        await programsPanel(s).scrollIntoViewIfNeeded();
        await s.click(card(s, NAME).getByRole("button", { name: "新しい版を作る" }));
        const dlg = p.getByRole("dialog");
        await dlg.getByRole("textbox", { name: "プログラム番号" }).waitFor({ state: "visible" });
        s.check("モーダルの題は「新しい版（v3）を作る」", (await dlg.getByText(`「${NAME}」の新しい版（v3）を作る`).count()) === 1);
        await s.fill(dlg.getByRole("textbox", { name: "プログラム番号" }), "O1301");
        await s.fill(dlg.getByRole("textbox", { name: "申請メモ" }), "工具摩耗対策で送りを下げる");
        await s.click(dlg.getByRole("button", { name: "申請する" }));
        await s.toast("承認を依頼しました");
        await card(s, NAME).getByText("承認依頼中").first().waitFor({ state: "visible", timeout: 20_000 });
        const c = await cardText(s, NAME);
        s.check("カードに「承認依頼中」と申請の中身（新しい版・O1301・申請メモ）", /承認依頼中/.test(c) && /新しい版/.test(c) && /O1301/.test(c) && /工具摩耗対策/.test(c), c);
        s.check("申請した担当者（承認グループ外）には承認ボタンが出ない", (await card(s, NAME).getByRole("button", { name: "承認", exact: true }).count()) === 0);
        s.check("DB: まだ v3 は無い（保留）", s.sql(revisions) === "1:O1201:false,2:O1203:true", s.sql(revisions));
        s.check("DB: 申請 REVISE は PENDING・承認依頼 1/1 段", s.sql("select kind || ':' || status from app.design_program_changes where kind = 'REVISE'") === "REVISE:PENDING" && s.sql("select string_agg(status::text || ':' || step_no || '/' || step_count, ',') from app.approval_requests where target_type = 'design_program_changes'") === "PENDING:1/1");
        s.check("保留中は同じプログラムにもう申請を出せない（操作ボタンが消える）", (await card(s, NAME).getByRole("button", { name: "新しい版を作る" }).count()) === 0);
        await top(s);
        await s.shot("新しい版の申請 — 承認依頼中");
      },
    },
    {
      caption: "未使用のプログラムを足して（承認）、それを直す申請の承認待ちのあいだに使われると — 承認しても反映されず「反映できなかった申請」になる",
      run: async (s) => {
        const p = s.page;
        // 承認ありで追加 → 承認者が承認（下の手順で）するまで保留。ここでは SQL で
        // 「承認済みの未使用プログラム」を直接置き、その「直す」申請から始める。
        s.sqlExec(`
          INSERT INTO app.design_programs (id, design_version_id, program_key, revision, name, program_number, sort_order, created_at, updated_at)
          VALUES ('da000000-0000-4000-8000-0000000000f1', '${VERSION}', 'da000000-0000-4000-8000-0000000000f1', 1, '面取り（試作）', 'O3001', 9, now(), now());
          INSERT INTO app.design_program_steps (program_id, process_step_id)
          SELECT 'da000000-0000-4000-8000-0000000000f1', id FROM app.process_step_catalog WHERE code = 'STEP_MACHINING';
        `);
        await p.reload();
        await programsPanel(s).scrollIntoViewIfNeeded();
        await s.click(card(s, "面取り（試作）").getByRole("button", { name: "直す" }));
        const dlg = p.getByRole("dialog");
        await dlg.getByRole("textbox", { name: "プログラム番号" }).waitFor({ state: "visible" });
        await s.fill(dlg.getByRole("textbox", { name: "プログラム番号" }), "O3002");
        await s.click(dlg.getByRole("button", { name: "申請する" }));
        await s.toast("承認を依頼しました");
        // 承認を待つあいだに、#9202 の段加工がこの版で開始された（記録だけを置く）。
        s.sqlExec(`INSERT INTO app.work_order_step_programs (step_id, program_id) VALUES ('${STEP_9202}', 'da000000-0000-4000-8000-0000000000f1');`);
        s.check("前提: 直す申請は PENDING・その版はいま使用済み", s.sql("select status from app.design_program_changes where kind = 'EDIT' and program_id = 'da000000-0000-4000-8000-0000000000f1'") === "PENDING" && s.sql("select count(*) from app.work_order_step_programs where program_id = 'da000000-0000-4000-8000-0000000000f1'") === "1");
      },
    },
    {
      caption: "承認者の画面: 未処理一覧に「製品 v版 / プログラム名」で並ぶ → 承認。新しい版は v3 として反映、使われてしまった版の「直す」は反映されない",
      run: async (s) => {
        const p = s.page;
        await s.switchUser("approver", "/general/tasks");
        await s.click(p.getByRole("tab", { name: /承認依頼中/ }));
        const tasks = (await p.locator("main").innerText()).replace(/\s+/g, " ");
        s.check("未処理一覧に「加工プログラムの変更」が「… v1 / 段加工（荒・仕上げ）」の形で並ぶ（uuid ではない）", tasks.includes("加工プログラムの変更") && tasks.includes(`v1 / ${NAME}`) && !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(tasks), tasks.slice(0, 800));
        await s.shot("承認者の未処理一覧");

        await s.goto(`/production/design-files/versions/${VERSION}`);
        await programsPanel(s).scrollIntoViewIfNeeded();
        const approve = card(s, NAME).getByRole("button", { name: "承認", exact: true });
        s.check("承認者には承認・差し戻しのボタンが出る", (await approve.count()) === 1 && (await card(s, NAME).getByRole("button", { name: "差し戻し" }).count()) === 1);
        await top(s);
        await s.shot("承認者の版の画面 — 承認カード");
        await s.click(approve);
        await s.toast(/承認/);
        await p.waitForTimeout(500);
        s.check("DB: v3（O1301）ができて現行に、v2 は過去の版に", s.sql(revisions) === "1:O1201:false,2:O1203:false,3:O1301:true", s.sql(revisions));
        s.check("DB: 申請 REVISE は APPLIED", s.sql("select status from app.design_program_changes where kind = 'REVISE'") === "APPLIED");

        await p.reload();
        await programsPanel(s).scrollIntoViewIfNeeded();
        await s.click(card(s, "面取り（試作）").getByRole("button", { name: "承認", exact: true }));
        await p.waitForTimeout(1500);
        const failed = s.sql("select status || '|' || coalesce(error, '') from app.design_program_changes where kind = 'EDIT' and program_id = 'da000000-0000-4000-8000-0000000000f1'");
        s.check("DB: 使用済みになった版の「直す」は FAILED（理由つき）・番号は O3001 のまま", failed.startsWith("FAILED|この版は工程で使われたため") && s.sql("select program_number from app.design_programs where id = 'da000000-0000-4000-8000-0000000000f1'") === "O3001", failed);
        await p.reload();
        await s.checkVisible("版の画面に「反映できなかった申請: 変更「面取り（試作）」」", "反映できなかった申請: 変更「面取り（試作）」", { wait: 10_000 });
        const c = await cardText(s, NAME);
        s.check(`${NAME}: 現行 v3（O1301）・過去の版（2）`, /v3/.test(c) && /O1301/.test(c) && /過去の版（2）/.test(c), c);
        await top(s);
        await s.shot("承認後の版の画面 — v3 と反映できなかった申請");
      },
    },
    {
      caption: "開始済みの #9201 は v2（O1203）のまま、まだ開始していない #9202 には新しい v3（O1301）が出る — Web と共有端末",
      run: async (s) => {
        await s.goto(`/production/work-orders/9201/steps/${STEP_9201}`);
        await s.see("作業計画");
        const w1 = await stepCards(s.page, true);
        s.check("Web #9201: 段加工 v2（O1203）", w1.some((c) => c.startsWith(NAME) && /v2/.test(c) && /O1203/.test(c)) && !w1.some((c) => /O1301/.test(c)), w1);
        await s.goto(`/production/work-orders/9202/steps/${STEP_9202}`);
        await s.see("作業計画");
        const w2 = await stepCards(s.page, true);
        s.check("Web #9202: 段加工 v3（O1301）", w2.some((c) => c.startsWith(NAME) && /v3/.test(c) && /O1301/.test(c)), w2);
        await top(s);
        await s.shot("未開始の #9202 — 新しい版");

        await kiosk.goto(`${new URL(kiosk.url()).origin}/steps/${STEP_9201}`);
        await kiosk.getByRole("heading", { name: "加工プログラム" }).waitFor({ state: "visible", timeout: 20_000 });
        const k1 = await stepCards(kiosk, false);
        s.check("共有端末 #9201: 段加工 v2（O1203）のまま", k1.some((c) => c.includes(NAME) && /O1203/.test(c)) && !k1.some((c) => /O1301/.test(c)), k1);
        await s.shot("開始済みの #9201（共有端末）— 開始時の v2", kiosk);
        await kiosk.goto(`${new URL(kiosk.url()).origin}/steps/${STEP_9202}`);
        await kiosk.getByRole("heading", { name: "加工プログラム" }).waitFor({ state: "visible", timeout: 20_000 });
        const k2 = await stepCards(kiosk, false);
        s.check("共有端末 #9202: 段加工 v3（O1301）", k2.some((c) => c.includes(NAME) && /O1301/.test(c)), k2);
      },
    },
  ],
};
