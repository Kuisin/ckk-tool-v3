/**
 * 生産の流れ（process/production）— 指示書の作成 → 承認（2 段）→ 工程の実行 → 完了・在庫。
 *
 * 始まり: シードの注文明細 ORD-202607-00003-01（受注 150 のうち 40 が未手配）。
 * 工程は 7 つあり、全部を実行すると動画が長くなるので、最初の 1 工程を開始〜完了まで
 * 見せ、残りは同じ操作のくり返しとして、完了済みのシードの指示書 #9004 で
 * 「終わったあとの姿」を見せる。
 *
 * 新しい指示書が保存できるのは、デモシードに準備工程リストがあるから
 * （shared-db/sql/production-demo-seed.sql）。無いと工程構成のエラーで保存できない。
 */

import type { Walkthrough } from "./types";

export const production: Walkthrough = {
  id: "process-production",
  docPage: "process/production",
  title: "生産の流れ — 指示書の作成から工程の実行まで",
  steps: [
    {
      caption: "指示書を作る — 注文明細から開くと、製品・数量・工程リストが入った状態で始まる",
      run: async (w) => {
        const p = w.page;
        await w.goto("/production/work-orders/new?orderLine=e0000000-0000-4000-8000-000000000001");
        await w.see("割当可能残 40", { exact: false });
        await w.see("工程・作業時間");
        // 作業計画: 承認依頼には、社内工程すべてに日付と作業場所が要る。
        const locations = p.getByRole("combobox", { name: "作業場所" });
        const rows = await locations.count();
        for (let i = 0; i < rows; i++) {
          await w.pick(locations.nth(i), /./);
        }
        await w.click(p.getByRole("button", { name: "保存", exact: true }));
        await w.waitForUrl(/\/production\/work-orders\/(WOR-\d{6}-\d{5}|\d+)$/);
        await w.see("承認依頼が必要です");
      },
    },
    {
      caption: "承認を依頼する — 承認されるまで工程は始められない",
      run: async (w) => {
        await w.click(w.page.getByRole("button", { name: "承認依頼", exact: true }).first());
        await w.see(/承認待ち|承認依頼中/);
      },
    },
    {
      caption: "承認者が承認する — 段ごとに承認グループの承認が要る（ここからは承認者の画面）",
      run: async (w) => {
        const p = w.page;
        await w.switchUser("approver", new URL(p.url()).pathname);
        await w.see("承認してください");
        await w.click(p.getByRole("button", { name: "承認", exact: true }).first());
        await w.see(/第 2\/2 段/);
        await w.click(p.getByRole("button", { name: "承認", exact: true }).first());
        await w.see("承認済");
      },
    },
    {
      caption: "最初の工程を始める — 開始できる工程には「開始」が出る（ここからは担当者の画面）",
      run: async (w) => {
        const p = w.page;
        await w.switchUser("staff", new URL(p.url()).pathname);
        await w.see("工程ワークフロー");
        await w.click(p.getByRole("link", { name: "開始", exact: true }).first());
        await w.waitForUrl(/\/production\/work-orders\/\d+\/steps\/[0-9a-f-]{36}/);
        await w.click(p.getByRole("button", { name: /工程開始/ }).first());
        await w.see("数量・不良");
      },
    },
    {
      caption: "工程を完了する — 良品数と不良を確かめて完了すると、次の工程へ数量が渡る",
      run: async (w) => {
        const p = w.page;
        await w.click(p.getByRole("button", { name: "工程完了", exact: true }).first());
        await w.toast("工程を完了しました");
        // 次の工程（切断）へ。残りの工程も同じ操作のくり返しになる。
        await w.click(p.getByRole("link", { name: /^切断/ }).first());
        await w.see(/工程開始/);
      },
    },
    {
      caption: "すべての工程が終わると指示書は「完了」になり、完成品が在庫に入る",
      run: async (w) => {
        await w.goto("/production/work-orders/9004");
        await w.see("完了", { exact: true });
        await w.goto("/inventory");
        await w.see("超硬エンドミル");
        await w.see("利用可能");
      },
    },
  ],
};
