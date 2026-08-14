/**
 * manifest.ts — スクリーンショットの単一の真実源。
 *
 * 各エントリが 1 枚の PNG（content/manual/assets/screenshots/<id>.png）になる。
 * マニュアル側は frontmatter `screenshots: [<id>]` + 本文の相対画像参照で使う
 * （両者は scripts/lint-screenshots.ts が manifest と突き合わせて検証する）。
 *
 * 決定性の注意:
 *  - 「今日」が見える画面（日付ピッカー既定値・当月見出し等）は clip で外すか
 *    mask に入れる。シード由来の固定日付データは問題ない。
 *  - 撮り直しの diff 判定は docs:verify（pixelmatch, 閾値 0.1%）。
 */

import type { Page } from "@playwright/test";

export interface Shot {
  /** PNG ファイル名（拡張子なし）。マニュアルからの参照キー。 */
  id: string;
  /** この画像を使うマニュアルページ（lint の参照チェック対象、記録用）。 */
  docPage: string;
  /** 遷移先パス。 */
  path: string;
  /** ログアウト状態で撮る（storageState を使わない）。 */
  loggedOut?: boolean;
  /** ページ到達後の操作（モーダルを開く・フォームに入力する等）。 */
  steps?: (page: Page) => Promise<void>;
  /** CSS セレクタ — 指定時はその要素だけを撮る。 */
  clip?: string;
  /** ページ全体（スクロール分含む）を撮る。 */
  fullPage?: boolean;
  /** 撮影時に塗りつぶす揮発領域（時計・相対時刻など）。 */
  mask?: string[];
}

export const shots: Shot[] = [
  {
    id: "login-01",
    docPage: "start",
    path: "/login",
    loggedOut: true,
    steps: async (page) => {
      await page
        .getByRole("button", { name: "開発用アカウントでログイン" })
        .click();
      // Collapse 展開後のフォームが出るまで待つ
      await page.getByLabel("ユーザー名").waitFor();
    },
  },
  {
    id: "home-01",
    docPage: "start",
    path: "/",
    steps: async (page) => {
      await page.getByText("お気に入り").or(page.getByText("販売")).first().waitFor();
    },
  },
  {
    id: "quote-list-01",
    docPage: "apps/quote/user",
    path: "/sales/quotes",
  },
  // ── 販売: 試算（SA05）──────────────────────────────────────────────────────
  {
    id: "trial-estimate-list-01",
    docPage: "apps/trial-estimate/user",
    path: "/sales/trial-estimates",
    steps: async (page) => {
      await page.getByText("EST-202607-00001").first().waitFor();
    },
  },
  {
    id: "trial-estimate-new-01",
    docPage: "apps/trial-estimate/user",
    path: "/sales/trial-estimates/new",
    steps: async (page) => {
      // 材料構成（材種 × 直径 × 黒皮/研磨）を選ぶと参照単価が自動セットされる
      await page.getByRole("combobox", { name: "材種" }).click();
      await page.getByRole("option", { name: /^B01A0001/ }).click();
      await page.getByRole("combobox", { name: "直径" }).click();
      await page.getByRole("option", { name: "φ6", exact: true }).click();
      await page.getByRole("combobox", { name: "黒皮/研磨" }).click();
      await page.getByRole("option", { name: "研磨", exact: true }).click();
      await page.getByRole("textbox", { name: /^最大径/ }).fill("6");
      await page.getByRole("textbox", { name: /^全長/ }).fill("60");
      // 参照単価の自動取得（サーバーアクション）が反映されるまで待つ
      // （仕入実績なし → 「既定価格」バッジが付く）
      await page.getByText("既定価格").first().waitFor();
    },
  },
  {
    id: "trial-estimate-detail-01",
    docPage: "apps/trial-estimate/user",
    path: "/sales/trial-estimates/EST-202607-00001",
    steps: async (page) => {
      await page.getByText("価格表で使用済み").first().waitFor();
    },
  },
  // ── 販売: 価格表（SA01）────────────────────────────────────────────────────
  {
    id: "price-list-list-01",
    docPage: "apps/price-list/user",
    path: "/sales/price-lists",
    steps: async (page) => {
      await page.getByText("デモ商事株式会社").first().waitFor();
    },
  },
  {
    id: "price-list-detail-01",
    docPage: "apps/price-list/user",
    path: "/sales/price-lists/PRC-202607-00001",
    steps: async (page) => {
      await page.getByText("EST-202607-00001").first().waitFor();
    },
  },
  {
    id: "price-list-discounts-01",
    docPage: "apps/price-list/user",
    path: "/sales/price-lists/PRC-202607-00001?tab=discounts",
    steps: async (page) => {
      await page.getByText("夏季キャンペーン").first().waitFor();
    },
  },
  {
    id: "price-list-edit-01",
    docPage: "apps/price-list/user",
    path: "/sales/price-lists/PRC-202607-00001/edit",
    steps: async (page) => {
      await page.getByText("注文種別: 本番").first().waitFor();
    },
  },
  // ── 販売: 見積書（SA02）────────────────────────────────────────────────────
  {
    id: "quote-detail-01",
    docPage: "apps/quote/user",
    path: "/sales/quotes/QOT-202607-00001",
    steps: async (page) => {
      await page.getByText("50〜99本").first().waitFor();
    },
  },
  // ── 販売: 受注請書（SA03）──────────────────────────────────────────────────
  {
    id: "order-acceptance-list-01",
    docPage: "apps/order-acceptance/user",
    path: "/sales/order-acceptances",
    steps: async (page) => {
      await page.getByText("ORD-202607-00001").first().waitFor();
    },
  },
  {
    id: "order-acceptance-detail-01",
    docPage: "apps/order-acceptance/user",
    path: "/sales/order-acceptances/ORD-202607-00001",
    steps: async (page) => {
      await page.getByText("価格差異").first().waitFor();
    },
  },
  {
    id: "order-acceptance-detail-02",
    docPage: "apps/order-acceptance/user",
    path: "/sales/order-acceptances/ORD-202607-00002",
    steps: async (page) => {
      await page.getByRole("button", { name: "伝票展開" }).first().waitFor();
    },
  },
  // ── 販売: 設計依頼書（SA04）────────────────────────────────────────────────
  {
    id: "design-request-list-01",
    docPage: "apps/design-request/user",
    path: "/sales/design-requests",
    steps: async (page) => {
      await page.getByText("DSG-202607-00001").first().waitFor();
    },
  },
  {
    id: "design-request-new-01",
    docPage: "apps/design-request/user",
    path: "/sales/design-requests/new",
    steps: async (page) => {
      await page.getByText("トリガー").first().waitFor();
    },
  },
  {
    id: "design-request-files-01",
    docPage: "apps/design-request/user",
    path: "/sales/design-requests/DSG-202607-00002?tab=files",
    steps: async (page) => {
      await page.getByText("設計図面_PRD-202607-0001_v2.pdf").first().waitFor();
    },
  },
];
