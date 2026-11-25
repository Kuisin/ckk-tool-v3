/**
 * 共有端末の「指示書一覧」（#971）と、工程画面の 印字番号（#974）・加工プログラム（#972）。
 *
 * 端末 = 撮影用（本社工場 F01・既定の作業場所 NC-01）、カード = demo_shot。
 * 準備（fixtures/kiosk-wo-list.sql）:
 *   #9101 承認済み・本社工場 → 出る / #9102 承認済み・第二工場だけ → 出ない
 *   #9001 段加工 に工程納期（来月 20 日）、#9001 が使う図面の版に加工プログラム 2 本
 * シードのまま: #9001 進行中（出る）/ #9002 承認依頼中・#9003 下書き・#9004 完了（出ない）
 *
 * 各手順の最後の 1 枚（「手順の終わり」）は Web 側の同じ対象の画面 — 共有端末と見比べるため。
 */

import type { Page } from "@playwright/test";
import type { Scn } from "./scn";
import type { Scenario } from "./types";

const STEP_9001_MACHINING = "dc011000-0000-4000-8000-000000000004";
const MARKING = "印字番号 A200000-001 〜 A200000-150（明細ごと A200000）";

let kiosk: Page;

/**
 * タブレットとして使えるか — 横にはみ出していないこと、押せるものの高さが 44px 以上あること
 * （_specs/design.md §20.1 の最小タッチターゲット）。
 */
async function checkTablet(s: Scn, page: Page, where: string): Promise<void> {
  const r = await page.evaluate(() => {
    const small: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("main button, main a, main input"))) {
      if ((el as HTMLButtonElement).disabled) continue;
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.height < 44) {
        small.push(`${(el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 24)}=${Math.round(b.height)}px`);
      }
    }
    const wide: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("main *"))) {
      const b = el.getBoundingClientRect();
      if (b.width > 0 && b.right > window.innerWidth + 1) wide.push(`${el.tagName}.${String(el.className).slice(0, 30)}`);
    }
    return {
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      scrollWidth: document.documentElement.scrollWidth,
      small,
      wide: wide.slice(0, 5),
    };
  });
  s.check(`${where}: 横にはみ出していない（1280×800）`, r.scrollWidth <= 1280 && r.wide.length === 0, r);
  s.check(`${where}: 押せるものの高さが 44px 以上`, r.small.length === 0, r.small.length === 0 ? "すべて 44px 以上" : r.small);
}

/** 一覧に出ている指示書番号（上から順）。 */
async function listedNumbers(page: Page): Promise<string[]> {
  const rows = await page.getByRole("button", { name: /^指示書 #\d+/ }).allInnerTexts();
  return rows.map((t) => t.match(/#(\d+)/)?.[1] ?? "?");
}

export const kioskWoList: Scenario = {
  id: "kiosk-wo-list",
  title: "共有端末 — 指示書一覧から工程画面へ（印字番号・加工プログラム・工程納期）",
  feature: "G 共有端末の指示書一覧 (#971) + 工程画面の印字番号 (#974)・加工プログラム (#972)",
  user: "staff",
  kiosk: true,
  fixtures: ["scenarios/fixtures/kiosk-wo-list.sql"],
  steps: [
    {
      caption: "共有端末のアプリ一覧から「指示書一覧」を開く — 端末の拠点（本社工場）の 承認済み・進行中 だけが並ぶ",
      run: async (s) => {
        kiosk = await s.openKiosk("/");
        await kiosk.getByRole("button", { name: "指示書一覧", exact: true }).waitFor({ state: "visible", timeout: 20_000 });
        await s.shot("共有端末のアプリ一覧 — 「指示書一覧」がある", kiosk);
        await kiosk.getByRole("button", { name: "指示書一覧", exact: true }).click();
        await kiosk.waitForURL(/\/wo-list$/, { timeout: 20_000 });
        await kiosk.getByRole("heading", { name: "指示書一覧" }).waitFor({ state: "visible" });
        await kiosk.getByRole("button", { name: /^指示書 #9001/ }).waitFor({ state: "visible", timeout: 20_000 });

        const scope = await kiosk.getByText("の承認済み・進行中の指示書").innerText();
        s.check("絞り込みの説明に端末の拠点名が出る", scope.includes("本社工場"), scope);
        const numbers = await listedNumbers(kiosk);
        s.check("並ぶのは #9101（承認済）と #9001（進行中）の 2 件・新しい順", numbers.join(",") === "9101,9001", numbers);
        s.check("件数の表示が「2 件」", (await kiosk.getByText("2 件", { exact: true }).count()) === 1, await kiosk.getByText(/^\d+ 件$/).allInnerTexts());
        const badge9101 = await kiosk.getByRole("button", { name: /^指示書 #9101/ }).innerText();
        const badge9001 = await kiosk.getByRole("button", { name: /^指示書 #9001/ }).innerText();
        s.check("#9101 は「承認済」・製品名と予定数量と進み具合が出る", /承認済/.test(badge9101) && /超硬ドリル/.test(badge9101) && /予定数量 30 本/.test(badge9101) && /完了 0 \/ 2 工程/.test(badge9101), badge9101.replace(/\s+/g, " "));
        s.check("#9001 は「進行中」・完了 3 / 6 工程", /進行中/.test(badge9001) && /完了 3 \/ 6 工程/.test(badge9001), badge9001.replace(/\s+/g, " "));

        // 出ないはずのものが DB には「ある」こと（無いから出ないのではない）。
        const others = s.sqlRows(
          `select w.work_order_number || ':' || w.status || ':' ||
                  (select string_agg(distinct p.code, '+') from app.work_order_steps st join app.plants p on p.id = st.plant_id where st.work_order_id = w.id)
             from app.work_orders w where w.work_order_number in (9002, 9003, 9004, 9102) order by 1`,
        );
        s.check(
          "DB には 他拠点の承認済み #9102・承認依頼中 #9002・下書き #9003・完了 #9004 がある",
          others.join(" ") === "9002:PENDING_APPROVAL:F01 9003:DRAFT:F01 9004:COMPLETED:F01 9102:APPROVED:F02",
          others,
        );
        for (const n of ["9102", "9002", "9003", "9004"]) {
          s.check(`#${n} は一覧に出ない`, !numbers.includes(n), numbers);
        }
        await checkTablet(s, kiosk, "指示書一覧");
        await s.shot("指示書一覧（本社工場の 承認済み・進行中）", kiosk);
        // 見比べ用: Web の指示書一覧（全状態・全拠点が並ぶ）。
        await s.goto("/production/work-orders");
        await s.see("WOR-2026-00001", { exact: false });
      },
    },
    {
      caption: "検索欄で絞り込む — 製品名・全角の番号・旧番号で引け、語は AND。該当なしの表示も確かめる",
      run: async (s) => {
        const box = kiosk.getByRole("textbox", { name: "指示書番号・製品名で検索" });
        await box.fill("ドリル");
        await kiosk.getByText("1 件", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
        s.check("「ドリル」→ #9101 だけ", (await listedNumbers(kiosk)).join(",") === "9101", await listedNumbers(kiosk));
        await s.shot("製品名「ドリル」で絞り込み", kiosk);

        await box.fill("９００１");
        s.check("全角の「９００１」→ #9001 だけ", (await listedNumbers(kiosk)).join(",") === "9001", await listedNumbers(kiosk));

        await box.fill("WOR-202607-09001");
        s.check("紙に刷られた旧番号 WOR-202607-09001 → #9001", (await listedNumbers(kiosk)).join(",") === "9001", await listedNumbers(kiosk));

        const doc9101 = s.sql("select doc_number from app.work_orders where work_order_number = 9101");
        await box.fill(doc9101.toLowerCase());
        s.check(`書類番号（小文字 ${doc9101.toLowerCase()}）→ #9101`, (await listedNumbers(kiosk)).join(",") === "9101", await listedNumbers(kiosk));

        await box.fill("エンドミル 9101");
        await kiosk.getByText("該当する指示書はありません").waitFor({ state: "visible", timeout: 10_000 });
        s.check("「エンドミル 9101」（AND）→ 0 件", (await listedNumbers(kiosk)).length === 0 && (await kiosk.getByText("0 件", { exact: true }).count()) === 1, await listedNumbers(kiosk));
        await s.shot("該当なし", kiosk);

        // 他拠点の指示書は検索しても出ない。
        await box.fill("9102");
        s.check("他拠点の #9102 は検索しても出ない", (await listedNumbers(kiosk)).length === 0, await listedNumbers(kiosk));

        await box.fill("");
        s.check("検索を消すと 2 件に戻る", (await listedNumbers(kiosk)).join(",") === "9101,9001", await listedNumbers(kiosk));
      },
    },
    {
      caption: "行を押すと指示書の工程一覧（/wo-scan/<番号>）が開く — 印字番号と工程納期が出る",
      run: async (s) => {
        await kiosk.getByRole("button", { name: /^指示書 #9001/ }).click();
        await kiosk.waitForURL(/\/wo-scan\/9001\?from=list$/, { timeout: 20_000 });
        await kiosk.getByRole("heading", { name: "指示書 #9001" }).waitFor({ state: "visible", timeout: 20_000 });
        s.check("URL は /wo-scan/9001?from=list", /\/wo-scan\/9001\?from=list$/.test(kiosk.url()), kiosk.url());

        const marking = await kiosk.getByText(/^印字番号/).allInnerTexts();
        s.check("印字番号（割当の注文明細: 基番 200000・受注 150 本）が出る", marking.length === 1 && marking[0] === MARKING, marking);
        const base = s.sql(
          `select ol.marking_base || '/' || ol.quantity from app.work_order_order_lines l
             join app.order_lines ol on ol.id = l.order_line_id
             join app.work_orders w on w.id = l.work_order_id where w.work_order_number = 9001`,
        );
        s.check("DB の marking_base / 受注数量 と一致", base === "200000/150", base);

        const card = await kiosk.getByRole("button", { name: /^4\. 段加工/ }).innerText();
        const due = s.sql(`select to_char(due_date, 'YYYY/MM/DD') from app.work_order_steps where id = '${STEP_9001_MACHINING}'`);
        s.check("段加工 のカードに工程納期が出る", card.includes(`工程納期 ${due}`), card.replace(/\s+/g, " "));
        s.check("段加工 のカードに作業場所（NC旋盤 1号機）と「作業中」が出る", /NC旋盤 1号機/.test(card) && /作業中/.test(card), card.replace(/\s+/g, " "));
        s.check("戻るボタンは「指示書一覧へ」", (await kiosk.getByRole("button", { name: "指示書一覧へ" }).count()) === 1, await kiosk.getByRole("button").first().innerText());
        const dueColor = await kiosk.getByText(`工程納期 ${due}`, { exact: true }).first().evaluate((el) => getComputedStyle(el).color);
        s.check("先の日付の工程納期は赤くない", !/rgb\((2[0-5]\d), (\d{1,2}|1[01]\d), /.test(dueColor), dueColor);
        await checkTablet(s, kiosk, "指示書の工程一覧");
        await s.shot("指示書 #9001 の工程一覧（印字番号・工程納期）", kiosk);
        // 見比べ用: Web の指示書詳細（同じ印字番号・工程納期が出る）。
        await s.goto("/production/work-orders/9001");
        await s.see("工程ワークフロー");
      },
    },
    {
      caption: "工程（段加工）を開く — 印字番号・工程納期と、この工程の加工プログラムが出る。機械が一致する方が先頭",
      run: async (s) => {
        await kiosk.getByRole("button", { name: /^4\. 段加工/ }).click();
        await kiosk.waitForURL(new RegExp(`/steps/${STEP_9001_MACHINING}`), { timeout: 20_000 });
        await kiosk.getByRole("heading", { name: "段加工", exact: true }).waitFor({ state: "visible", timeout: 20_000 });

        const marking = await kiosk.getByText(/^印字番号/).allInnerTexts();
        s.check("工程画面にも印字番号が出る", marking.length === 1 && marking[0] === MARKING, marking);
        const due = s.sql(`select to_char(due_date, 'YYYY/MM/DD') from app.work_order_steps where id = '${STEP_9001_MACHINING}'`);
        s.check("工程画面に工程納期が出る", (await kiosk.getByText(`工程納期 ${due}`, { exact: true }).count()) === 1, await kiosk.getByText(/^工程納期/).allInnerTexts());

        const section = kiosk.locator(".mantine-Paper-root").filter({ has: kiosk.getByRole("heading", { name: "加工プログラム" }) }).first();
        await section.waitFor({ state: "visible", timeout: 10_000 });
        const cards = await section.locator(".mantine-Paper-root").allInnerTexts();
        const flat = cards.map((c) => c.replace(/\s+/g, " "));
        s.check("加工プログラムが 2 本出る", cards.length === 2, flat);
        s.check(
          "先頭は端末の作業場所（NC旋盤 1号機）用 — 「この機械用」の印つき",
          /段加工 仕上げ（NC旋盤）/.test(flat[0] ?? "") && /この機械用/.test(flat[0] ?? "") && /O1001/.test(flat[0] ?? "") && /機械: NC旋盤 1号機/.test(flat[0] ?? ""),
          flat[0],
        );
        s.check(
          "2 本目は別の機械（マシニング 1号機）用 — 印なし",
          /段加工 荒取り（マシニング）/.test(flat[1] ?? "") && !/この機械用/.test(flat[1] ?? "") && /機械: マシニング 1号機/.test(flat[1] ?? ""),
          flat[1],
        );
        s.check("備考が出る（主軸 3000rpm…）", /主軸 3000rpm/.test(flat[0] ?? ""), flat[0]);
        s.check("ファイルの無いプログラムは「ファイルなし」", flat.every((c) => /ファイルなし/.test(c)), flat);
        await checkTablet(s, kiosk, "工程画面");
        await s.shot("工程画面（上）— 印字番号・工程納期・加工プログラム", kiosk);
        // 下のほう（不良記録・一時停止・工程完了）まで届くこと。
        const complete = kiosk.getByRole("button", { name: "工程完了" });
        await complete.scrollIntoViewIfNeeded();
        s.check("下までスクロールすると「工程完了」が押せる位置に出る", await complete.isVisible(), await complete.boundingBox());
        await s.shot("工程画面（下）— 不良記録・一時停止・工程完了", kiosk);
        // 見比べ用: Web の工程実行画面（同じ 2 本が同じ順で出るはず）。
        await s.goto(`/production/work-orders/9001/steps/${STEP_9001_MACHINING}`);
        await s.see("作業計画");
        const web = (await s.page.locator(".mantine-Paper-root").filter({ has: s.page.getByRole("heading", { name: "加工プログラム", exact: true }) }).last().locator(".mantine-SimpleGrid-root > .mantine-Paper-root").allInnerTexts()).map((c) => c.replace(/\s+/g, " "));
        s.check("Web の工程実行画面でも同じ並び（NC旋盤 用が先頭）", web.length === 2 && /^段加工 仕上げ（NC旋盤）/.test(web[0]) && /^段加工 荒取り（マシニング）/.test(web[1]), web);
      },
    },
    {
      caption: "戻る — 工程 → 指示書 → 指示書一覧。図面にプログラムの無い指示書（#9101）では加工プログラム欄も印字番号も出ない",
      run: async (s) => {
        await kiosk.getByRole("button", { name: "指示書へ" }).click();
        await kiosk.getByRole("heading", { name: "指示書 #9001" }).waitFor({ state: "visible", timeout: 20_000 });
        s.check("工程から戻ると指示書の工程一覧", /\/wo-scan\/9001/.test(kiosk.url()), kiosk.url());
        const back = kiosk.getByRole("button", { name: /指示書一覧へ|戻る|スキャン/ }).first();
        const backLabel = (await back.innerText()).trim();
        s.check("工程から戻ったあとも戻り先は「指示書一覧へ」のまま（一覧から来たことを覚えている）", backLabel === "指示書一覧へ", `${backLabel} @ ${kiosk.url()}`);
        await s.shot("工程から戻った指示書の工程一覧", kiosk);
        await back.click();
        await kiosk.getByRole("button", { name: /^指示書 #9101/ }).or(kiosk.getByText("指示書をスキャン")).first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined);
        s.check("もう一度戻ると指示書一覧", /\/wo-list$/.test(kiosk.url()), kiosk.url());

        if (!/\/wo-list$/.test(kiosk.url())) await kiosk.goto(`${s.kioskUrl}/wo-list`, { waitUntil: "networkidle" });
        await kiosk.getByRole("button", { name: /^指示書 #9101/ }).click();
        await kiosk.getByRole("heading", { name: "指示書 #9101" }).waitFor({ state: "visible", timeout: 20_000 });
        s.check("注文明細の割当が無い #9101 に印字番号は出ない", (await kiosk.getByText(/^印字番号/).count()) === 0, await kiosk.getByText(/^印字番号/).allInnerTexts());
        // 過ぎて未完了の工程納期（fixtures: 切断 = 先月 10 日）は共有端末でも赤い太字。
        const overdue = s.sql("select to_char(due_date, 'YYYY/MM/DD') from app.work_order_steps where id = 'dc091010-0000-4000-8000-000000000001'");
        const overdueText = kiosk.getByText(`工程納期 ${overdue}`, { exact: true }).first();
        const look = (await overdueText.count())
          ? await overdueText.evaluate((el) => ({ color: getComputedStyle(el).color, weight: getComputedStyle(el).fontWeight }))
          : { color: "（表示なし）", weight: "" };
        const rgb = look.color.match(/(\d+), (\d+), (\d+)/);
        s.check("過ぎて未完了の工程納期（切断・先月 10 日）は赤い太字", !!rgb && Number(rgb[1]) > 200 && Number(rgb[2]) < 140 && Number(look.weight) >= 700, { overdue, ...look });
        await s.shot("指示書 #9101（承認済・割当なし）の工程一覧 — 切断 の工程納期が期限超過", kiosk);
        await kiosk.getByRole("button", { name: /^1\. 切断/ }).click();
        await kiosk.getByRole("heading", { name: "切断", exact: true }).waitFor({ state: "visible", timeout: 20_000 });
        s.check("確定した図面にプログラムが無い工程では「加工プログラム」欄ごと出ない", (await kiosk.getByRole("heading", { name: "加工プログラム" }).count()) === 0, await kiosk.getByRole("heading").allInnerTexts());
        s.check("未計画の工程は開けて「工程開始」が出る", (await kiosk.getByRole("button", { name: /工程開始/ }).count()) >= 1, await kiosk.getByRole("button").allInnerTexts());
        await s.shot("#9101 切断 の工程画面（加工プログラムなし）", kiosk);
        await s.goto("/production/work-orders/9101");
        await s.see("工程ワークフロー");
      },
    },
  ],
};
