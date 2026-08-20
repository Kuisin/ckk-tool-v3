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
  /** "admin" = system 権限の管理者（demo1）で撮る（/settings/* 用）。既定は demo_shot。 */
  user?: "admin";
  /** "kiosk" = 現場タブレットアプリ（別ポート・端末 cookie 付き・縦長画面）で撮る。 */
  app?: "kiosk";
  /** ページ到達後の操作（モーダルを開く・フォームに入力する等）。 */
  steps?: (page: Page) => Promise<void>;
  /** CSS セレクタ — 指定時はその要素だけを撮る。 */
  clip?: string;
  /** ページ全体（スクロール分含む）を撮る。 */
  fullPage?: boolean;
  /** 撮影時に塗りつぶす揮発領域（時計・相対時刻など）。 */
  mask?: string[];
}

/**
 * キオスク（現場タブレット）のログイン。
 * 画面の QR スキャナはカメラ必須で自動化できないため、同じ 2 段階
 * （カード照会 → PIN 照合）を API で実行してセッション cookie を得る。
 * cookie はブラウザコンテキストと共有される。
 */
async function kioskLogin(page: Page): Promise<void> {
  const access = await page.request.post("/api/qr/access", {
    data: { cardId: "SHT1234567890ABC" },
  });
  const { ticket } = (await access.json()) as { ticket: string };
  await page.request.post("/api/kiosk/pin", {
    data: { ticket, purpose: "PIN_VERIFY", pin: "4321" },
  });
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
    docPage: "operations/sales/quote/user",
    path: "/sales/quotes",
  },
  // ── 販売: 試算（SA01）──────────────────────────────────────────────────────
  {
    id: "trial-estimate-list-01",
    docPage: "operations/sales/trial-estimate/user",
    path: "/sales/trial-estimates",
    steps: async (page) => {
      await page.getByText("EST-202607-00001").first().waitFor();
    },
  },
  {
    id: "trial-estimate-new-01",
    docPage: "operations/sales/trial-estimate/user",
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
      // （購買デモシードの仕入実績から「参照価格 <日付>」バッジが付く）
      await page.getByText(/参照価格/).first().waitFor();
    },
  },
  {
    id: "trial-estimate-detail-01",
    docPage: "operations/sales/trial-estimate/user",
    path: "/sales/trial-estimates/EST-202607-00001",
    steps: async (page) => {
      await page.getByText("価格表で使用済み").first().waitFor();
    },
  },
  // ── 販売: 価格表（SA02）────────────────────────────────────────────────────
  {
    id: "price-list-list-01",
    docPage: "operations/sales/price-list/user",
    path: "/sales/price-lists",
    steps: async (page) => {
      await page.getByText("デモ商事株式会社").first().waitFor();
    },
  },
  {
    id: "price-list-detail-01",
    docPage: "operations/sales/price-list/user",
    path: "/sales/price-lists/PRC-202607-00001",
    steps: async (page) => {
      await page.getByText("EST-202607-00001").first().waitFor();
    },
  },
  {
    id: "price-list-discounts-01",
    docPage: "operations/sales/price-list/user",
    path: "/sales/price-lists/PRC-202607-00001?tab=discounts",
    steps: async (page) => {
      await page.getByText("夏季キャンペーン").first().waitFor();
    },
  },
  {
    id: "price-list-edit-01",
    docPage: "operations/sales/price-list/user",
    path: "/sales/price-lists/PRC-202607-00001/edit",
    steps: async (page) => {
      await page.getByText("注文種別: 本番").first().waitFor();
    },
  },
  // ── 販売: 見積書（SA03）────────────────────────────────────────────────────
  {
    id: "quote-detail-01",
    docPage: "operations/sales/quote/user",
    path: "/sales/quotes/QOT-202607-00001",
    steps: async (page) => {
      await page.getByText("50〜99本").first().waitFor();
    },
  },
  {
    // 顧客 + 明細 1 行を入力した状態の新規フォーム（単価が自動で入る様子）
    id: "quote-new-01",
    docPage: "operations/sales/quote/user",
    path: "/sales/quotes/new",
    steps: async (page) => {
      await page.getByRole("combobox", { name: "顧客" }).click();
      await page.getByRole("option", { name: /デモ商事/ }).first().click();
      await page.getByRole("combobox", { name: "製品" }).first().click();
      await page.getByRole("option").first().click();
      // 価格表から単価が解決されて金額が表示されるまで待つ
      await page.getByText("合計（税込）").first().waitFor();
    },
  },
  {
    // 発行モーダル（下書きの QOT-202607-00002 でのみ発行できる）
    id: "quote-issue-01",
    docPage: "operations/sales/quote/user",
    path: "/sales/quotes/QOT-202607-00002",
    steps: async (page) => {
      await page.getByRole("button", { name: "操作メニュー" }).first().click();
      await page.getByRole("menuitem", { name: "発行" }).click();
      await page.getByText("見積書の発行").first().waitFor();
    },
  },
  {
    id: "quote-pdf-01",
    docPage: "operations/sales/quote/user",
    path: "/sales/quotes/QOT-202607-00001?tab=pdf",
    steps: async (page) => {
      await page.getByRole("tab", { name: "PDF" }).waitFor();
    },
  },
  // ── 販売: 注文請書（SA04）──────────────────────────────────────────────────
  {
    id: "order-acceptance-list-01",
    docPage: "operations/sales/order-acceptance/user",
    path: "/sales/order-acceptances",
    steps: async (page) => {
      await page.getByText("ORD-202607-00001").first().waitFor();
    },
  },
  {
    id: "order-acceptance-detail-01",
    docPage: "operations/sales/order-acceptance/user",
    path: "/sales/order-acceptances/ORD-202607-00001",
    steps: async (page) => {
      await page.getByText("価格差異").first().waitFor();
    },
  },
  {
    id: "order-acceptance-detail-02",
    docPage: "operations/sales/order-acceptance/user",
    path: "/sales/order-acceptances/ORD-202607-00002",
    steps: async (page) => {
      // 「伝票展開」→「確定」に改称。
      await page.getByRole("button", { name: "確定" }).first().waitFor();
    },
  },
  // ── 販売: 設計依頼書（SA05）────────────────────────────────────────────────
  {
    id: "design-request-list-01",
    docPage: "operations/sales/design-request/user",
    path: "/sales/design-requests",
    steps: async (page) => {
      await page.getByText("DSG-202607-00001").first().waitFor();
    },
  },
  {
    id: "design-request-new-01",
    docPage: "operations/sales/design-request/user",
    path: "/sales/design-requests/new",
    steps: async (page) => {
      await page.getByText("トリガー").first().waitFor();
    },
  },
  {
    id: "design-request-files-01",
    docPage: "operations/sales/design-request/user",
    path: "/sales/design-requests/DSG-202607-00002?tab=files",
    steps: async (page) => {
      await page.getByText("設計図面_PRD-202607-0001_v2.pdf").first().waitFor();
    },
  },
  // ── 販売: 初心者向けマニュアル用の追加撮影 ────────────────────────────────
  {
    // 試算結果パネル（原価内訳〜見積単価）
    id: "trial-estimate-new-02",
    docPage: "operations/sales/trial-estimate/user",
    path: "/sales/trial-estimates/new",
    steps: async (page) => {
      await page.getByRole("combobox", { name: "材種" }).click();
      await page.getByRole("option", { name: /^B01A0001/ }).click();
      await page.getByRole("combobox", { name: "直径" }).click();
      await page.getByRole("option", { name: "φ6", exact: true }).click();
      await page.getByRole("combobox", { name: "黒皮/研磨" }).click();
      await page.getByRole("option", { name: "研磨", exact: true }).click();
      await page.getByRole("textbox", { name: /^最大径/ }).fill("6");
      await page.getByRole("textbox", { name: /^全長/ }).fill("60");
      await page.getByText(/参照価格/).first().waitFor();
      await page.getByText("試算結果").first().scrollIntoViewIfNeeded();
    },
  },
  {
    id: "trial-estimate-detail-02",
    docPage: "operations/sales/trial-estimate/user",
    path: "/sales/trial-estimates/EST-202607-00001?tab=history",
    steps: async (page) => {
      await page.getByText("素材価格推移").first().waitFor();
    },
  },
  {
    // 下書き試算の操作メニュー（確定 / 製品にリンク / 複製して再試算）
    id: "trial-estimate-detail-03",
    docPage: "operations/sales/trial-estimate/user",
    path: "/sales/trial-estimates/EST-202607-00003",
    steps: async (page) => {
      await page.getByRole("button", { name: "操作メニュー" }).first().click();
      await page.getByRole("menuitem", { name: "確定" }).first().waitFor();
    },
  },
  {
    id: "price-list-new-01",
    docPage: "operations/sales/price-list/user",
    path: "/sales/price-lists/new",
    steps: async (page) => {
      await page.getByText("注文種別: 本番").first().waitFor();
    },
  },
  {
    // 価格表から見積書を作るモーダル（送信はしない）
    id: "price-list-quote-01",
    docPage: "operations/sales/price-list/user",
    path: "/sales/price-lists/PRC-202607-00001",
    steps: async (page) => {
      await page.getByRole("button", { name: "操作メニュー" }).first().click();
      await page.getByRole("menuitem", { name: "見積書を作成" }).first().click();
      await page.getByText("値引き（自動適用）").first().waitFor();
    },
  },
  {
    id: "order-acceptance-new-01",
    docPage: "operations/sales/order-acceptance/user",
    path: "/sales/order-acceptances/new",
    steps: async (page) => {
      await page.getByText("明細 1").first().waitFor();
    },
  },
  {
    id: "order-acceptance-detail-03",
    docPage: "operations/sales/order-acceptance/user",
    path: "/sales/order-acceptances/ORD-202607-00003",
    steps: async (page) => {
      await page.getByText("承認依頼中").first().waitFor();
    },
  },
  {
    // 伝票展開の確認モーダル（展開はしない — 実行するとシードが変わる）
    id: "order-acceptance-deploy-01",
    docPage: "operations/sales/order-acceptance/user",
    path: "/sales/order-acceptances/ORD-202607-00002",
    steps: async (page) => {
      // 「伝票展開」→「確定」に改称（確認モーダルは「確定の確認」）。
      await page.getByRole("button", { name: "確定", exact: true }).click();
      await page.getByText("確定の確認").first().waitFor();
    },
  },
  {
    // 未着手の設計依頼（「着手」ボタンが出ている）
    id: "design-request-detail-01",
    docPage: "operations/sales/design-request/user",
    path: "/sales/design-requests/DSG-202607-00003",
    steps: async (page) => {
      await page.getByRole("button", { name: "着手" }).first().waitFor();
    },
  },
  {
    // 進行中の設計依頼（操作メニューに「完了」）
    id: "design-request-detail-02",
    docPage: "operations/sales/design-request/user",
    path: "/sales/design-requests/DSG-202607-00001",
    steps: async (page) => {
      await page.getByRole("button", { name: "操作メニュー" }).first().click();
      await page.getByRole("menuitem", { name: "完了" }).first().waitFor();
    },
  },
  // ── 購買: 購買依頼（PU01）──────────────────────────────────────────────────
  {
    id: "purchase-request-list-01",
    docPage: "operations/purchasing/purchase-request/user",
    path: "/purchase/purchase-requests",
    steps: async (page) => {
      await page.getByText("PRQ-202607-00001").first().waitFor();
    },
  },
  {
    id: "purchase-request-detail-01",
    docPage: "operations/purchasing/purchase-request/user",
    path: "/purchase/purchase-requests/PRQ-202607-00002",
    steps: async (page) => {
      await page.getByText("発注書へ変換").first().waitFor();
    },
  },
  // ── 購買: 素材発注書（PU02）────────────────────────────────────────────────
  {
    id: "purchase-order-list-01",
    docPage: "operations/purchasing/purchase-order/user",
    path: "/purchase/purchase-orders",
    steps: async (page) => {
      await page.getByText("PO-202607-00001").first().waitFor();
    },
  },
  {
    id: "purchase-order-detail-01",
    docPage: "operations/purchasing/purchase-order/user",
    path: "/purchase/purchase-orders/PO-202607-00001",
    steps: async (page) => {
      await page.getByText("入荷完了").first().waitFor();
    },
  },
  // ── 購買: 素材入荷（PU03）──────────────────────────────────────────────────
  {
    id: "material-receipt-list-01",
    docPage: "operations/purchasing/material-receipt/user",
    path: "/purchase/material-receipts",
    steps: async (page) => {
      await page.getByText("直接調達").first().waitFor();
    },
  },
  {
    id: "material-receipt-detail-01",
    docPage: "operations/purchasing/material-receipt/user",
    path: "/purchase/material-receipts/db300000-0000-4000-8000-000000000001",
    steps: async (page) => {
      await page.getByText("入荷日").first().waitFor();
    },
  },
  // ── 購買: 外注依頼（PU04）──────────────────────────────────────────────────
  {
    id: "outsource-order-list-01",
    docPage: "operations/purchasing/outsource-order/user",
    path: "/purchase/outsource-orders",
    steps: async (page) => {
      await page.getByText("デモ研磨工業").first().waitFor();
    },
  },
  // ── 購買: 初心者向けマニュアル用の追加撮影 ────────────────────────────────
  {
    id: "purchase-request-new-01",
    docPage: "operations/purchasing/purchase-request/user",
    path: "/purchase/purchase-requests/new",
    steps: async (page) => {
      await page.getByRole("button", { name: "明細を追加" }).first().waitFor();
    },
  },
  {
    // 承認依頼中（第一承認グループのみ操作可）の状態
    id: "purchase-request-detail-02",
    docPage: "operations/purchasing/purchase-request/user",
    path: "/purchase/purchase-requests/PRQ-202607-00001",
    steps: async (page) => {
      await page.getByText("承認依頼中").first().waitFor();
    },
  },
  {
    // 変換確認モーダル（確定はしない）
    id: "purchase-request-convert-01",
    docPage: "operations/purchasing/purchase-request/user",
    path: "/purchase/purchase-requests/PRQ-202607-00002",
    steps: async (page) => {
      await page
        .getByRole("button", { name: "発注書へ変換", exact: true })
        .click();
      await page.getByText("発注書へ変換の確認").first().waitFor();
    },
  },
  {
    id: "purchase-order-new-01",
    docPage: "operations/purchasing/purchase-order/user",
    path: "/purchase/purchase-orders/new",
    steps: async (page) => {
      await page.getByText("合計金額").first().waitFor();
    },
  },
  {
    // 下書き状態（「承認依頼」ボタンが出ている）
    id: "purchase-order-detail-02",
    docPage: "operations/purchasing/purchase-order/user",
    path: "/purchase/purchase-orders/PO-202607-00003",
    steps: async (page) => {
      await page.getByRole("button", { name: "承認依頼" }).first().waitFor();
    },
  },
  {
    // 入荷完了の確認モーダル（確定はしない）
    id: "purchase-order-complete-01",
    docPage: "operations/purchasing/purchase-order/user",
    path: "/purchase/purchase-orders/PO-202607-00001",
    steps: async (page) => {
      await page
        .getByRole("button", { name: "入荷完了", exact: true })
        .click();
      await page.getByText("入荷完了の確認").first().waitFor();
    },
  },
  {
    id: "purchase-order-attachments-01",
    docPage: "operations/purchasing/purchase-order/user",
    path: "/purchase/purchase-orders/PO-202607-00001?tab=attachments",
    steps: async (page) => {
      await page.getByText("証憑").first().waitFor();
    },
  },
  {
    id: "material-receipt-new-01",
    docPage: "operations/purchasing/material-receipt/user",
    path: "/purchase/material-receipts/new",
    steps: async (page) => {
      await page.getByText("証憑（任意）").first().waitFor();
    },
  },
  {
    // 直接調達（発注書なし）の入荷例
    id: "material-receipt-detail-02",
    docPage: "operations/purchasing/material-receipt/user",
    path: "/purchase/material-receipts/db300000-0000-4000-8000-000000000002",
    steps: async (page) => {
      await page.getByText("直接調達（発注書なし）").first().waitFor();
    },
  },
  {
    id: "outsource-order-list-02",
    docPage: "operations/purchasing/outsource-order/user",
    path: "/purchase/outsource-orders?status=PENDING",
    steps: async (page) => {
      await page.getByText("デモ研磨工業").first().waitFor();
    },
  },
  {
    // 指示書 9001（進行中）の外注バッジが付いた工程カード
    id: "outsource-order-work-order-01",
    docPage: "operations/purchasing/outsource-order/user",
    path: "/production/work-orders/9001",
    steps: async (page) => {
      // 工程名は SVG の <title>（非表示）にも入るため、見える見出しで待つ
      await page.getByRole("heading", { name: "工程ワークフロー" }).waitFor();
    },
  },
  {
    // 外注日程パネル（9001 は進行中なので入力欄が有効）
    id: "outsource-order-step-01",
    docPage: "operations/purchasing/outsource-order/user",
    path: "/production/work-orders/9001/steps/dc011000-0000-4000-8000-000000000003",
    steps: async (page) => {
      await page.getByText("外注日程").first().waitFor();
    },
  },
  // ── 生産: 指示書（PD02）────────────────────────────────────────────────────
  {
    id: "work-order-list-01",
    docPage: "operations/production/work-order/user",
    path: "/production/work-orders",
    steps: async (page) => {
      await page.getByText("9002").first().waitFor();
    },
  },
  {
    id: "work-order-detail-01",
    docPage: "operations/production/work-order/user",
    path: "/production/work-orders/9001",
    fullPage: true,
    steps: async (page) => {
      await page.getByText("工程ワークフロー").first().waitFor();
      // fullPage 撮影では固定フッターがビューポート位置に焼き込まれるため隠す
      await page.addStyleTag({
        content: ".mantine-AppShell-footer { display: none !important; }",
      });
    },
  },
  {
    id: "work-order-new-01",
    docPage: "operations/production/work-order/user",
    // プリセレクトのクエリは注文明細統合で ?salesOrder → ?orderLine に変わった。
    path: "/production/work-orders/new?orderLine=e0000000-0000-4000-8000-000000000002",
    steps: async (page) => {
      await page.getByText("工程").first().waitFor();
    },
  },
  // ── 生産: 承認管理（PD03）──────────────────────────────────────────────────
  {
    id: "approval-list-01",
    docPage: "operations/production/approval/user",
    path: "/production/approvals",
    steps: async (page) => {
      await page.getByText("9002").first().waitFor();
    },
  },
  {
    id: "approval-panel-01",
    docPage: "operations/production/approval/user",
    path: "/production/work-orders/9002",
    steps: async (page) => {
      await page.getByText("承認状況").first().waitFor();
    },
  },
  // ── 生産: 初心者向けマニュアル用の追加撮影 ────────────────────────────────
  {
    // 指示書ページ側の承認カット。approval-panel-01 と URL が同じなので
    // fullPage で「指示書全体の中の承認状況」として差別化する。
    id: "work-order-approval-01",
    docPage: "operations/production/work-order/user",
    path: "/production/work-orders/9002",
    fullPage: true,
    steps: async (page) => {
      await page.getByText("承認状況").first().waitFor();
    },
  },
  {
    id: "work-order-steps-01",
    docPage: "operations/production/work-order/user",
    path: "/production/work-orders/9001/steps",
    steps: async (page) => {
      await page.getByText("段加工").first().waitFor();
    },
  },
  {
    // 数量・不良の入力（不良行を 1 行出した状態）
    id: "work-order-step-quantity-01",
    docPage: "operations/production/work-order/user",
    path: "/production/work-orders/9001/steps/dc011000-0000-4000-8000-000000000004",
    steps: async (page) => {
      await page.getByText("数量・不良").first().waitFor();
      await page.getByRole("button", { name: "不良を追加" }).first().click();
      await page.getByRole("combobox", { name: "種別" }).first().waitFor();
    },
  },
  {
    // 差し戻しの確認モーダル（実行はしない）
    id: "approval-reject-01",
    docPage: "operations/production/approval/user",
    path: "/production/work-orders/9002",
    steps: async (page) => {
      await page.getByRole("button", { name: "差し戻し" }).first().click();
      await page.getByText("差し戻しの確認").first().waitFor();
    },
  },
  {
    id: "approval-detail-01",
    docPage: "operations/production/approval/user",
    path: "/production/approvals/9002",
    steps: async (page) => {
      await page.getByText("承認状況").first().waitFor();
    },
  },
  {
    // 製品在庫の詳細（在庫 55 / 予約 50 / 利用可能 5）
    id: "inventory-product-detail-01",
    docPage: "operations/production/product-inventory/user",
    path: "/production/inventory/products/dc050000-0000-4000-8000-000000000001",
    steps: async (page) => {
      await page.getByText("ORD-202607-00003-01").first().waitFor();
    },
  },
  {
    // 在庫移動モーダル（保管場所が未割当の行から開く）
    id: "inventory-transfer-01",
    docPage: "operations/production/product-inventory/user",
    path: "/production/inventory",
    steps: async (page) => {
      await page.getByRole("button", { name: "移動" }).first().click();
      await page.getByText("在庫移動").first().waitFor();
    },
  },
  {
    id: "inventory-transactions-01",
    docPage: "operations/production/product-inventory/user",
    path: "/production/inventory/products/dc050000-0000-4000-8000-000000000001?tab=transactions",
    steps: async (page) => {
      await page.getByText("取引履歴").first().waitFor();
    },
  },
  {
    // 素材在庫の詳細（利用可能がマイナス + 入荷予定の ATP タイムライン）
    id: "inventory-material-detail-01",
    docPage: "operations/production/material-inventory/user",
    path: "/production/inventory/materials/dc051000-0000-4000-8000-000000000002",
    fullPage: true,
    steps: async (page) => {
      await page.getByText("PO-202607-90102").first().waitFor();
    },
  },
  {
    id: "inventory-material-transactions-01",
    docPage: "operations/production/material-inventory/user",
    path: "/production/inventory/materials/dc051000-0000-4000-8000-000000000002?tab=transactions",
    steps: async (page) => {
      await page.getByText("取引履歴").first().waitFor();
    },
  },
  // ── 生産: 在庫管理（PD04）──────────────────────────────────────────────────
  {
    id: "inventory-products-01",
    docPage: "operations/production/product-inventory/user",
    path: "/production/inventory",
    steps: async (page) => {
      await page.getByText("超硬エンドミル").first().waitFor();
    },
  },
  {
    id: "inventory-locations-01",
    docPage: "operations/production/product-inventory/user",
    path: "/production/inventory?tab=locations",
    steps: async (page) => {
      await page.getByText("資材倉庫A").filter({ visible: true }).first().waitFor();
    },
  },
  {
    id: "inventory-materials-01",
    docPage: "operations/production/material-inventory/user",
    path: "/production/inventory?tab=materials",
    steps: async (page) => {
      await page.getByText("B01A0001").first().waitFor();
    },
  },
  {
    id: "inventory-wip-01",
    docPage: "operations/production/material-inventory/user",
    path: "/production/inventory?tab=wip",
    steps: async (page) => {
      await page.getByText("9001").filter({ visible: true }).first().waitFor();
    },
  },
  // ── 出荷: 出荷書（SH01）────────────────────────────────────────────────────
  {
    id: "shipping-order-list-01",
    docPage: "operations/shipping/shipping-order/user",
    path: "/shipping/shipping-orders",
    steps: async (page) => {
      await page.getByText("SHP-202607-00001").first().waitFor();
    },
  },
  {
    id: "shipping-order-detail-01",
    docPage: "operations/shipping/shipping-order/user",
    path: "/shipping/shipping-orders/SHP-202607-00001",
    steps: async (page) => {
      await page.getByText("明細").first().waitFor();
    },
  },
  // ── 出荷: 納品書（SH02）────────────────────────────────────────────────────
  {
    id: "delivery-note-list-01",
    docPage: "operations/shipping/delivery-note/user",
    path: "/shipping/delivery-notes",
    steps: async (page) => {
      await page.getByText("DRN-202607-00001").first().waitFor();
    },
  },
  {
    id: "delivery-note-detail-01",
    docPage: "operations/shipping/delivery-note/user",
    path: "/shipping/delivery-notes/DRN-202607-00001",
    steps: async (page) => {
      await page.getByText("納品方法").first().waitFor();
    },
  },
  // ── 請求: 請求書（BL01）────────────────────────────────────────────────────
  {
    id: "invoice-list-01",
    docPage: "operations/billing/invoice/user",
    path: "/billing/invoices",
    steps: async (page) => {
      await page.getByText("INV-202606-00001").first().waitFor();
    },
  },
  {
    id: "invoice-detail-01",
    docPage: "operations/billing/invoice/user",
    path: "/billing/invoices/INV-202606-00001",
    steps: async (page) => {
      await page.getByText("支払期限").first().waitFor();
    },
  },
  // ── 請求: 締日処理（BL02）──────────────────────────────────────────────────
  {
    id: "billing-closing-list-01",
    docPage: "operations/billing/billing-closing/user",
    path: "/billing/closings",
    steps: async (page) => {
      await page.getByText("デモ商事株式会社").first().waitFor();
    },
  },
  {
    id: "billing-closing-detail-01",
    docPage: "operations/billing/billing-closing/user",
    path: "/billing/closings/dd000000-0000-4000-8000-000000000041",
    steps: async (page) => {
      await page.getByText("請求書を生成").first().waitFor();
    },
  },
  // ── 出荷・請求: 初心者向けマニュアル用の追加撮影 ──────────────────────────
  // 確認モーダルは「開くだけ」— 確定を押すとデータが変わり撮影が非決定になる。
  {
    id: "shipping-order-new-01",
    docPage: "operations/shipping/shipping-order/user",
    path: "/shipping/shipping-orders/new",
    steps: async (page) => {
      // 出荷元は「注文請書」ではなく「注文明細」を選ぶ形に変わった。
      await page.getByText("注文明細").first().waitFor();
    },
  },
  {
    id: "shipping-order-menu-01",
    docPage: "operations/shipping/shipping-order/user",
    path: "/shipping/shipping-orders/SHP-202607-00002",
    steps: async (page) => {
      await page.getByRole("button", { name: "操作メニュー" }).first().click();
      await page.getByRole("menuitem", { name: "出荷" }).first().waitFor();
    },
  },
  {
    id: "shipping-order-confirm-01",
    docPage: "operations/shipping/shipping-order/user",
    path: "/shipping/shipping-orders/SHP-202607-00003",
    steps: async (page) => {
      await page.getByRole("button", { name: "操作メニュー" }).first().click();
      await page.getByRole("menuitem", { name: "確定" }).first().click();
      await page.getByText("確定の確認").first().waitFor();
    },
  },
  {
    id: "shipping-order-delivery-notes-01",
    docPage: "operations/shipping/shipping-order/user",
    path: "/shipping/shipping-orders/SHP-202607-00001?tab=delivery-notes",
    steps: async (page) => {
      await page.getByText("DRN-202607-00001").first().waitFor();
    },
  },
  {
    id: "delivery-note-new-01",
    docPage: "operations/shipping/delivery-note/user",
    path: "/shipping/delivery-notes/new?shippingOrder=SHP-202607-00002",
    steps: async (page) => {
      await page.getByText("納品方法").first().waitFor();
    },
  },
  {
    // 価格を載せない納品書（単価・金額の列が無い）
    id: "delivery-note-detail-noprice-01",
    docPage: "operations/shipping/delivery-note/user",
    path: "/shipping/delivery-notes/DRN-202607-00002",
    steps: async (page) => {
      await page.getByText("ユーザー直送").first().waitFor();
    },
  },
  {
    id: "delivery-note-direct-01",
    docPage: "operations/shipping/delivery-note/user",
    path: "/shipping/delivery-notes/new?shippingOrder=SHP-202607-00002",
    steps: async (page) => {
      await page.getByText("ユーザー直送").first().click();
      await page.getByText("最終需要家").first().waitFor();
    },
  },
  {
    id: "delivery-note-issue-01",
    docPage: "operations/shipping/delivery-note/user",
    path: "/shipping/delivery-notes/DRN-202607-00002",
    steps: async (page) => {
      await page.getByRole("button", { name: "操作メニュー" }).first().click();
      await page.getByRole("menuitem", { name: "発行" }).first().click();
      await page.getByText("発行の確認").first().waitFor();
    },
  },
  {
    id: "invoice-items-01",
    docPage: "operations/billing/invoice/user",
    path: "/billing/invoices/INV-202606-00001",
    steps: async (page) => {
      await page.getByText("SHP-202606-00001").first().waitFor();
    },
  },
  {
    id: "invoice-menu-01",
    docPage: "operations/billing/invoice/user",
    path: "/billing/invoices/INV-202606-00001",
    steps: async (page) => {
      await page.getByRole("button", { name: "操作メニュー" }).first().click();
      await page.getByRole("menuitem", { name: "弥生会計CSV" }).first().waitFor();
    },
  },
  {
    id: "invoice-sent-01",
    docPage: "operations/billing/invoice/user",
    path: "/billing/invoices/INV-202606-00001",
    steps: async (page) => {
      await page.getByRole("button", { name: "操作メニュー" }).first().click();
      await page.getByRole("menuitem", { name: "送付済みにする" }).first().click();
      await page.getByText("送付の確認").first().waitFor();
    },
  },
  {
    // 年/月の既定値は実行日由来 — 揮発領域なので mask で塗りつぶす
    id: "billing-closing-run-01",
    docPage: "operations/billing/billing-closing/user",
    path: "/billing/closings",
    steps: async (page) => {
      await page.getByRole("button", { name: "締日処理を実行" }).first().click();
      await page.getByText("締日処理の実行").first().waitFor();
    },
    mask: ['[role="dialog"] [role="combobox"]'],
  },
  {
    id: "billing-closing-generate-01",
    docPage: "operations/billing/billing-closing/user",
    path: "/billing/closings/dd000000-0000-4000-8000-000000000041",
    steps: async (page) => {
      await page.getByRole("button", { name: "請求書を生成" }).first().click();
      await page.getByText("請求書生成の確認").first().waitFor();
    },
  },
  {
    id: "billing-closing-processed-01",
    docPage: "operations/billing/billing-closing/user",
    path: "/billing/closings/dd000000-0000-4000-8000-000000000042",
    steps: async (page) => {
      await page.getByText("INV-202606-00001").first().waitFor();
    },
  },
  // 製品項目・製品種別（SY03/SY04）は system 権限 — 管理者で撮影
  {
    id: "product-items-01",
    docPage: "operations/system/product-type/settings",
    path: "/settings/product-items",
    user: "admin",
    steps: async (page) => {
      await page.getByText("表面処理").first().waitFor();
    },
  },
  {
    id: "product-item-edit-01",
    docPage: "operations/system/product-type/settings",
    path: "/settings/product-items/surfaceTreatment",
    user: "admin",
    steps: async (page) => {
      await page.getByText("選択肢").first().waitFor();
    },
  },
  {
    id: "product-type-edit-01",
    docPage: "operations/system/product-type/settings",
    path: "/settings/product-types/standard",
    user: "admin",
    steps: async (page) => {
      await page.getByText("割り当て項目").first().waitFor();
    },
  },
  {
    // 製品種別を選ぶと、その種別の項目が入力欄として出てくる様子
    id: "product-form-type-01",
    docPage: "operations/system/product-type/settings",
    path: "/master/products/new",
    steps: async (page) => {
      await page.getByRole("combobox", { name: "製品種別" }).click();
      await page.getByRole("option", { name: "標準品" }).first().click();
      await page.getByText("追加項目").first().waitFor();
    },
  },
  // ── マスタ: 取引先（MS01）──────────────────────────────────────────────────
  // 顧客・最終需要家・外注企業を統合した 1 台帳（ロールで使い分ける）。
  {
    id: "master-bp-list-01",
    docPage: "operations/masters/business-partner/user",
    path: "/master/business-partners?q=%E3%83%87%E3%83%A2",
    steps: async (page) => {
      await page.getByText("デモ商事株式会社").first().waitFor();
    },
  },
  {
    id: "master-bp-branches-01",
    docPage: "operations/masters/business-partner/user",
    path: "/master/business-partners/d0000000-0000-4000-8000-000000000001?tab=branches",
    steps: async (page) => {
      await page.getByText("大阪支店").first().waitFor();
    },
  },
  // ── マスタ: 製品（MS04）────────────────────────────────────────────────────
  {
    id: "master-product-list-01",
    docPage: "operations/masters/product/user",
    path: "/master/products",
    steps: async (page) => {
      await page.getByText("超硬エンドミル").first().waitFor();
    },
  },
  {
    id: "master-product-routes-01",
    docPage: "operations/masters/product/user",
    path: "/master/products/9001?tab=routes",
    steps: async (page) => {
      await page.getByText("標準工程").first().waitFor();
    },
  },
  // ── マスタ: 材種（MS05）────────────────────────────────────────────────────
  {
    id: "master-material-type-list-01",
    docPage: "operations/masters/material-type/user",
    path: "/master/material-types?q=A02",
    steps: async (page) => {
      await page.getByText("A02A0001").first().waitFor();
    },
  },
  // ── マスタ: 素材（MS06）────────────────────────────────────────────────────
  {
    id: "master-material-list-01",
    docPage: "operations/masters/material/user",
    path: "/master/materials?q=A02A0001",
    steps: async (page) => {
      await page.getByText("A02A0001-A010-310").first().waitFor();
    },
  },
  // 仕入先・外注先ロールで絞り込んだ一覧と、その詳細（振込先・リードタイム）。
  {
    id: "master-bp-vendor-list-01",
    docPage: "operations/masters/business-partner/user",
    path: "/master/business-partners?q=%E3%83%87%E3%83%A2&role=VENDOR",
    steps: async (page) => {
      await page.getByText("デモ研磨工業").first().waitFor();
    },
  },
  {
    id: "master-bp-vendor-detail-01",
    docPage: "operations/masters/business-partner/user",
    path: "/master/business-partners/da000000-0000-4000-8000-000000000004",
    steps: async (page) => {
      await page
        .getByRole("heading", { name: "デモ研磨工業株式会社" })
        .waitFor();
    },
  },
  // ── マスタ: 工程マスタ（MS08）──────────────────────────────────────────────
  {
    id: "master-process-step-list-01",
    docPage: "operations/masters/process-step/user",
    path: "/master/process-steps",
    steps: async (page) => {
      await page.getByText("センタレス").first().waitFor();
    },
  },
  // ── マスタ: 検査表テンプレート（MS09）──────────────────────────────────────
  {
    id: "master-inspection-template-list-01",
    docPage: "operations/masters/inspection-template/user",
    path: "/master/inspection-templates",
    steps: async (page) => {
      await page.getByText("DEMO-INS-01").first().waitFor();
    },
  },
  {
    id: "master-inspection-template-items-01",
    docPage: "operations/masters/inspection-template/user",
    path: "/master/inspection-templates/9102?tab=items",
    steps: async (page) => {
      await page.getByText("検査項目").first().waitFor();
    },
  },
  // ── マスタ: 不良種類（MS0A）────────────────────────────────────────────────
  {
    id: "master-defect-type-list-01",
    docPage: "operations/masters/defect-type/user",
    path: "/master/defect-types",
    steps: async (page) => {
      await page.getByText("キズ").first().waitFor();
    },
  },
  // ── マスタ: 承認設定（MS0B）────────────────────────────────────────────────
  {
    id: "master-approval-setting-flow-01",
    docPage: "operations/masters/approval-setting/user",
    path: "/master/approval-settings",
    steps: async (page) => {
      await page.getByText("注文請書").first().waitFor();
    },
  },
  {
    // 一覧は既定タブがフローになったので、グループのタブを直に開く
    id: "master-approval-setting-list-01",
    docPage: "operations/masters/approval-setting/user",
    path: "/master/approval-settings?tab=groups",
    steps: async (page) => {
      // 同じ文字列がモバイル用の非表示ブロックにも居るので、可視のものを待つ
      // （first() だと隠れている方を掴んでタイムアウトする）。
      await page
        .getByText("第一承認グループ")
        .filter({ visible: true })
        .first()
        .waitFor();
    },
  },
  // ── マスタ: 拠点（MS0C）────────────────────────────────────────────────────
  {
    id: "master-plant-list-01",
    docPage: "operations/masters/plant/user",
    path: "/master/plants",
    steps: async (page) => {
      await page.getByText("第二工場").first().waitFor();
    },
  },
  {
    id: "master-plant-regions-01",
    docPage: "operations/masters/plant/user",
    path: "/master/plants/regions",
    steps: async (page) => {
      await page.getByText("関東").first().waitFor();
    },
  },
  // ── マスタ: 採番構成（MS07）────────────────────────────────────────────────
  {
    id: "master-material-numbering-01",
    docPage: "operations/masters/material-numbering/user",
    path: "/master/material-numbering",
    steps: async (page) => {
      await page.getByText("メーカー").first().waitFor();
    },
  },
  // ── マスタ（取引先・製品素材系）: 初心者向けマニュアル用の追加撮影 ────────
  // 公開マニュアル用のため、一覧はデモ* レコードだけが写る URL / 検索を使う
  // （レガシー import には実在の取引先名が入っているため）。
  {
    id: "master-bp-new-01",
    docPage: "operations/masters/business-partner/user",
    path: "/master/business-partners/new",
    steps: async (page) => {
      await page.getByText("住所・連絡先").first().waitFor();
    },
  },
  {
    // ロール選択セクション（未選択の状態 — ここで役割を決める）
    id: "master-bp-roles-01",
    docPage: "operations/masters/business-partner/user",
    path: "/master/business-partners/new",
    steps: async (page) => {
      await page.getByText("ロール").first().scrollIntoViewIfNeeded();
      await page.getByText("見積書・注文請書・請求書の宛先").first().waitFor();
    },
  },
  {
    // 顧客ロールにチェックを入れると「顧客情報」セクションが出る
    id: "master-bp-new-customer-01",
    docPage: "operations/masters/business-partner/user",
    path: "/master/business-partners/new",
    steps: async (page) => {
      await page.getByRole("checkbox", { name: "顧客" }).first().check();
      await page.getByText("顧客情報").first().scrollIntoViewIfNeeded();
      await page.getByText("課税区分").first().waitFor();
    },
  },
  {
    // 仕入先・外注先ロールの入力（取引条件 + 振込先）
    id: "master-bp-new-vendor-01",
    docPage: "operations/masters/business-partner/user",
    path: "/master/business-partners/new",
    steps: async (page) => {
      await page
        .getByRole("checkbox", { name: "仕入先・外注先" })
        .first()
        .check();
      await page.getByText("振込先").first().scrollIntoViewIfNeeded();
      await page.getByText("振込先").first().waitFor();
    },
  },
  {
    id: "master-bp-detail-01",
    docPage: "operations/masters/business-partner/user",
    path: "/master/business-partners/d0000000-0000-4000-8000-000000000001",
    steps: async (page) => {
      await page.getByText("デモ商事株式会社").first().waitFor();
    },
  },
  {
    id: "master-bp-branch-new-01",
    docPage: "operations/masters/business-partner/user",
    path: "/master/business-partners/d0000000-0000-4000-8000-000000000001/branches/new",
    steps: async (page) => {
      await page.getByText("担当者名").first().waitFor();
    },
  },
  {
    // 無効化の確認モーダル（実行はしない）
    id: "master-bp-deactivate-01",
    docPage: "operations/masters/business-partner/user",
    path: "/master/business-partners/da000000-0000-4000-8000-000000000005",
    steps: async (page) => {
      await page.getByRole("button", { name: "操作メニュー" }).first().click();
      await page.getByRole("menuitem", { name: "無効化" }).first().click();
      await page.getByText("取引先の無効化").first().waitFor();
    },
  },
  {
    id: "master-product-new-01",
    docPage: "operations/masters/product/user",
    path: "/master/products/new",
    steps: async (page) => {
      await page.getByText("素材仕様").first().waitFor();
    },
  },
  {
    id: "master-product-detail-01",
    docPage: "operations/masters/product/user",
    path: "/master/products/9001",
    steps: async (page) => {
      await page.getByText("超硬エンドミル").first().waitFor();
    },
  },
  {
    id: "master-product-route-new-01",
    docPage: "operations/masters/product/user",
    path: "/master/products/9001/routes/new",
    steps: async (page) => {
      await page.getByText("工程選択").first().waitFor();
    },
  },
  {
    // メーカー・材種・形状を選ぶと材種コードが自動で組み上がる様子
    id: "master-material-type-new-01",
    docPage: "operations/masters/material-type/user",
    path: "/master/material-types/new",
    steps: async (page) => {
      await page.getByRole("combobox", { name: "メーカー" }).first().click();
      await page.getByRole("option", { name: /^A/ }).first().click();
      await page.getByRole("combobox", { name: "メーカー材種" }).click();
      await page.getByRole("option").first().click();
      await page.getByRole("combobox", { name: "形状" }).click();
      await page.getByRole("option", { name: /通常/ }).first().click();
      await page.getByText(/材種コード/).first().waitFor();
    },
  },
  {
    // id は serial のため検索 → 行クリックで開く
    id: "master-material-type-detail-01",
    docPage: "operations/masters/material-type/user",
    path: "/master/material-types?q=A02A0001",
    steps: async (page) => {
      await page.getByText("A02A0001").first().click();
      await page.getByText("材種コード").first().waitFor();
      await page.waitForLoadState("networkidle");
    },
  },
  {
    id: "master-material-type-prices-01",
    docPage: "operations/masters/material-type/user",
    path: "/master/material-types?q=A02A0001",
    steps: async (page) => {
      await page.getByText("A02A0001").first().click();
      await page.getByRole("tab", { name: "既定単価" }).first().click();
      await page.getByText("直径").first().waitFor();
    },
  },
  {
    // 材種の詳細検索モーダル（欄の左の虫めがね）
    id: "master-material-search-01",
    docPage: "operations/masters/material/user",
    path: "/master/materials/new",
    steps: async (page) => {
      await page.getByRole("button", { name: "詳細検索" }).first().click();
      await page.getByText("材種の詳細検索").first().waitFor();
    },
  },
  {
    // 素材コードが自動で組み上がる様子
    id: "master-material-new-01",
    docPage: "operations/masters/material/user",
    path: "/master/materials/new",
    steps: async (page) => {
      await page.getByRole("combobox", { name: "材種" }).first().click();
      await page.getByRole("option", { name: /^A02A0001/ }).first().click();
      await page.getByRole("combobox", { name: /黒皮/ }).first().click();
      await page.getByRole("option", { name: /黒皮/ }).first().click();
      await page.getByText(/素材コード/).first().waitFor();
    },
  },
  {
    id: "master-material-detail-01",
    // 作成/更新日時はシード投入時刻（now()）由来で撮影ごとに変わる — 塗りつぶす
    mask: ["text=/\\d{4}\\/\\d{2}\\/\\d{2} \\d{2}:\\d{2}/"],
    docPage: "operations/masters/material/user",
    path: "/master/materials?q=A02A0001",
    steps: async (page) => {
      await page.getByText(/^A02A0001-/).first().click();
      await page.getByText("素材コード").first().waitFor();
      // 行クリック→詳細は遷移直後に撮ると描画途中が写る（負荷時に顕著）
      await page.waitForLoadState("networkidle");
    },
  },
  {
    id: "master-material-numbering-grades-01",
    docPage: "operations/masters/material-numbering/user",
    path: "/master/material-numbering",
    steps: async (page) => {
      await page.getByRole("tab", { name: "メーカー材種" }).first().click();
      await page.getByText("メーカー材種").first().waitFor();
    },
  },
  {
    id: "master-material-numbering-add-01",
    docPage: "operations/masters/material-numbering/user",
    path: "/master/material-numbering",
    steps: async (page) => {
      await page.getByRole("button", { name: "メーカーを追加" }).first().click();
      await page.getByText("メーカーの追加").first().waitFor();
    },
  },
  {
    id: "master-material-numbering-diameters-01",
    docPage: "operations/masters/material-numbering/user",
    path: "/master/material-numbering",
    steps: async (page) => {
      await page.getByRole("tab", { name: "直径" }).first().click();
      await page.getByText("直径").first().waitFor();
    },
  },
  // ── はじめに: ランチャー / 操作コード ───────────────────────────────────────
  {
    id: "launcher-01",
    docPage: "start",
    path: "/",
    steps: async (page) => {
      const trigger = page.getByRole("button", { name: "アプリ一覧を開く" });
      const search = page.getByPlaceholder("操作コード / アプリ名...");
      await trigger.click();
      try {
        await search.waitFor({ timeout: 3000 });
      } catch {
        // hydration 前にクリックした場合は開かない — もう一度
        await trigger.click();
        await search.waitFor();
      }
    },
  },
  {
    id: "profile-home-01",
    docPage: "user-settings",
    path: "/profile/home",
    steps: async (page) => {
      await page.getByText("お気に入り").first().waitFor();
    },
  },
  {
    id: "profile-preferences-01",
    docPage: "user-settings",
    path: "/profile/preferences",
    steps: async (page) => {
      // プレビュー（固定日時 2026/03/05 のサンプル）が出たら撮る。
      await page.getByText("プレビュー").first().waitFor();
    },
    /*
     * 揮発物なし: タイムゾーンの「その地域のいまの時刻」は開いた一覧にだけ出て、
     * 閉じた入力欄はゾーン名だけ（DisplayPreferencesForm 参照）。プレビューは
     * 固定サンプル時刻なので、mask/clip 無しで決定的に撮れる。
     */
  },
  // ── 設定: 試算計算（SY02, 管理者）──────────────────────────────────────────
  {
    id: "trial-pricing-hub-01",
    docPage: "operations/sales/trial-estimate/settings",
    path: "/settings/trial-pricing-engine",
    user: "admin",
    steps: async (page) => {
      await page.getByText("計算基準").first().waitFor();
    },
  },
  {
    id: "trial-pricing-criteria-01",
    docPage: "operations/sales/trial-estimate/settings",
    path: "/settings/trial-pricing-engine/criteria/material",
    user: "admin",
    steps: async (page) => {
      await page.getByText("材料原価").first().waitFor();
    },
  },
  {
    id: "trial-pricing-tool-types-01",
    docPage: "operations/sales/trial-estimate/settings",
    path: "/settings/trial-pricing-engine/tool-types/ROUND_BAR",
    user: "admin",
    steps: async (page) => {
      await page.getByText("適用する計算基準").first().waitFor();
    },
  },
  // ── 設定: 製品種別（SY04, 管理者）──────────────────────────────────────────
  {
    id: "product-types-01",
    docPage: "operations/system/product-type/settings",
    path: "/settings/product-types",
    user: "admin",
    steps: async (page) => {
      await page.getByText("製品種別").first().waitFor();
    },
  },
  // ── マスタ: 作業場所（MS0D）────────────────────────────────────────────────
  {
    id: "master-work-location-01",
    docPage: "operations/masters/work-location/user",
    path: "/master/work-locations",
    steps: async (page) => {
      await page.getByText("切削エリア").first().waitFor();
    },
  },
  // ── マスタ: 保管場所（MS0E）────────────────────────────────────────────────
  {
    id: "master-storage-location-01",
    docPage: "operations/masters/storage-location/user",
    path: "/master/storage-locations",
    steps: async (page) => {
      await page.getByText("資材倉庫A").first().waitFor();
    },
  },
  {
    id: "master-storage-location-manage-01",
    docPage: "operations/masters/storage-location/user",
    path: "/master/storage-locations",
    steps: async (page) => {
      await page.getByText("本社工場").first().click();
      await page.getByText("保管場所を追加").first().waitFor();
    },
  },
  // ── マスタ（製造定義・拠点系）: 初心者向けマニュアル用の追加撮影 ──────────
  {
    id: "master-process-step-new-01",
    docPage: "operations/masters/process-step/user",
    path: "/master/process-steps/new",
    steps: async (page) => {
      await page.getByText("基本情報").first().waitFor();
    },
  },
  {
    id: "master-process-step-detail-01",
    docPage: "operations/masters/process-step/user",
    path: "/master/process-steps",
    steps: async (page) => {
      await page.getByText("円筒加工").first().click();
      await page.getByText("工程フラグ").first().waitFor();
    },
  },
  {
    id: "master-process-step-dependencies-01",
    docPage: "operations/masters/process-step/user",
    path: "/master/process-steps",
    steps: async (page) => {
      await page.getByText("円筒加工").first().click();
      await page.getByRole("tab", { name: "依存関係" }).first().click();
      await page.getByText("使用依存").first().waitFor();
    },
  },
  {
    // 削除確認モーダル（開くだけ — 実行しない）
    id: "master-defect-type-delete-01",
    docPage: "operations/masters/defect-type/user",
    path: "/master/defect-types",
    steps: async (page) => {
      await page.getByRole("button", { name: "操作" }).first().click();
      await page.getByRole("menuitem", { name: "削除" }).first().click();
      await page.getByText("不良種類の削除").first().waitFor();
    },
  },
  {
    // 編集フォームの「使用依存」セクション
    id: "master-process-step-deps-01",
    docPage: "operations/masters/process-step/user",
    path: "/master/process-steps",
    steps: async (page) => {
      await page.getByText("円筒加工").first().click();
      await page.getByRole("button", { name: "編集" }).first().click();
      // 遷移直後にスクロールすると要素が差し替わるため、見出しの描画を待つだけにする
      await page.getByRole("heading", { name: "使用依存" }).waitFor();
    },
  },
  {
    id: "master-inspection-template-new-01",
    docPage: "operations/masters/inspection-template/user",
    path: "/master/inspection-templates/new",
    steps: async (page) => {
      await page.getByText("検査対象").first().waitFor();
    },
  },
  {
    id: "master-inspection-template-detail-01",
    docPage: "operations/masters/inspection-template/user",
    path: "/master/inspection-templates/9102",
    steps: async (page) => {
      await page.getByText("記録方式").first().waitFor();
    },
  },
  {
    // 数値項目の追加モーダル（合格範囲の入力欄が出た状態）
    id: "master-inspection-template-item-modal-01",
    docPage: "operations/masters/inspection-template/user",
    path: "/master/inspection-templates/9102?tab=items",
    steps: async (page) => {
      await page.getByRole("button", { name: "項目を追加" }).first().click();
      await page.getByRole("combobox", { name: "入力種別" }).click();
      await page.getByRole("option", { name: "数値", exact: true }).click();
      await page.getByText("合格範囲").first().waitFor();
    },
  },
  {
    id: "master-inspection-template-versions-01",
    docPage: "operations/masters/inspection-template/user",
    path: "/master/inspection-templates/9102?tab=versions",
    steps: async (page) => {
      await page.getByText("使用状況").first().waitFor();
    },
  },
  {
    id: "master-defect-type-new-01",
    docPage: "operations/masters/defect-type/user",
    path: "/master/defect-types/new",
    steps: async (page) => {
      await page.getByText("不良種類 新規作成").first().waitFor();
    },
  },
  {
    id: "master-defect-type-edit-01",
    docPage: "operations/masters/defect-type/user",
    path: "/master/defect-types",
    steps: async (page) => {
      await page.getByText("キズ").first().click();
      await page.getByText("不良種類の編集").first().waitFor();
    },
  },
  {
    id: "master-approval-setting-new-01",
    docPage: "operations/masters/approval-setting/user",
    path: "/master/approval-settings/new",
    steps: async (page) => {
      await page.getByText("基本情報").first().waitFor();
    },
  },
  {
    id: "master-approval-setting-members-01",
    docPage: "operations/masters/approval-setting/user",
    path: "/master/approval-settings?tab=groups",
    steps: async (page) => {
      await page.getByText("第一承認グループ（デモ）").first().click();
      await page.getByRole("tab", { name: "メンバー" }).first().click();
      await page.getByRole("button", { name: "メンバーを追加" }).first().waitFor();
    },
  },
  {
    id: "master-approval-setting-member-add-01",
    docPage: "operations/masters/approval-setting/user",
    path: "/master/approval-settings?tab=groups",
    steps: async (page) => {
      await page.getByText("第一承認グループ（デモ）").first().click();
      await page.getByRole("tab", { name: "メンバー" }).first().click();
      await page.getByRole("button", { name: "メンバーを追加" }).first().click();
      await page.getByRole("dialog").first().waitFor();
    },
  },
  {
    id: "master-approval-setting-delegate-add-01",
    docPage: "operations/masters/approval-setting/user",
    path: "/master/approval-settings?tab=groups",
    steps: async (page) => {
      await page.getByText("第一承認グループ（デモ）").first().click();
      await page.getByRole("tab", { name: "代理設定" }).first().click();
      await page.getByRole("button", { name: "代理設定を追加" }).first().click();
      await page.getByText("原承認者").first().waitFor();
    },
  },
  {
    id: "master-plant-new-01",
    docPage: "operations/masters/plant/user",
    path: "/master/plants/new",
    steps: async (page) => {
      await page.getByText("連絡先・住所").first().waitFor();
    },
  },
  {
    id: "master-plant-detail-01",
    docPage: "operations/masters/plant/user",
    path: "/master/plants",
    steps: async (page) => {
      await page.getByText("第二工場").first().click();
      await page.getByText("よみがな").first().waitFor();
    },
  },
  {
    // フロアマップ未登録の空状態（シードには画像を入れていない）
    id: "master-plant-floor-maps-01",
    docPage: "operations/masters/plant/user",
    path: "/master/plants",
    steps: async (page) => {
      await page.getByText("第二工場").first().click();
      await page.getByRole("tab", { name: "フロアマップ" }).first().click();
      await page.getByRole("button", { name: "フロアを追加" }).first().waitFor();
    },
  },
  {
    id: "master-work-location-group-new-01",
    docPage: "operations/masters/work-location/user",
    path: "/master/work-locations",
    steps: async (page) => {
      await page.getByRole("button", { name: "グループ追加" }).first().click();
      await page.getByText("グループの追加").first().waitFor();
    },
  },
  {
    id: "master-work-location-add-01",
    docPage: "operations/masters/work-location/user",
    path: "/master/work-locations",
    steps: async (page) => {
      await page.getByRole("button", { name: "場所を追加" }).first().click();
      await page.getByText("キャパシティ").first().waitFor();
    },
  },
  {
    id: "master-work-location-types-01",
    docPage: "operations/masters/work-location/user",
    path: "/master/work-locations",
    steps: async (page) => {
      await page.getByRole("button", { name: "種別管理" }).first().click();
      await page.getByText("組み込み").first().waitFor();
    },
  },
  {
    id: "master-storage-location-new-01",
    docPage: "operations/masters/storage-location/user",
    path: "/master/storage-locations",
    steps: async (page) => {
      await page.getByRole("button", { name: "新規作成" }).first().click();
      await page.getByText("保管場所の追加").first().waitFor();
    },
  },
  {
    id: "master-storage-location-shelf-01",
    docPage: "operations/masters/storage-location/user",
    path: "/master/storage-locations",
    steps: async (page) => {
      await page.getByText("本社工場").first().click();
      await page.getByRole("button", { name: "棚を追加" }).first().click();
      await page.getByText("棚コード").first().waitFor();
    },
  },
  {
    // フロアマップ未登録のため「地図なし」の案内が出る状態
    id: "master-storage-location-map-01",
    docPage: "operations/masters/storage-location/user",
    path: "/master/storage-locations",
    steps: async (page) => {
      await page.getByText("本社工場").first().click();
      await page.getByText("フロアマップ配置").first().waitFor();
    },
  },
  // ── システム: ユーザー管理（SY01, 管理者）──────────────────────────────────
  {
    id: "settings-users-list-01",
    docPage: "operations/system/user-management/user",
    path: "/settings/users?q=dev_",
    user: "admin",
    steps: async (page) => {
      await page.getByText("dev_").first().waitFor();
    },
  },
  {
    id: "settings-users-detail-01",
    docPage: "operations/system/user-management/user",
    path: "/settings/users?q=dev_",
    user: "admin",
    steps: async (page) => {
      await page.getByText("dev_").first().click();
      await page.getByText("実効権限").first().waitFor();
    },
  },
  // ── システム: アプリ管理（SY05, 管理者）────────────────────────────────────
  {
    id: "settings-apps-01",
    docPage: "operations/system/app-management/user",
    path: "/settings/apps",
    user: "admin",
    steps: async (page) => {
      await page.getByText("試算").first().waitFor();
    },
  },
  // ── システム: ファイル管理（SY06, 管理者）──────────────────────────────────
  {
    id: "settings-files-grants-01",
    docPage: "operations/system/file-management/user",
    path: "/settings/files",
    user: "admin",
    clip: ".mantine-Modal-content",
    steps: async (page) => {
      await page.getByRole("button", { name: /フォルダ権限/ }).click();
      await page.getByText("フォルダ権限").first().waitFor();
    },
  },
  // ── システム: 操作履歴（SY07, 管理者）──────────────────────────────────────
  {
    id: "settings-activity-01",
    docPage: "operations/system/activity-log/user",
    path: "/settings/activity",
    user: "admin",
    steps: async (page) => {
      await page.getByText("操作履歴").first().waitFor();
    },
  },
  {
    id: "settings-activity-detail-01",
    // 作成/更新日時はシード投入時刻（now()）由来で撮影ごとに変わる — 塗りつぶす
    mask: ["text=/\\d{4}\\/\\d{2}\\/\\d{2} \\d{2}:\\d{2}/"],
    docPage: "operations/system/activity-log/user",
    path: "/settings/activity",
    user: "admin",
    steps: async (page) => {
      await page.getByRole("row").nth(1).click();
      await page.getByText("変更内容").first().waitFor();
    },
  },
  // ── システム: QRカード管理（SY08, 管理者）──────────────────────────────────
  {
    id: "kiosk-cards-01",
    docPage: "operations/system/kiosk-card/user",
    path: "/settings/kiosk-cards",
    user: "admin",
    steps: async (page) => {
      await page.getByText("カード").first().waitFor();
    },
  },
  // ── システム: 端末管理（SY09, 管理者）──────────────────────────────────────
  {
    id: "kiosk-devices-01",
    docPage: "operations/system/kiosk-device/user",
    path: "/settings/kiosk-devices",
    user: "admin",
    steps: async (page) => {
      await page.getByText("端末").first().waitFor();
    },
  },
  // ── システム: キオスク設定（SY0A, 管理者）──────────────────────────────────
  {
    id: "kiosk-settings-01",
    docPage: "operations/system/kiosk-settings/user",
    path: "/settings/kiosk",
    user: "admin",
    steps: async (page) => {
      await page.getByText("認証ポリシー").first().waitFor();
    },
  },
  // ── システム: 初心者向けマニュアル用の追加撮影（すべて管理者で撮影）──────
  {
    id: "settings-users-roles-01",
    docPage: "operations/system/user-management/user",
    path: "/settings/users?q=dev_",
    user: "admin",
    steps: async (page) => {
      await page.getByText(/^dev_/).first().click();
      await page.getByText("ロール割当").first().waitFor();
    },
  },
  {
    id: "settings-users-plants-01",
    docPage: "operations/system/user-management/user",
    path: "/settings/users?q=dev_",
    user: "admin",
    steps: async (page) => {
      await page.getByText(/^dev_/).first().click();
      await page.getByText("所属拠点").first().waitFor();
    },
  },
  {
    id: "settings-users-permissions-01",
    docPage: "operations/system/user-management/user",
    path: "/settings/users?q=dev_",
    user: "admin",
    steps: async (page) => {
      await page.getByText(/^dev_/).first().click();
      await page.getByText("実効権限").first().waitFor();
    },
  },
  {
    id: "settings-apps-filter-01",
    docPage: "operations/system/app-management/user",
    path: "/settings/apps",
    user: "admin",
    steps: async (page) => {
      await page.getByRole("combobox", { name: "カテゴリ" }).first().click();
      await page.getByRole("option").first().waitFor();
    },
  },
  {
    id: "settings-activity-filter-01",
    docPage: "operations/system/activity-log/user",
    path: "/settings/activity",
    user: "admin",
    steps: async (page) => {
      await page.getByRole("combobox", { name: "対象" }).first().click();
      await page.getByRole("option").first().waitFor();
    },
  },
  {
    // 変更前 / 変更後 の差分表示
    id: "settings-activity-diff-01",
    docPage: "operations/system/activity-log/user",
    path: "/settings/activity",
    user: "admin",
    steps: async (page) => {
      await page.getByText("更新").first().click();
      await page.getByText(/変更前/).first().waitFor();
    },
  },
  {
    id: "kiosk-cards-issue-01",
    docPage: "operations/system/kiosk-card/user",
    path: "/settings/kiosk-cards",
    user: "admin",
    steps: async (page) => {
      await page.getByRole("button", { name: "カードを発行" }).first().click();
      await page.getByText("カードを発行").first().waitFor();
    },
  },
  {
    id: "kiosk-cards-detail-01",
    docPage: "operations/system/kiosk-card/user",
    path: "/settings/kiosk-cards/7A2B3C4D5E6F7G8H",
    user: "admin",
    steps: async (page) => {
      await page.getByText("最近のログイン").first().waitFor();
    },
  },
  {
    id: "kiosk-devices-create-01",
    docPage: "operations/system/kiosk-device/user",
    path: "/settings/kiosk-devices",
    user: "admin",
    steps: async (page) => {
      await page
        .getByRole("button", { name: "端末プロファイル作成" })
        .first()
        .click();
      await page.getByText("端末プロファイル").first().waitFor();
    },
  },
  {
    // PIN・設定コードは伏せたまま撮る（「表示」は押さない）
    id: "kiosk-devices-detail-01",
    docPage: "operations/system/kiosk-device/user",
    path: "/settings/kiosk-devices/de000000-0000-4000-8000-000000000101",
    user: "admin",
    steps: async (page) => {
      await page.getByText("PIN・設定コード").first().waitFor();
    },
  },
  {
    id: "kiosk-settings-apps-01",
    docPage: "operations/system/kiosk-settings/user",
    path: "/settings/kiosk",
    user: "admin",
    steps: async (page) => {
      await page.getByText("ランチャーに表示するアプリ").first().waitFor();
    },
  },
  {
    id: "kiosk-settings-policy-01",
    docPage: "operations/system/kiosk-settings/user",
    path: "/settings/kiosk",
    user: "admin",
    steps: async (page) => {
      await page.getByText("認証ポリシー").first().waitFor();
    },
  },
  // NOTE: カード割当モーダル（旧 kiosk-cards-assign-01）は撮影を見送り。
  // 管理者コンテキストで /settings/kiosk-cards に遷移できず別画面が写るため
  // （原因未特定 — _docs/manual-plan.md の宿題に記載）。
  // ── キオスク（現場タブレット）: 作業者が見る画面 ──────────────────────────
  {
    // ログイン画面。カメラ映像は毎回変わるので video を mask して決定性を保つ。
    id: "kiosk-login-01",
    docPage: "operations/kiosk/start/user",
    app: "kiosk",
    path: "/login",
    mask: ["video", "text=/\\d+\\/\\d+\\(.\\) \\d+:\\d+/"],
    steps: async (page) => {
      await page.getByText("社員QRカードをスキャンしてください").waitFor();
    },
  },
  {
    // ログイン後のアプリ一覧（ランチャー）
    id: "kiosk-home-01",
    // ヘッダーの時計と作業経過時間は実時刻由来 — 塗りつぶして決定的にする
    mask: ["text=/\\d+\\/\\d+\\(.\\) \\d+:\\d+/", "text=/作業 \\d+:\\d+/"],
    docPage: "operations/kiosk/start/user",
    app: "kiosk",
    path: "/login",
    steps: async (page) => {
      await kioskLogin(page);
      await page.goto("/", { waitUntil: "networkidle" });
      await page.getByText("工程実行").first().waitFor();
    },
  },
  {
    // 本日の担当工程一覧
    id: "kiosk-steps-01",
    // ヘッダーの時計と作業経過時間は実時刻由来 — 塗りつぶして決定的にする
    mask: ["text=/\\d+\\/\\d+\\(.\\) \\d+:\\d+/", "text=/作業 \\d+:\\d+/"],
    docPage: "operations/kiosk/steps/user",
    app: "kiosk",
    path: "/login",
    steps: async (page) => {
      await kioskLogin(page);
      await page.goto("/steps", { waitUntil: "networkidle" });
      await page.getByText(/指示書 #/).first().waitFor();
    },
  },
  {
    // 工程の詳細（開始・一時停止・完了のボタンが出る画面）
    id: "kiosk-step-detail-01",
    // ヘッダーの時計と作業経過時間は実時刻由来 — 塗りつぶして決定的にする
    mask: ["text=/\\d+\\/\\d+\\(.\\) \\d+:\\d+/", "text=/作業 \\d+:\\d+/"],
    docPage: "operations/kiosk/steps/user",
    app: "kiosk",
    path: "/login",
    steps: async (page) => {
      await kioskLogin(page);
      await page.goto("/steps", { waitUntil: "networkidle" });
      await page.getByText(/指示書 #/).first().click();
      await page.getByText("工程一覧へ").first().waitFor();
    },
  },
  {
    id: "kiosk-devices-link-01",
    docPage: "operations/system/kiosk-device/user",
    path: "/settings/kiosk-devices",
    user: "admin",
    steps: async (page) => {
      // リンク待ち端末の行メニューから「端末をリンク」モーダルを開く
      await page
        .getByRole("row", { name: /リンク待ち/ })
        .first()
        .getByRole("button", { name: "操作" })
        .click();
      await page.getByRole("menuitem", { name: "端末をリンク" }).click();
      await page.getByRole("dialog").first().waitFor();
    },
  },
  {
    // 環境別の表示スイッチ（切り替えはしない — 状態を変えず一覧のまま撮る）
    id: "settings-apps-switch-01",
    docPage: "operations/system/app-management/user",
    path: "/settings/apps",
    user: "admin",
    steps: async (page) => {
      await page.getByRole("switch").first().waitFor();
    },
  },
  {
    id: "trial-pricing-material-policy-01",
    docPage: "operations/sales/trial-estimate/settings",
    path: "/settings/trial-pricing-engine/material-policy",
    user: "admin",
    steps: async (page) => {
      await page.getByText("算出方法").first().waitFor();
    },
  },
  {
    id: "trial-pricing-custom-inputs-01",
    docPage: "operations/sales/trial-estimate/settings",
    path: "/settings/trial-pricing-engine/custom-inputs",
    user: "admin",
    steps: async (page) => {
      await page.getByText("キー").first().waitFor();
    },
  },
  {
    id: "trial-pricing-lookups-01",
    docPage: "operations/sales/trial-estimate/settings",
    path: "/settings/trial-pricing-engine/lookups/centerless",
    user: "admin",
    steps: async (page) => {
      await page.getByText("キー列").first().waitFor();
    },
  },
];
