/**
 * 請求の流れ（process/billing）— 締日処理 → 請求書の生成 → 発行 → 送付。
 *
 * 始まり: シードの未処理の締日（デモ商事・2026/07/31 締め・対象出荷 1 件）。
 * 「締日処理を実行」は今日までの全顧客をまとめて締める操作で、結果がシードの
 * 出荷日と実行日の関係で変わるため、ここでは既にある締日を開くところから始める。
 * 会計連携CSV は場所を示すだけ（ダウンロードは録画に写らず、検査にもならない）。
 */

import type { Walkthrough } from "./types";

export const billing: Walkthrough = {
  id: "process-billing",
  docPage: "process/billing",
  title: "請求の流れ — 締日処理から請求書の送付まで",
  steps: [
    {
      caption: "締日処理を開く — 顧客ごとに、締日までの出荷がまとまっている",
      run: async (w) => {
        const p = w.page;
        await w.goto("/billing/closings");
        await w.see("未処理");
        await w.click(p.getByRole("row", { name: /2026\/07\/31/ }).getByText("デモ商事株式会社").first());
        await w.waitForUrl(/\/billing\/closings\/[0-9a-f-]{36}$/);
        await w.see("対象出荷");
      },
    },
    {
      caption: "請求書を生成する — 対象の出荷から請求書（下書き）ができる",
      run: async (w) => {
        await w.click(w.page.getByRole("button", { name: "請求書を生成" }).first());
        await w.clickInDialog("請求書を生成");
        await w.waitForUrl(/\/billing\/invoices\/INV-\d{6}-\d{5}$/);
        await w.see("合計金額（税込）");
      },
    },
    {
      caption: "請求書を発行する — 内容と金額を確かめてから発行する。発行後は金額が動かない",
      run: async (w) => {
        await w.menu("発行");
        await w.clickInDialog("発行");
        await w.see("発行済");
      },
    },
    {
      caption: "顧客へ送ったら「送付済み」にする — 会計ソフトへは会計連携CSVで渡す",
      run: async (w) => {
        await w.menu("送付済みにする");
        await w.clickInDialog("送付済みにする");
        await w.see("送付済");
        // 会計連携CSV は操作メニューにある（ここでは場所を示すだけで、書き出しはしない）。
        await w.click(w.page.getByRole("button", { name: "操作メニュー" }).first());
        await w.see("会計連携CSV");
      },
    },
  ],
};
