/**
 * 再研磨の売上勘定 — 会計連携（SY0J）で注文種別ごとの売上高の科目を決めると、仕訳 CSV の
 * 売上行が「再研磨」と「それ以外」に分かれること。科目の優先順は
 *   注文種別の科目 → 税区分マスタの売上高科目 → 既定の売上高科目。
 *
 * 始まり: fixtures/regrind-sales-account.sql — 発行済みの請求書 1 通に、製品（本番）
 * 100,000 円と再研磨 61,000 円の明細が載っている（税抜 161,000 / 税 16,100）。
 *
 * 会計連携 CSV は**最初に出した時点で転記されて固定**される（出し直しても同じ中身）。
 * 設定を変えた結果を見るときは、請求書の画面で「反対仕訳を作成」してから出し直す。
 */

import type { Scn } from "./scn";
import type { Scenario } from "./types";

const INVOICE = "/billing/invoices/INV-202606-00001";

interface JournalLine {
  debitAccount: string;
  debitAmount: number;
  creditAccount: string;
  creditAmount: number;
  memo: string;
}

/** 既定の列レイアウト（13 列）の CSV → 仕訳行。 */
function parseJournal(csv: string): JournalLine[] {
  return csv
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .slice(1)
    .map((l) => {
      const c = l.split(",");
      return {
        debitAccount: c[1] ?? "",
        debitAmount: Number(c[5]),
        creditAccount: c[6] ?? "",
        creditAmount: Number(c[10]),
        memo: c[11] ?? "",
      };
    });
}

/** 貸方の科目 → 金額（同じ科目は足す）。`4100=100000 4190=61000 2200=16100` の形で返す。 */
function creditTotals(lines: JournalLine[]): string {
  const totals = new Map<string, number>();
  for (const l of lines) totals.set(l.creditAccount, (totals.get(l.creditAccount) ?? 0) + l.creditAmount);
  return [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, amount]) => `${code || "(空)"}=${amount}`)
    .join(" ");
}

/**
 * 請求書の操作メニューから会計連携 CSV を出す。メニューの項目はダウンロードのリンク
 * なので、その行き先を同じログインのまま取って本文を読む（画面で押すのと同じ要求）。
 */
async function exportCsv(s: Scn, label: string, item: RegExp): Promise<{ csv: string; lines: JournalLine[] }> {
  const p = s.page;
  await s.goto(INVOICE);
  await s.click(p.getByRole("button", { name: "操作メニュー" }).first());
  const link = p.getByRole("menuitem", { name: item });
  await link.waitFor({ state: "visible" });
  await s.shot(label);
  const href = (await link.getAttribute("href")) ?? "";
  const res = await p.request.get(href);
  const csv = await res.text();
  s.check(`${label}: CSV が返る`, res.ok() && /csv/.test(res.headers()["content-type"] ?? ""), `${res.status()} ${res.headers()["content-type"]} ${res.ok() ? "" : csv.slice(0, 200)}`);
  await p.keyboard.press("Escape");
  return { csv, lines: parseJournal(csv) };
}

/** いま有効な転記を「反対仕訳を作成」で取り消す（設定を変えたあと出し直すため）。 */
async function reverse(s: Scn, reason: string): Promise<void> {
  const p = s.page;
  await s.goto(INVOICE);
  await s.menu("反対仕訳を作成");
  const dialog = p.getByRole("dialog").last();
  await s.fill(dialog.getByRole("textbox", { name: /反対仕訳の理由/ }), reason);
  await s.clickInDialog("反対仕訳を作成");
  await s.toast("反対仕訳を作成しました");
}

/** 会計連携の編集を開く。 */
async function openSettingsEditor(s: Scn): Promise<void> {
  await s.goto("/settings/accounting");
  await s.click(s.page.getByRole("button", { name: "編集", exact: true }).first());
  await s.see("既定の科目コード");
}

async function saveSettings(s: Scn): Promise<void> {
  await s.click(s.page.getByRole("button", { name: "保存", exact: true }));
  await s.toast("保存しました");
}

/**
 * 閲覧モードの「注文種別ごとの売上高 科目コード」の 1 行の文字。保存の直後は画面が
 * サーバーの値を読み直すまで一瞬だけ前の値が残るので、期待の値になるのを少し待つ
 * （10 秒待っても変わらなければ、そのときの文字を返す = check が落ちる）。
 */
async function viewRow(s: Scn, orderType: string, expected: RegExp): Promise<string> {
  const row = s.page.getByRole("row", { name: new RegExp(`^${orderType}`) });
  await row.waitFor({ state: "visible", timeout: 20_000 });
  const read = async () => (await row.innerText()).replace(/\s+/g, " ");
  const until = Date.now() + 10_000;
  let text = await read();
  while (!expected.test(text) && Date.now() < until) {
    await s.page.waitForTimeout(250);
    text = await read();
  }
  return text;
}

const savedByOrderType = (s: Scn) =>
  s.sql("select coalesce((select value::text from app.system_settings where key = 'accounting.salesAccountByOrderType'), '(未保存)')");

export const regrindSalesAccount: Scenario = {
  id: "regrind-sales-account",
  title: "再研磨の売上勘定 — 会計連携で注文種別ごとに売上高の科目を分ける",
  feature: "B 再研磨の売上勘定 (#970)",
  user: "admin",
  fixtures: ["scenarios/fixtures/regrind-sales-account.sql"],
  steps: [
    {
      caption: "請求書を確かめる — 製品（本番）100,000 円と再研磨 61,000 円が 1 通に載っている。まだ会計連携していない",
      run: async (s) => {
        await s.goto(INVOICE);
        await s.see("未エクスポート");
        await s.checkVisible("再研磨の明細が載っている", "再研磨 超硬エンドミル 4枚刃 φ6×60");
        const items = s.sql(
          "select string_agg(l.order_type || ':' || ii.amount::int, ',' order by ii.sort_order) from app.invoice_items ii join app.order_lines l on l.id = ii.order_line_id join app.invoices i on i.id = ii.invoice_id where i.legacy_number = 'INV-202606-00001'",
        );
        s.check("DB: 明細は 本番 100,000 と 再研磨 61,000", items === "PRODUCTION:100000,REGRIND:61000", items);
        const head = s.sql("select subtotal::int || '/' || tax_amount::int || '/' || total_amount::int from app.invoices where legacy_number = 'INV-202606-00001'");
        s.check("請求書の合計は変わっていない（税抜 161,000 / 税 16,100 / 税込 177,100）", head === "161000/16100/177100", head);
      },
    },
    {
      caption: "会計連携（SY0J）で再研磨の売上高科目を決める — 科目コードは半角英数字。既定の科目と再研磨の科目を入れて保存する",
      run: async (s) => {
        const p = s.page;
        await s.goto("/settings/accounting");
        await s.see("注文種別ごとの売上高 科目コード");
        s.check("設定する前は、注文種別の科目は 1 つも保存されていない", ["(未保存)", "{}"].includes(savedByOrderType(s)), savedByOrderType(s));
        await s.shot("設定する前（どの注文種別も「税区分・既定に従う」）");

        await s.click(p.getByRole("button", { name: "編集", exact: true }).first());
        await s.see("既定の科目コード");
        await s.fill(p.getByRole("textbox", { name: "売掛金 科目コード" }), "1100");
        await s.fill(p.getByRole("textbox", { name: "売上高 科目コード" }), "4100");
        await s.fill(p.getByRole("textbox", { name: "仮受消費税 科目コード" }), "2200");
        await s.fill(p.getByRole("textbox", { name: "再研磨", exact: true }), "再研磨売上");
        await s.click(p.getByRole("button", { name: "保存", exact: true }));
        await s.checkVisible("半角英数字でない科目コードは保存できない", "半角英数字・16 桁まで（空欄可）");
        await p.evaluate(() => window.scrollTo(0, 0));
        await s.shot("科目コードの形が違う");
        s.check("断られた時点では何も保存されていない", ["(未保存)", "{}"].includes(savedByOrderType(s)), savedByOrderType(s));

        await s.fill(p.getByRole("textbox", { name: "再研磨", exact: true }), "4190");
        await s.shot("再研磨 = 4190 を入れたフォーム");
        await saveSettings(s);
        const text = await viewRow(s, "再研磨", /再研磨 4190/);
        s.check("保存すると閲覧に戻り、再研磨の行に 4190 が出る", /再研磨 4190/.test(text), text);
        const other = (await p.getByRole("row", { name: /^本番/ }).innerText()).replace(/\s+/g, " ");
        s.check("入れていない種別（本番）は「税区分・既定に従う」のまま", /税区分・既定に従う/.test(other), other);
        s.check("DB: 注文種別 → 科目は REGRIND だけ", savedByOrderType(s).replace(/\s/g, "") === '{"REGRIND":"4190"}', savedByOrderType(s));
      },
    },
    {
      caption: "会計連携 CSV を出す — 売上が 2 行に分かれる（製品 100,000 → 既定の 4100 / 再研磨 61,000 → 4190）",
      run: async (s) => {
        const { csv, lines } = await exportCsv(s, "請求書の操作メニュー — 会計連携CSV", /^会計連携CSV$/);
        console.log(csv);
        s.check("仕訳は 3 行（売上 2 行 + 消費税 1 行）", lines.length === 3, csv.replace(/\r?\n/g, " ⏎ "));
        s.check("貸方: 4100 = 100,000 / 4190 = 61,000 / 2200 = 16,100", creditTotals(lines) === "2200=16100 4100=100000 4190=61000", creditTotals(lines));
        s.check("借方はどの行も売掛金 1100", lines.every((l) => l.debitAccount === "1100"), lines.map((l) => l.debitAccount).join(","));
        const debit = lines.reduce((sum, l) => sum + l.debitAmount, 0);
        s.check("借方の合計 = 税込合計 177,100（科目を分けても合計は崩れない）", debit === 177100, String(debit));
        s.check("各行の貸借が一致する", lines.every((l) => l.debitAmount === l.creditAmount), lines.map((l) => `${l.debitAmount}/${l.creditAmount}`).join(" "));

        await s.goto(INVOICE);
        await s.see("会計文書履歴");
        const doc = s.sql(
          "select d.doc_number || ':' || d.status || ':' || d.total_debit::int || ':' || (select string_agg(l.credit_account_code || '=' || l.credit_amount::int, ' ' order by l.sort_order) from app.accounting_document_lines l where l.document_id = d.id) from app.accounting_documents d",
        );
        s.check("転記された会計文書の明細も同じ分かれ方", /:POSTED:177100:4100=100000 4190=61000 2200=16100$/.test(doc), doc);
        await s.checkVisible("請求書の詳細に会計文書の番号が出る", /ACC-\d{4}-00001/);
      },
    },
    {
      caption: "税区分マスタに売上高科目（4000）を入れて出し直す — 製品は税区分の科目へ、再研磨は注文種別の科目のまま",
      run: async (s) => {
        // 税区分マスタ（MS0F）の科目は、この機能の「2 番目の落ち先」。値を入れるのは準備なので SQL で行う。
        s.sqlExec("update app.tax_categories set sales_account_code = '4000' where code = 'TAXABLE'");
        const same = await exportCsv(s, "反対仕訳の前 — 出し直しても中身は変わらない", /^会計連携CSV（再ダウンロード）$/);
        s.check("転記済みの文書は、マスタを直しても中身が変わらない（4100 のまま）", creditTotals(same.lines) === "2200=16100 4100=100000 4190=61000", creditTotals(same.lines));

        await reverse(s, "税区分マスタの売上高科目を設定したため出し直す");
        await s.shot("反対仕訳を作成した請求書");
        const { csv, lines } = await exportCsv(s, "反対仕訳のあとの操作メニュー", /^会計連携CSV$/);
        console.log(csv);
        s.check("貸方: 製品 100,000 は税区分の 4000 / 再研磨 61,000 は 4190 のまま", creditTotals(lines) === "2200=16100 4000=100000 4190=61000", creditTotals(lines));
        s.check("既定の 4100 にはもう落ちない（税区分の科目が既定より先）", !lines.some((l) => l.creditAccount === "4100"), creditTotals(lines));
      },
    },
    {
      caption: "再研磨の科目を空に戻して出し直す — 売上は従来どおり 1 行（税区分の科目）にまとまる",
      run: async (s) => {
        const p = s.page;
        await openSettingsEditor(s);
        await s.fill(p.getByRole("textbox", { name: "再研磨", exact: true }), "");
        await saveSettings(s);
        const text = await viewRow(s, "再研磨", /税区分・既定に従う/);
        s.check("再研磨の行が「税区分・既定に従う」に戻る", /税区分・既定に従う/.test(text), text);
        s.check("DB: 注文種別 → 科目は空", savedByOrderType(s).replace(/\s/g, "") === "{}", savedByOrderType(s));

        await reverse(s, "再研磨の売上高科目を外したため出し直す");
        const { csv, lines } = await exportCsv(s, "再研磨の科目を外したあとの操作メニュー", /^会計連携CSV$/);
        console.log(csv);
        s.check("仕訳は 2 行（売上 1 行 + 消費税 1 行）", lines.length === 2, csv.replace(/\r?\n/g, " ⏎ "));
        s.check("貸方: 売上 161,000 が税区分の 4000 にまとまる", creditTotals(lines) === "2200=16100 4000=161000", creditTotals(lines));

        await s.goto(INVOICE);
        await s.see("会計文書履歴");
        const docs = s.sql("select string_agg(doc_number || ':' || status, ' ' order by doc_seq) from app.accounting_documents");
        s.check("会計文書は 転記 → 反対仕訳 → 転記 → 反対仕訳 → 転記 の 5 枚が連番で残る", /^ACC-\d{4}-00001:\S+ ACC-\d{4}-00002:\S+ ACC-\d{4}-00003:\S+ ACC-\d{4}-00004:\S+ ACC-\d{4}-00005:POSTED$/.test(docs), docs);
      },
    },
    {
      caption: "税区分の科目も空にすると、売上は既定の売上高科目（4100）へ落ちる — 3 番目の落ち先",
      run: async (s) => {
        s.sqlExec("update app.tax_categories set sales_account_code = null where code = 'TAXABLE'");
        await reverse(s, "税区分マスタの売上高科目を外したため出し直す");
        const { csv, lines } = await exportCsv(s, "税区分の科目も外したあとの操作メニュー", /^会計連携CSV$/);
        console.log(csv);
        s.check("貸方: 売上 161,000 が既定の 4100 にまとまる", creditTotals(lines) === "2200=16100 4100=161000", creditTotals(lines));
        await s.switchUser("admin", "/settings/accounting/documents");
        await s.see(/ACC-\d{4}-\d{5}/);
      },
    },
  ],
};
