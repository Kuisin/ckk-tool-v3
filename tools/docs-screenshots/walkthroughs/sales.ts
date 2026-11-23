/**
 * 販売の流れ（process/sales）— 価格試算 → 価格表 → 見積書 → 注文請書 → 承認 → 確定。
 *
 * 始まり: デモ顧客（デモ商事）と、まだ価格表の無い製品（超硬リーマ φ8×70）。
 * 価格表は 顧客 × 製品 で 1 つしか作れないので、シードに価格表のある製品
 * （超硬エンドミル）は使えない。全部の書類をこの 1 本の中で新しく作る。
 */

import type { Walkthrough } from "./types";

export const sales: Walkthrough = {
  id: "process-sales",
  docPage: "process/sales",
  title: "販売の流れ — 価格試算から受注の確定まで",
  steps: [
    {
      caption: "価格試算を作る — 材料と加工の内容から見積単価を計算する",
      run: async (w) => {
        const p = w.page;
        await w.goto("/sales/trial-estimates/new");
        await w.pick(p.getByRole("combobox", { name: /^見積り先/ }), /デモ商事株式会社$/, { search: "デモ商事" });
        await w.pick(p.getByRole("combobox", { name: /^製品/ }), /超硬リーマ/, { search: "リーマ" });
        await w.pick(p.getByRole("combobox", { name: /^材種/ }), /^B01A0001/);
        await w.pick(p.getByRole("combobox", { name: /^直径/ }), "φ8", { exact: true });
        await w.pick(p.getByRole("combobox", { name: /^黒皮\/研磨/ }), "研磨", { exact: true });
        await w.fill(p.getByRole("textbox", { name: /^最大径/ }), "8");
        await w.fill(p.getByRole("textbox", { name: /^全長/ }), "70");
        await w.see("見積単価（基準）");
        await w.fill(p.getByPlaceholder(/^例: 精密軸/), "リーマ φ8×70 CX400");
        await w.click(p.getByRole("button", { name: "保存", exact: true }));
        await w.waitForUrl(/\/sales\/trial-estimates\/EST-\d{6}-\d{5}$/);
      },
    },
    {
      caption: "価格試算を確定する — 確定した価格試算だけが価格表の単価のもとに使える",
      run: async (w) => {
        await w.menu("確定");
        await w.see("確定", { exact: true });
      },
    },
    {
      caption: "価格表を作る — 顧客と製品の組み合わせで単価を決める",
      run: async (w) => {
        const p = w.page;
        await w.goto("/sales/price-lists/new");
        await w.pick(p.getByRole("combobox", { name: /^顧客/ }), /デモ商事株式会社$/, { search: "デモ商事" });
        await w.pick(p.getByRole("combobox", { name: /^製品/ }), /超硬リーマ/, { search: "リーマ" });
        await w.pick(p.getByRole("combobox", { name: /^価格ソース/ }), /リーマ φ8×70 CX400/);
        await w.pickDate(p.getByRole("button", { name: /^有効開始日/ }), "today");
        await w.click(p.getByRole("button", { name: "保存", exact: true }));
        await w.waitForUrl(/\/sales\/price-lists\/PRC-\d{6}-\d{5}$/);
      },
    },
    {
      caption: "見積書を作る — 顧客と製品を選ぶと、価格表の単価が自動で入る",
      run: async (w) => {
        const p = w.page;
        await w.goto("/sales/quotes/new");
        await w.pick(p.getByRole("combobox", { name: /^顧客/ }), /デモ商事株式会社$/);
        await w.pickDate(p.getByRole("button", { name: /^有効期限/ }), { nextMonthDay: 20 });
        await w.pick(p.getByRole("combobox", { name: "製品" }).first(), /超硬リーマ/, { search: "リーマ" });
        await w.fill(p.getByRole("textbox", { name: "数量" }).first(), "30");
        await w.see("単価（価格表）");
        await w.click(p.getByRole("button", { name: "保存", exact: true }));
        await w.waitForUrl(/\/sales\/quotes\/QOT-\d{6}-\d{5}$/);
      },
    },
    {
      caption: "見積書を発行する — 発行すると顧客へ提出できる状態になる",
      run: async (w) => {
        await w.menu("発行");
        await w.clickInDialog("発行");
        await w.see("発行済");
      },
    },
    {
      caption: "注文請書を作る — 顧客から届いた注文の内容を入力する",
      run: async (w) => {
        const p = w.page;
        await w.goto("/sales/order-acceptances/new");
        await w.pick(p.getByRole("combobox", { name: /^顧客/ }), /デモ商事株式会社$/, { search: "デモ商事" });
        await w.fill(p.getByRole("textbox", { name: /^顧客注文書番号/ }), "PO-2026-1001");
        await w.pick(p.getByRole("combobox", { name: /^見積書/ }), /QOT-/);
        await w.pickDate(p.getByRole("button", { name: /^注文日/ }), "today");
        await w.pick(p.getByRole("combobox", { name: "製品" }).first(), /超硬リーマ/, { search: "リーマ" });
        await w.fill(p.getByRole("textbox", { name: "数量" }).first(), "30");
        await w.pickDate(p.getByRole("button", { name: "納期" }).first(), { nextMonthDay: 25 });
        await w.click(p.getByRole("button", { name: "下書きを作成" }));
        await w.waitForUrl(/\/sales\/order-acceptances\/ORD-\d{6}-\d{5}/);
      },
    },
    {
      caption: "承認を依頼する — 依頼中は内容を編集できない",
      run: async (w) => {
        await w.click(w.page.getByRole("button", { name: "承認依頼", exact: true }).first());
        await w.see("第一承認待ち");
      },
    },
    {
      caption: "承認者が内容を確かめて承認する — ここからは承認者の画面",
      run: async (w) => {
        await w.switchUser("approver", new URL(w.page.url()).pathname);
        await w.click(w.page.getByRole("button", { name: "承認", exact: true }).first());
        await w.see("確定できます");
      },
    },
    {
      caption: "受注を確定する — 明細ごとに注文明細が作られ、製造の指示へ進める",
      run: async (w) => {
        await w.switchUser("staff", new URL(w.page.url()).pathname);
        await w.click(w.page.getByRole("button", { name: "確定", exact: true }).first());
        await w.clickInDialog("展開する");
        await w.see(/^ORD-\d{6}-\d{5}-01$/);
      },
    },
  ],
};
