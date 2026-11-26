/**
 * 印字通し番号（#974）— 製品にレーザーで刻む番号。
 *
 * 基数（order_lines.marking_base）は**注文明細が確定した瞬間に DB が振る**
 * （SEQUENCE app.marking_number_seq・200000 始まり）。画面は基数から
 * 「1 本ずつ A{base}-001 〜 -NNN」と「明細ごと A{base}」の両方を出す。
 *
 * 見るもの:
 *   - 下書き・承認依頼中・承認済みの間は未採番、確定で採番される
 *   - 2 明細は連続した別々の基数になる（SEQUENCE がちょうど 2 つ進む）
 *   - 注文明細の詳細（SA25）・指示書の詳細・指示書ストリップ・共有端末に同じ番号が出る
 *   - 一度振った基数は DB が変えさせない
 *   - 明細の一部だけの指示書（分割）は分割番号を持ち、A{基数}{分割番号}-001 から
 *     割当数量ぶん（A2000001-001 〜 -050）。番号は割当の作成時に DB が振って凍結し、
 *     下書きの保存し直しでも進まず、消しても再利用しない
 *
 * デモシードの確定済み明細が 200000 / 200001 を使っているので、この 1 本が
 * 作る明細は「その続き」になる（何番かは決め打ちせず、SEQUENCE から読む）。
 */

import { docUrl, orderLineNumber, WORK_ORDER_URL } from "../doc-number";
import type { Scn } from "./scn";
import type { Scenario } from "./types";

const ORDER_REF = "SCN-MARK-0001";

/** この 1 本が作った注文請書の明細（sort_order 順）。`id|branch|quantity|marking_base|status|line_ref`。 */
function lines(s: Scn): string[][] {
  return s
    .sqlRows(
      `select ol.id || '|' || coalesce(ol.branch::text, '-') || '|' || ol.quantity || '|' ||
              coalesce(ol.marking_base::text, '-') || '|' || ol.status || '|' || coalesce(ol.line_ref, '-')
         from app.order_lines ol join app.order_acceptances oa on oa.id = ol.acceptance_id
        where oa.customer_order_ref = '${ORDER_REF}' order by ol.sort_order`,
    )
    .map((r) => r.split("|"));
}

const seqLast = (s: Scn) => Number(s.sql("select last_value from app.marking_number_seq"));

/** 手順をまたいで持ち回る値（確定前の SEQUENCE の位置・振られた基数）。 */
const ctx: { seqBefore: number; bases: number[]; lineIds: string[]; lineUrls: string[]; workOrder: string } = {
  seqBefore: 0,
  bases: [],
  lineIds: [],
  lineUrls: [],
  workOrder: "",
};

export const markingNumber: Scenario = {
  id: "marking-number",
  title: "印字番号 — 注文明細の確定で DB が採番し、各画面に同じ番号が出る",
  feature: "印字通し番号 (#974)",
  user: "staff",
  kiosk: true,
  steps: [
    {
      caption: "注文請書を 2 明細（3 本・2 本）で作る — 下書きの明細は未採番",
      run: async (s) => {
        const p = s.page;
        ctx.seqBefore = seqLast(s);
        const seeded = s.sqlRows("select marking_base from app.order_lines where marking_base is not null order by 1");
        s.check("（前提）採番は 200000 始まり — シードの確定済み明細が 200000, 200001 を持つ", seeded.join(",") === "200000,200001" && ctx.seqBefore === 200001, { seeded, seq: ctx.seqBefore });

        await s.goto("/sales/order-acceptances/new");
        await s.pick(p.getByRole("combobox", { name: /^顧客/ }), /デモ商事株式会社$/, { search: "デモ商事" });
        await s.fill(p.getByRole("textbox", { name: /^顧客注文書番号/ }), ORDER_REF);
        await s.pickDate(p.getByRole("button", { name: /^注文日/ }), "today");
        await s.pick(p.getByRole("combobox", { name: "製品" }).first(), /超硬エンドミル/, { search: "エンドミル" });
        await s.fill(p.getByRole("textbox", { name: "数量" }).first(), "3");
        await s.pickDate(p.getByRole("button", { name: "納期" }).first(), { nextMonthDay: 25 });
        await s.click(p.getByRole("button", { name: "明細を追加" }));
        await s.pick(p.getByRole("combobox", { name: "製品" }).nth(1), /超硬エンドミル/, { search: "エンドミル" });
        await s.fill(p.getByRole("textbox", { name: "数量" }).nth(1), "2");
        await s.pickDate(p.getByRole("button", { name: "納期" }).nth(1), { nextMonthDay: 25 });
        await p.evaluate(() => window.scrollTo(0, 0));
        await s.shot("2 明細を入れた注文請書（保存前）");
        await s.click(p.getByRole("button", { name: "下書きを作成" }));
        await s.waitForUrl(docUrl("/sales/order-acceptances", "ORD", "", true));

        const ls = lines(s);
        s.check("下書きの 2 明細は枝番も印字番号も無い", ls.length === 2 && ls.every((l) => l[1] === "-" && l[3] === "-" && l[4] === "DRAFT"), ls);
        s.check("SEQUENCE は進んでいない", seqLast(s) === ctx.seqBefore, seqLast(s));
      },
    },
    {
      caption: "承認を依頼し、承認者が承認する — 承認されただけでは採番されない",
      run: async (s) => {
        await s.click(s.page.getByRole("button", { name: "承認依頼", exact: true }).first());
        await s.see("第一承認待ち");
        await s.switchUser("approver", new URL(s.page.url()).pathname);
        await s.click(s.page.getByRole("button", { name: "承認", exact: true }).first());
        await s.see("確定できます");
        const ls = lines(s);
        s.check("承認済みでも未確定の明細は未採番", ls.every((l) => l[3] === "-"), ls);
        s.check("SEQUENCE は進んでいない", seqLast(s) === ctx.seqBefore, seqLast(s));
      },
    },
    {
      caption: "受注を確定する — 明細ごとに印字番号の基数が振られる（連続した別々の番号）",
      run: async (s) => {
        await s.switchUser("staff", new URL(s.page.url()).pathname);
        await s.click(s.page.getByRole("button", { name: "確定", exact: true }).first());
        await s.shot("確定の確認");
        await s.clickInDialog("展開する");
        await s.see(orderLineNumber(1));

        const ls = lines(s);
        ctx.bases = ls.map((l) => Number(l[3]));
        ctx.lineIds = ls.map((l) => l[0] ?? "");
        ctx.lineUrls = ls.map((l) => `/sales/order-lines/${encodeURIComponent((l[5] ?? "").replace("/", "~"))}`);
        s.check("2 明細とも確定（枝番 1, 2）", ls.map((l) => `${l[1]}:${l[4]}`).join(",") === "1:CONFIRMED,2:CONFIRMED", ls);
        s.check(
          `明細の並び順に、続きの番号が 1 つずつ振られる（${ctx.seqBefore + 1}, ${ctx.seqBefore + 2}）`,
          ctx.bases[0] === ctx.seqBefore + 1 && ctx.bases[1] === ctx.seqBefore + 2,
          ctx.bases,
        );
        s.check("SEQUENCE はちょうど 2 つ進む", seqLast(s) === ctx.seqBefore + 2, seqLast(s));
        const dup = s.sql("select count(*) - count(distinct marking_base) from app.order_lines where marking_base is not null");
        s.check("基数は全明細で重複しない", dup === "0", dup);
        const drafts = s.sql("select count(*) from app.order_lines where branch is null and marking_base is not null");
        s.check("未確定（枝番なし）の明細に基数は無い", drafts === "0", drafts);
      },
    },
    {
      caption: "注文明細の詳細（SA25）— 1 本ずつの範囲と明細ごとの番号が両方出る",
      run: async (s) => {
        const [b1, b2] = ctx.bases;
        await s.goto(ctx.lineUrls[0] ?? "");
        await s.see("印字番号");
        await s.checkVisible(`1 明細目（3 本）: A${b1}-001 〜 A${b1}-003`, `A${b1}-001 〜 A${b1}-003`);
        await s.checkVisible(`1 明細目: 明細ごとの番号 A${b1}`, `A${b1}`, { exact: true });
        await s.checkVisible("「1 本ずつ」「明細ごと」の見出しが付く", "1 本ずつ");
        await s.shot("注文明細 1（3 本）の印字番号");

        await s.goto(ctx.lineUrls[1] ?? "");
        await s.see("印字番号");
        await s.checkVisible(`2 明細目（2 本）: A${b2}-001 〜 A${b2}-002`, `A${b2}-001 〜 A${b2}-002`);
        await s.checkVisible(`2 明細目: 明細ごとの番号 A${b2}`, `A${b2}`, { exact: true });
        await s.checkHidden("2 明細目に 1 明細目の番号は出ない", `A${b1}`, { exact: true });
      },
    },
    {
      caption: "この明細から指示書を作る — 指示書の詳細とストリップにも同じ印字番号が出る",
      run: async (s) => {
        const p = s.page;
        const [b1] = ctx.bases;
        await s.goto(`/production/work-orders/new?orderLine=${ctx.lineIds[0]}`);
        await s.see("工程・作業時間");
        const locations = p.getByRole("combobox", { name: "作業場所" });
        const n = await locations.count();
        for (let i = 0; i < n; i++) await s.pick(locations.nth(i), /./);
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(WORK_ORDER_URL);
        ctx.workOrder = new URL(p.url()).pathname.split("/").pop() ?? "";
        await s.see("印字番号");
        await s.checkVisible(`指示書の詳細: A${b1}-001 〜 A${b1}-003`, `A${b1}-001 〜 A${b1}-003`);
        await s.checkVisible(`指示書の詳細: 明細ごと A${b1}`, `A${b1}`, { exact: true });
        await s.shot("指示書の詳細（印字番号）");

        await s.goto(`/production/work-orders/print?ids=${ctx.workOrder}`);
        await s.checkVisible(`指示書ストリップ: 印字番号 A${b1}-001 〜 A${b1}-003 ／ A${b1}`, new RegExp(`印字番号\\s*A${b1}-001 〜 A${b1}-003\\s*／\\s*A${b1}`));
      },
    },
    {
      caption: "この明細の指示書は明細全部（3 本）なので分割ではない — 分割番号 0・印字番号は明細の基数のまま",
      run: async (s) => {
        const split = s.sql(
          `select l.marking_split || '|' || ol.marking_split_issued from app.work_order_order_lines l
             join app.order_lines ol on ol.id = l.order_line_id
            where l.order_line_id = '${ctx.lineIds[0]}'`,
        );
        s.check("DB: 割当の分割番号 0（明細全部）・明細の払い出し数 0", split === "0|0", split);
      },
    },
    {
      caption: "分割した指示書 — 明細の一部だけの指示書は分割番号を持ち、A{基数}{分割番号}-001 から割当数量ぶん",
      run: async (s) => {
        // シードの受注 150 本の明細（基数 200000）は 3 本の指示書に分けてある:
        //   #9001 = 50 本 / #9003 = 10 本 / #9004 = 50 本（割当の作成順に分割 1, 2, 3）
        const splits = s.sqlRows(
          `select w.work_order_number || '=' || l.quantity || ':' || l.marking_split from app.work_order_order_lines l
             join app.work_orders w on w.id = l.work_order_id
            where l.order_line_id = 'e0000000-0000-4000-8000-000000000001' order by l.marking_split`,
        );
        s.check("DB: 3 本の割当に分割 1, 2, 3（作成順）", splits.join(",") === "9001=50:1,9003=10:2,9004=50:3", splits);
        const issued = s.sql("select marking_split_issued from app.order_lines where id = 'e0000000-0000-4000-8000-000000000001'");
        s.check("DB: 明細の払い出し数は 3", issued === "3", issued);

        await s.goto("/production/work-orders/9003");
        await s.see("印字番号");
        await s.checkVisible("#9003（10 本・分割 2）: A2000002-001 〜 A2000002-010", "A2000002-001 〜 A2000002-010");
        await s.checkVisible("#9003: 分割ごとの番号 A2000002", "A2000002", { exact: true });
        await s.checkVisible("#9003: 「分割 2」の印", "分割 2", { exact: true });
        await s.checkHidden("#9003: 明細全体の範囲（〜 A200000-150）はもう出ない", "A200000-001 〜 A200000-150");
        await s.shot("分割した指示書 #9003 の印字番号（分割 2）");

        await s.goto("/production/work-orders/9001");
        await s.see("印字番号");
        await s.checkVisible("#9001（50 本・分割 1）: A2000001-001 〜 A2000001-050", "A2000001-001 〜 A2000001-050");

        // 注文明細の詳細（SA25）: 分割ごとの範囲と指示書が並ぶ。
        const lineRef = s.sql("select line_ref from app.order_lines where id = 'e0000000-0000-4000-8000-000000000001'");
        await s.goto(`/sales/order-lines/${encodeURIComponent(lineRef.replace("/", "~"))}`);
        await s.see("印字番号");
        await s.checkVisible("SA25: 明細全体 A200000-001 〜 A200000-150", "A200000-001 〜 A200000-150");
        await s.checkVisible("SA25: 「分けて作った指示書」の見出し", "分けて作った指示書（分割ごとの番号）");
        for (const [split, range] of [
          [1, "A2000001-001 〜 A2000001-050"],
          [2, "A2000002-001 〜 A2000002-010"],
          [3, "A2000003-001 〜 A2000003-050"],
        ] as const) {
          await s.checkVisible(`SA25: 分割 ${split} の範囲 ${range}`, range);
        }
        await s.checkVisible("SA25: 分割ごとに指示書番号と割当数量（例: …（10 本））", /^WOR-\S+（10 本）$/);
        await s.shot("注文明細（受注 150 本）— 分割ごとの印字番号と指示書");

        // 共有端末: 指示書 #9001（分割 1）を開く。
        const kiosk = await s.openKiosk("/wo-scan/9001");
        const text = (await kiosk.locator("body").innerText()).replace(/\s+/g, " ");
        s.check("共有端末の指示書画面に「印字番号 A2000001-001 〜 A2000001-050（分割 1・分割ごと A2000001）」", text.includes("印字番号 A2000001-001 〜 A2000001-050（分割 1・分割ごと A2000001）"), (text.match(/印字番号.{0,60}/) ?? [`印字番号が無い @ ${kiosk.url()}`])[0]);
        await s.shot("共有端末の指示書画面（印字番号・分割 1）", kiosk);
        await kiosk.close();
      },
    },
    {
      caption: "残り 40 本で指示書をもう 1 本作る（分割 4）— 下書きを保存し直しても番号は進まず、DB は分割番号を変えさせない",
      run: async (s) => {
        const p = s.page;
        await s.goto("/production/work-orders/new?orderLine=e0000000-0000-4000-8000-000000000001");
        await s.see("工程・作業時間");
        const locations = p.getByRole("combobox", { name: "作業場所" });
        const n = await locations.count();
        for (let i = 0; i < n; i++) await s.pick(locations.nth(i), /./);
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(WORK_ORDER_URL);
        const wo = new URL(p.url()).pathname.split("/").pop() ?? "";
        const alloc = () =>
          s.sql(
            `select l.quantity || ':' || l.marking_split || '|' || ol.marking_split_issued from app.work_order_order_lines l
               join app.work_orders w on w.id = l.work_order_id join app.order_lines ol on ol.id = l.order_line_id
              where w.work_order_number = ${Number(wo)}`,
          );
        const created = alloc();
        s.check("DB: 残り 40 本の割当は分割 4（払い出し数 4）", created === "40:4|4", created);
        await s.see("印字番号");
        await s.checkVisible("指示書の詳細: A2000004-001 〜 A2000004-040", "A2000004-001 〜 A2000004-040");

        // 下書きを編集画面から保存し直す — 割当を消して作り直さないので番号は同じ。
        await s.goto(`/production/work-orders/${wo}/edit`);
        await s.see("工程・作業時間");
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(new RegExp(`/production/work-orders/${wo}$`));
        const resaved = alloc();
        s.check("下書きを保存し直しても分割 4 のまま・払い出し数も 4 のまま", resaved === "40:4|4", resaved);

        // DB の約束: 分割番号は変えられない / 数量だけを直すのは通るが番号は動かない。
        let changeError = "";
        try {
          s.sqlExec(`update app.work_order_order_lines set marking_split = 9 where order_line_id = 'e0000000-0000-4000-8000-000000000001' and marking_split = 4`);
        } catch (e) {
          changeError = String((e as { stderr?: string }).stderr ?? e);
        }
        s.check("分割番号の書き換えは DB が拒否する", /immutable once issued/.test(changeError), changeError.replace(/\s+/g, " ").slice(0, 160) || "拒否されなかった");
        s.sqlExec(`update app.work_order_order_lines set quantity = 30 where order_line_id = 'e0000000-0000-4000-8000-000000000001' and marking_split = 4`);
        s.check("数量だけを直すと通り、分割番号は 4 のまま", alloc() === "30:4|4", alloc());

        // 割当を消しても番号は再利用しない（次の分割は 5）。
        s.sqlExec(`delete from app.work_order_order_lines where order_line_id = 'e0000000-0000-4000-8000-000000000001' and marking_split = 4`);
        s.sqlExec(
          `insert into app.work_order_order_lines (work_order_id, order_line_id, quantity, sort_order)
           select id, 'e0000000-0000-4000-8000-000000000001', 30, 0 from app.work_orders where work_order_number = ${Number(wo)}`,
        );
        s.check("割当を消して作り直すと次の番号（分割 5）— 4 は再利用しない", alloc() === "30:5|5", alloc());
      },
    },
    {
      caption: "数量が 1000 本以上の明細は枝番の桁が広がり、振った基数は DB が変えさせない",
      run: async (s) => {
        const [b1] = ctx.bases;
        // 一度振った基数は不変（刻んだあとの製品の番号が DB 側でずれない）。
        let changeError = "";
        try {
          s.sqlExec(`update app.order_lines set marking_base = marking_base + 1000 where id = '${ctx.lineIds[0]}'`);
        } catch (e) {
          changeError = String((e as { stderr?: string }).stderr ?? e);
        }
        s.check("基数の書き換えは DB が拒否する", /immutable once issued/.test(changeError), changeError.replace(/\s+/g, " ").slice(0, 160) || "拒否されなかった");
        let nullError = "";
        try {
          s.sqlExec(`update app.order_lines set marking_base = null where id = '${ctx.lineIds[0]}'`);
        } catch (e) {
          nullError = String((e as { stderr?: string }).stderr ?? e);
        }
        s.check("基数を消す（null に戻す）のも拒否する", /immutable once issued/.test(nullError), nullError.replace(/\s+/g, " ").slice(0, 160) || "拒否されなかった");
        const still = s.sql(`select marking_base from app.order_lines where id = '${ctx.lineIds[0]}'`);
        s.check("基数は変わっていない", Number(still) === b1, still);

        // 桁: 数量 1200 本なら枝番は 4 桁（A…-0001 〜 A…-1200）。数量は準備として SQL で変える。
        s.sqlExec(`update app.order_lines set quantity = 1200 where id = '${ctx.lineIds[1]}'`);
        await s.goto(ctx.lineUrls[1] ?? "");
        await s.see("印字番号");
        const b2 = ctx.bases[1];
        await s.checkVisible(`1200 本の明細: A${b2}-0001 〜 A${b2}-1200（4 桁に揃う）`, `A${b2}-0001 〜 A${b2}-1200`);
      },
    },
  ],
};
