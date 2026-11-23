/**
 * 購買の流れ（process/purchasing）— 購買依頼 → 承認 → 発注書へ変換 → 承認 → 発注 → 入荷。
 *
 * 始まり: デモの素材（B01A0001-A060-310）と仕入先（デモ精密材料）。書類はすべて
 * この 1 本の中で新しく作る。入荷は「入荷完了」（全量）で記録する — 分割入荷は
 * 操作方法のページが説明する。
 */

import type { Walkthrough } from "./types";

export const purchasing: Walkthrough = {
  id: "process-purchasing",
  docPage: "process/purchasing",
  title: "購買の流れ — 購買依頼から素材の入荷まで",
  steps: [
    {
      caption: "購買依頼を作る — 必要な素材と数量、希望納期を入れる（単価と仕入先は発注書で決める）",
      run: async (w) => {
        const p = w.page;
        await w.goto("/purchase/purchase-requests/new");
        await w.fill(p.getByRole("textbox", { name: /^依頼理由/ }), "指示書の素材が不足しているため");
        await w.pick(p.getByRole("combobox", { name: /^素材/ }).first(), /B01A0001-A060-310/, { search: "B01A0001-A060" });
        await w.pick(p.getByRole("combobox", { name: /^入荷先拠点/ }).first(), /本社工場/);
        await w.fill(p.getByRole("textbox", { name: "数量" }).first(), "50");
        await w.pickDate(p.getByRole("button", { name: /^希望納期/ }).first(), { nextMonthDay: 10 });
        await w.click(p.getByRole("button", { name: "保存", exact: true }));
        await w.waitForUrl(/\/purchase\/purchase-requests\/PRQ-\d{6}-\d{5}$/);
      },
    },
    {
      caption: "承認を依頼する",
      run: async (w) => {
        await w.click(w.page.getByRole("button", { name: "承認依頼", exact: true }).first());
        await w.see("第一承認待ち");
      },
    },
    {
      caption: "承認者が承認する（ここからは承認者の画面）",
      run: async (w) => {
        const p = w.page;
        await w.switchUser("approver", new URL(p.url()).pathname);
        await w.click(p.getByRole("button", { name: "承認", exact: true }).first());
        await w.see("承認済", { exact: true });
      },
    },
    {
      caption: "発注書へ変換する — 仕入先を決めて素材発注書にする（ここからは担当者の画面）",
      run: async (w) => {
        const p = w.page;
        await w.switchUser("staff", new URL(p.url()).pathname);
        await w.click(p.getByRole("button", { name: "発注書へ変換", exact: true }).first());
        const dialog = p.getByRole("dialog").last();
        await w.pick(dialog.getByRole("combobox", { name: "仕入先" }), /デモ精密材料/, { search: "デモ精密" });
        await w.clickInDialog("変換する");
        await w.waitForUrl(/\/purchase\/purchase-orders\/PO-\d{6}-\d{5}$/);
        await w.see("承認依頼が必要です");
      },
    },
    {
      caption: "単価を入れて承認を依頼する — 素材発注書も承認を通る",
      run: async (w) => {
        const p = w.page;
        await w.click(p.getByRole("button", { name: "編集", exact: true }).first());
        await w.waitForUrl(/\/purchase\/purchase-orders\/PO-\d{6}-\d{5}\/edit$/);
        await w.fill(p.getByRole("textbox", { name: "単価" }).first(), "1250");
        await w.click(p.getByRole("button", { name: "保存", exact: true }));
        await w.waitForUrl(/\/purchase\/purchase-orders\/PO-\d{6}-\d{5}$/);
        await w.click(p.getByRole("button", { name: "承認依頼", exact: true }).first());
        await w.see("第一承認待ち");
        await w.switchUser("approver", new URL(p.url()).pathname);
        await w.click(p.getByRole("button", { name: "承認", exact: true }).first());
        await w.see("承認済", { exact: true });
      },
    },
    {
      caption: "発注する — 仕入先へ発注したら「発注」を押す。入荷予定として在庫の見込みに入る（担当者の画面）",
      run: async (w) => {
        const p = w.page;
        await w.switchUser("staff", new URL(p.url()).pathname);
        await w.see("発注できます");
        await w.click(p.getByRole("button", { name: "発注", exact: true }).first());
        await w.clickInDialog("発注する");
        await w.see("入荷を待っています");
      },
    },
    {
      caption: "素材が届いたら入荷を記録する — 「入荷完了」で素材在庫が増える",
      run: async (w) => {
        await w.click(w.page.getByRole("button", { name: "入荷完了", exact: true }).first());
        await w.clickInDialog("入荷完了にする");
        await w.see("入荷完了", { exact: true });
      },
    },
  ],
};
