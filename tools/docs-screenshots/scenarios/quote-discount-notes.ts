/**
 * 見積書の値引き注記・明細備考（#973）。
 *
 * 見積書の単価と値引きは**価格表から自動で入る**（手入力は無い）。だから
 * 「値引きの名目」は価格表の値引きルールの名称で、この 1 本はそこから始める:
 *
 *   価格表に値引きルールを足す → 見積書の明細に値引きと名称が入る →
 *   明細ごとの備考（複数行）を書く → 詳細に出る → 編集で直す → 発行 →
 *   PDF に注意書きとして刷られる（PDF は発行後にしか出ない）
 *
 * 併せて、製品マスタの備考を見積書の明細備考へ**写さない**こと（利用者の決定）を
 * 見る — fixtures で製品 9001 に備考を持たせてある。
 */

import { docNumber, docUrl } from "../doc-number";
import type { Scenario } from "./types";

const RULE = "まとめ買い値引き";
const MASTER_NOTE = "SCN-MASTER-NOTE";
const NOTE_LINES = ["刃先は R0.2 仕上げ", "コートは CX400 を指定", "分納可（初回 30 本）"];
/** 2 行目に仮で書き、編集で消す備考。 */
const TEMP_NOTE = "仮の備考（編集で消す）";

/** 見積書の id（URL の最後の区切り。`CKK~QOT-2026-00004`）。 */
function quoteId(url: string): string {
  return decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean)[2] ?? "");
}

export const quoteDiscountNotes: Scenario = {
  id: "quote-discount-notes",
  title: "見積書 — 値引きの注意書きと明細ごとの備考",
  feature: "見積書の値引き注記・明細備考 (#973)",
  user: "staff",
  pdf: true,
  fixtures: ["scenarios/fixtures/quote-discount-notes.sql"],
  steps: [
    {
      caption: "価格表に値引きルールを足す — 見積書の値引きと名称はここから自動で入る",
      run: async (s) => {
        const p = s.page;
        await s.goto("/sales/price-lists/PRC-202607-00001");
        await s.click(p.getByRole("tab", { name: "値引き設定" }));
        await s.click(p.getByRole("button", { name: "値引きルールを追加" }).first());
        const dialog = p.getByRole("dialog");
        await s.fill(dialog.getByRole("textbox", { name: "名称" }), RULE);
        await s.click(dialog.getByText("金額（¥/本）", { exact: true }));
        await s.fill(dialog.getByRole("textbox", { name: /^値引き額/ }), "200");
        await s.fill(dialog.getByRole("textbox", { name: /^数量下限/ }), "50");
        await s.pickDate(dialog.getByRole("button", { name: /^有効開始日/ }), "today");
        await s.shot("値引きルールの入力（金額 ¥200/本・50 本以上）");
        await s.clickInDialog("追加");
        await s.see(RULE);
        const row = s.sql(
          `select d.discount_type || '|' || d.value::int || '|' || d.min_quantity
             from app.price_list_discounts d where d.label = '${RULE}'`,
        );
        s.check("値引きルールが 金額 200 円/本・50 本以上 で入る", row === "AMOUNT|200|50", row);
      },
    },
    {
      caption: "見積書を作る — 60 本の明細に値引きが自動で入り、明細の備考は空から始まる",
      run: async (s) => {
        const p = s.page;
        await s.goto("/sales/quotes/new");
        await s.pick(p.getByRole("combobox", { name: /^顧客/ }), /デモ商事株式会社$/);
        await s.pickDate(p.getByRole("button", { name: /^有効期限/ }), { nextMonthDay: 20 });
        await s.pick(p.getByRole("combobox", { name: "製品" }).first(), /超硬エンドミル/, { search: "エンドミル" });
        await s.fill(p.getByRole("textbox", { name: "数量" }).first(), "60");
        await s.see(RULE, { exact: false });

        // 製品マスタには備考がある（fixtures）。見積書の明細備考へは写さない。
        const lineNote = p.getByRole("textbox", { name: "備考" }).first();
        const initial = await lineNote.inputValue();
        s.check("製品を選んでも、明細の備考は空のまま（製品マスタの備考を写さない）", initial === "", JSON.stringify(initial));
        const masterNote = s.sql("select notes from app.items where id = 9001");
        s.check("（前提）その製品のマスタには備考がある", masterNote.includes(MASTER_NOTE), masterNote);

        await s.fill(lineNote, NOTE_LINES.join("\n"));

        // 2 行目: 同じ製品を 10 本 — 値引きの数量条件（50 本〜）に届かない。
        await s.click(p.getByRole("button", { name: "明細を追加" }));
        await s.pick(p.getByRole("combobox", { name: "製品" }).nth(1), /超硬エンドミル/, { search: "エンドミル" });
        await s.fill(p.getByRole("textbox", { name: "数量" }).nth(1), "10");
        await s.fill(p.getByRole("textbox", { name: "備考" }).nth(1), TEMP_NOTE);

        const body = (await p.locator("main").innerText()).replace(/\s+/g, " ");
        s.check("1 行目: 単価 ¥3,220（50〜99 本の段）・値引き -¥12,000（200 円 × 60 本）", /￥3,220/.test(body) && /-\s?￥12,000/.test(body), (body.match(/単価（価格表）.{0,120}/) ?? [""])[0]);
        s.check("小計は値引き後（3,220×60 − 12,000 + 3,381×10 = ¥215,010）", /小計 ￥215,010/.test(body), (body.match(/小計.{0,60}/) ?? [""])[0]);
        s.check("値引きの手入力欄は無い（価格表からの自動計算だけ）", (await p.getByRole("textbox", { name: /値引/ }).count()) === 0, `${await p.getByRole("textbox", { name: /値引/ }).count()} 個`);
        await p.evaluate(() => window.scrollTo(0, 0));
        await s.shot("入力し終えた見積書（保存前）");

        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(docUrl("/sales/quotes", "QOT"));
      },
    },
    {
      caption: "見積書の詳細 — 値引きの名称と額、複数行の備考がそのまま出る",
      run: async (s) => {
        const p = s.page;
        await s.see(docNumber("QOT"));
        const id = quoteId(p.url());
        const number = id.split("~")[1] ?? "";
        await s.checkVisible("値引きの名称（ルール名 + 1 本あたりの額）が明細に出る", new RegExp(`${RULE}（.*200.*）`));
        await s.checkVisible("値引き額 -¥12,000 が出る", /-\s?￥12,000/);
        for (const line of NOTE_LINES) await s.checkVisible(`備考の行「${line}」が出る`, line);
        await s.checkHidden("製品マスタの備考は出ない", new RegExp(MASTER_NOTE));

        // 改行が 1 行に潰れていないこと（white-space: pre-line の要素に改行入りで載る）。
        const noteBox = p.getByText(NOTE_LINES[0] ?? "").first();
        const rendered = await noteBox.evaluate((el) => ({ text: el.textContent ?? "", ws: getComputedStyle(el).whiteSpace, h: el.getBoundingClientRect().height, lh: Number.parseFloat(getComputedStyle(el).lineHeight) }));
        s.check("備考は 3 行で表示される（改行を保つ）", rendered.text.split("\n").length === 3 && rendered.ws === "pre-line" && rendered.h > rendered.lh * 2.5, rendered);

        const rows = s.sqlRows(
          `select qi.sort_order || '|' || qi.quantity || '|' || qi.unit_price::int || '|' || qi.discount_amount::int || '|' ||
                  coalesce(qi.discount_label, '-') || '|' || qi.amount::int || '|' || coalesce(replace(qi.notes, E'\\n', '⏎'), '-')
             from app.quote_items qi join app.quotes q on q.id = qi.quote_id
            where q.doc_number = '${number}' order by qi.sort_order`,
        );
        s.check("DB 1 行目: 値引き 12,000・名称・金額 181,200・備考 3 行", (rows[0] ?? "").startsWith("0|60|3220|12000|まとめ買い値引き") && (rows[0] ?? "").includes("|181200|") && (rows[0] ?? "").endsWith(NOTE_LINES.join("⏎")), rows[0]);
        s.check("DB 2 行目: 値引きなし（名称も null）・備考 1 行", rows[1] === `1|10|3381|0|-|33810|${TEMP_NOTE}`, rows[1]);
      },
    },
    {
      caption: "下書きのうちに編集する — 備考は入力欄に戻り、空白だけにした備考は消える",
      run: async (s) => {
        const p = s.page;
        const id = quoteId(p.url());
        const number = id.split("~")[1] ?? "";
        const draftPdf = await p.request.get(`/api/pdf/quote?id=${encodeURIComponent(id)}&force=1`);
        s.check("下書きの見積書は PDF を出さない（発行後だけ）", draftPdf.status() === 403, `${draftPdf.status()} ${(await draftPdf.text()).slice(0, 60)}`);

        await s.click(p.getByRole("button", { name: "編集" }).first());
        await s.waitForUrl(docUrl("/sales/quotes", "QOT", "/edit"));
        const loaded = await p.getByRole("textbox", { name: "備考" }).first().inputValue();
        s.check("編集画面に、保存した備考が 3 行のまま戻る", loaded === NOTE_LINES.join("\n"), JSON.stringify(loaded));
        const body = (await p.locator("main").innerText()).replace(/\s+/g, " ");
        s.check("編集画面でも値引きは価格表から入り直る（-¥12,000）", /-\s?￥12,000/.test(body) && body.includes(RULE), (body.match(/値引き（自動）.{0,60}/) ?? [""])[0]);
        await s.fill(p.getByRole("textbox", { name: "備考" }).nth(1), "   ");
        await p.evaluate(() => window.scrollTo(0, 0));
        await s.shot("編集画面（1 行目の備考が戻っている。2 行目は空白だけにした）");
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.waitForUrl(docUrl("/sales/quotes", "QOT"));
        await s.see(docNumber("QOT"));
        const notes = s.sqlRows(
          `select coalesce(replace(qi.notes, E'\\n', '⏎'), '(null)') from app.quote_items qi join app.quotes q on q.id = qi.quote_id
            where q.doc_number = '${number}' order by qi.sort_order`,
        );
        s.check("空白だけの備考は持たない（DB は null）。1 行目の備考はそのまま", notes[0] === NOTE_LINES.join("⏎") && notes[1] === "(null)", notes);
        await s.checkHidden("詳細から 2 行目の仮の備考が消えている", TEMP_NOTE);
      },
    },
    {
      caption: "見積書を発行する — PDF は発行後に出せる",
      run: async (s) => {
        await s.menu("発行");
        await s.shot("発行の確認");
        await s.clickInDialog("発行");
        await s.see("発行済");
      },
    },
    {
      caption: "見積書の PDF — 値引きは明細の下に注意書きで刷られ、備考は行を分けて刷られる",
      run: async (s) => {
        const id = quoteId(s.page.url());
        const text = await s.pdf("見積書", `/api/pdf/quote?id=${encodeURIComponent(id)}&force=1`);
        const flat = text.replace(/[ \t]+/g, " ");
        s.check("PDF に値引きの注意書き「※ まとめ買い値引き（…）: -¥12,000」", /※\s*まとめ買い値引き（[^）]*200[^）]*）\s*[:：]\s*-¥12,000/.test(flat), (flat.match(/※.{0,60}/) ?? ["※ の行が無い"])[0]);
        const noteLine = (flat.match(/※.{0,60}/) ?? [""])[0];
        s.check("注意書きの円記号は半角の ¥ だけ（全角の ￥ と混ざらない — 合計欄と同じ書式）", noteLine.includes("¥") && !noteLine.includes("￥"), noteLine);
        const lines = flat.split("\n").map((l) => l.trim());
        const idx = NOTE_LINES.map((n) => lines.findIndex((l) => l.includes(n)));
        s.check("PDF に備考の 3 行が、行を分けて順に刷られる", idx.every((i) => i >= 0) && (idx[0] ?? 0) < (idx[1] ?? 0) && (idx[1] ?? 0) < (idx[2] ?? 0), idx);
        const noteIdx = lines.findIndex((l) => l.includes("※"));
        s.check("注意書きは値引きの行のすぐ下・備考より上に刷られる", noteIdx >= 0 && noteIdx < (idx[0] ?? -1), { 注意書き: noteIdx, 備考: idx });
        s.check("注意書きは値引きのある明細にだけ刷られる（※ は 1 つ）", (flat.match(/※/g) ?? []).length === 1, `${(flat.match(/※/g) ?? []).length} 個`);
        s.check("消した 2 行目の備考は刷られない", !flat.includes(TEMP_NOTE), flat.includes(TEMP_NOTE) ? "刷られている" : "刷られていない");
        s.check("PDF に製品マスタの備考は出ない", !flat.includes(MASTER_NOTE), flat.includes(MASTER_NOTE) ? "出ている" : "出ていない");
        s.check("PDF の単価欄は値引き前（3,220）、金額欄は値引き後（181,200）", /3,220/.test(flat) && /181,200/.test(flat), (flat.match(/.{0,40}181,200.{0,20}/) ?? ["181,200 が無い"])[0]);
        s.check("PDF の小計は ¥215,010・合計は ¥236,511", /215,010/.test(flat) && /236,511/.test(flat), (flat.match(/小計.{0,40}/) ?? [""])[0]);
      },
    },
  ],
};
