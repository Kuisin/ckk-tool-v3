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
      caption: "分割した指示書と共有端末 — 範囲は指示書の数量ではなく注文明細の受注数量で出る",
      run: async (s) => {
        // シードの指示書 #9003 は、受注 150 本の明細（基数 200000）から 10 本だけを割り当てたもの。
        await s.goto("/production/work-orders/9003");
        await s.see("印字番号");
        await s.checkVisible("割当 10 本の指示書でも、範囲は明細の 150 本ぶん（A200000-001 〜 A200000-150）", "A200000-001 〜 A200000-150");
        await s.shot("分割した指示書 #9003 の印字番号");

        // 共有端末: 進行中の指示書 #9001（同じ明細）を開く。
        const kiosk = await s.openKiosk("/wo-scan/9001");
        const text = (await kiosk.locator("body").innerText()).replace(/\s+/g, " ");
        s.check("共有端末の指示書画面に「印字番号 A200000-001 〜 A200000-150（明細ごと A200000）」", text.includes("印字番号 A200000-001 〜 A200000-150（明細ごと A200000）"), (text.match(/印字番号.{0,60}/) ?? [`印字番号が無い @ ${kiosk.url()}`])[0]);
        await s.shot("共有端末の指示書画面（印字番号）", kiosk);
        await kiosk.close();
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
