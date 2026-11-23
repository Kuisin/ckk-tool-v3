/**
 * 出荷の流れ（process/shipping）— 出荷書の作成 → 確定 → 出荷 → 納品書を納品済に。
 *
 * 始まり: 完了済みのシードの指示書 #9004（未出荷 50 本）。指示書の「次のステップ」から
 * 出荷書を作るのが実際の入口で、出荷できる明細とロットが入った状態で開く。
 * 受注 150 本に対して 50 本なので一部出荷になる。
 */

import type { Walkthrough } from "./types";

export const shipping: Walkthrough = {
  id: "process-shipping",
  docPage: "process/shipping",
  title: "出荷の流れ — 出荷書の作成から納品まで",
  steps: [
    {
      caption: "完了した指示書から出荷書を作る — 「次のステップ」から開くと、出荷できる明細が入っている",
      run: async (w) => {
        const p = w.page;
        await w.goto("/production/work-orders/9004");
        await w.see("次のステップ: 出荷書の作成");
        await w.click(p.getByRole("link", { name: "出荷書を作成" }).first());
        await w.waitForUrl(/\/shipping\/delivery-orders\/new\?workOrder=9004/);
        // 同じ注文請書に未出荷の明細が他にもあると、まとめるかを聞かれる。
        await w.clickInDialog("この指示書だけ");
        await w.see("数量合計", { exact: false });
        await w.click(p.getByRole("button", { name: "保存", exact: true }));
        // 受注 150 本のうち完成しているのは一部なので、一部出荷として保存する。
        await w.see("一部出荷の確認");
        await w.clickInDialog("一部出荷として保存");
        await w.waitForUrl(/\/shipping\/delivery-orders\/DOR-\d{6}-\d{5}$/);
        await w.see("下書き");
      },
    },
    {
      caption: "出荷書を確定する — 確定すると在庫が引き当てられ、納品書が自動でできる",
      run: async (w) => {
        await w.menu("確定");
        await w.clickInDialog("確定");
        await w.see(/^DRN-\d{6}-\d{5}$/);
      },
    },
    {
      caption: "出荷する — 製品を送り出したら「出荷」を押す。在庫が減り、注文明細が進む",
      run: async (w) => {
        await w.menu("出荷");
        await w.clickInDialog("出荷する");
        await w.toast("出荷しました");
        await w.see("出荷済");
      },
    },
    {
      caption: "納品書を開く — 顧客が受け取ったら「納品済み」にする",
      run: async (w) => {
        const p = w.page;
        await w.click(p.getByRole("link", { name: /^DRN-\d{6}-\d{5}$/ }).first());
        await w.waitForUrl(/\/shipping\/delivery-notes\/DRN-\d{6}-\d{5}$/);
        await w.menu(/納品済/);
        await w.clickInDialog("納品済にする");
        await w.see("納品済");
      },
    },
  ],
};
