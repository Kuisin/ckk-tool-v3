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
      // （購買デモシードの仕入実績から「参照価格 <日付>」バッジが付く）
      await page.getByText(/参照価格/).first().waitFor();
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
  // ── 購買: 購買依頼（PU04）──────────────────────────────────────────────────
  {
    id: "purchase-request-list-01",
    docPage: "apps/purchase-request/user",
    path: "/purchase/purchase-requests",
    steps: async (page) => {
      await page.getByText("PRQ-202607-00001").first().waitFor();
    },
  },
  {
    id: "purchase-request-detail-01",
    docPage: "apps/purchase-request/user",
    path: "/purchase/purchase-requests/PRQ-202607-00002",
    steps: async (page) => {
      await page.getByText("発注書へ変換").first().waitFor();
    },
  },
  // ── 購買: 素材発注書（PU03）────────────────────────────────────────────────
  {
    id: "purchase-order-list-01",
    docPage: "apps/purchase-order/user",
    path: "/purchase/purchase-orders",
    steps: async (page) => {
      await page.getByText("PO-202607-00001").first().waitFor();
    },
  },
  {
    id: "purchase-order-detail-01",
    docPage: "apps/purchase-order/user",
    path: "/purchase/purchase-orders/PO-202607-00001",
    steps: async (page) => {
      await page.getByText("入荷完了").first().waitFor();
    },
  },
  // ── 購買: 素材入荷（PU01）──────────────────────────────────────────────────
  {
    id: "material-receipt-list-01",
    docPage: "apps/material-receipt/user",
    path: "/purchase/material-receipts",
    steps: async (page) => {
      await page.getByText("直接調達").first().waitFor();
    },
  },
  {
    id: "material-receipt-detail-01",
    docPage: "apps/material-receipt/user",
    path: "/purchase/material-receipts/db300000-0000-4000-8000-000000000001",
    steps: async (page) => {
      await page.getByText("入荷日").first().waitFor();
    },
  },
  // ── 購買: 外注依頼（PU02）──────────────────────────────────────────────────
  {
    id: "outsource-order-list-01",
    docPage: "apps/outsource-order/user",
    path: "/purchase/outsource-orders",
    steps: async (page) => {
      await page.getByText("デモ研磨工業").first().waitFor();
    },
  },
  // ── 生産: 指示書（PD02）────────────────────────────────────────────────────
  {
    id: "work-order-list-01",
    docPage: "apps/work-order/user",
    path: "/production/work-orders",
    steps: async (page) => {
      await page.getByText("9002").first().waitFor();
    },
  },
  {
    id: "work-order-detail-01",
    docPage: "apps/work-order/user",
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
    docPage: "apps/work-order/user",
    path: "/production/work-orders/new?salesOrder=e0000000-0000-4000-8000-000000000002",
    steps: async (page) => {
      await page.getByText("工程リスト").first().waitFor();
    },
  },
  // ── 生産: 承認管理（PD03）──────────────────────────────────────────────────
  {
    id: "approval-list-01",
    docPage: "apps/approval/user",
    path: "/production/approvals",
    steps: async (page) => {
      await page.getByText("9002").first().waitFor();
    },
  },
  {
    id: "approval-panel-01",
    docPage: "apps/approval/user",
    path: "/production/work-orders/9002",
    steps: async (page) => {
      await page.getByText("承認状況").first().waitFor();
    },
  },
  // ── 生産: 在庫管理（PD04）──────────────────────────────────────────────────
  {
    id: "inventory-products-01",
    docPage: "apps/product-inventory/user",
    path: "/production/inventory",
    steps: async (page) => {
      await page.getByText("超硬エンドミル").first().waitFor();
    },
  },
  {
    id: "inventory-locations-01",
    docPage: "apps/product-inventory/user",
    path: "/production/inventory?tab=locations",
    steps: async (page) => {
      await page.getByText("資材倉庫A").filter({ visible: true }).first().waitFor();
    },
  },
  {
    id: "inventory-materials-01",
    docPage: "apps/material-inventory/user",
    path: "/production/inventory?tab=materials",
    steps: async (page) => {
      await page.getByText("B01A0001").first().waitFor();
    },
  },
  {
    id: "inventory-wip-01",
    docPage: "apps/material-inventory/user",
    path: "/production/inventory?tab=wip",
    steps: async (page) => {
      await page.getByText("9001").filter({ visible: true }).first().waitFor();
    },
  },
  // ── 出荷: 出荷書（SH01）────────────────────────────────────────────────────
  {
    id: "shipping-order-list-01",
    docPage: "apps/shipping-order/user",
    path: "/shipping/shipping-orders",
    steps: async (page) => {
      await page.getByText("SHP-202607-00001").first().waitFor();
    },
  },
  {
    id: "shipping-order-detail-01",
    docPage: "apps/shipping-order/user",
    path: "/shipping/shipping-orders/SHP-202607-00001",
    steps: async (page) => {
      await page.getByText("明細").first().waitFor();
    },
  },
  // ── 出荷: 納品書（SH02）────────────────────────────────────────────────────
  {
    id: "delivery-note-list-01",
    docPage: "apps/delivery-note/user",
    path: "/shipping/delivery-notes",
    steps: async (page) => {
      await page.getByText("DRN-202607-00001").first().waitFor();
    },
  },
  {
    id: "delivery-note-detail-01",
    docPage: "apps/delivery-note/user",
    path: "/shipping/delivery-notes/DRN-202607-00001",
    steps: async (page) => {
      await page.getByText("納品方法").first().waitFor();
    },
  },
  // ── 請求: 請求書（BL01）────────────────────────────────────────────────────
  {
    id: "invoice-list-01",
    docPage: "apps/invoice/user",
    path: "/billing/invoices",
    steps: async (page) => {
      await page.getByText("INV-202606-00001").first().waitFor();
    },
  },
  {
    id: "invoice-detail-01",
    docPage: "apps/invoice/user",
    path: "/billing/invoices/INV-202606-00001",
    steps: async (page) => {
      await page.getByText("支払期限").first().waitFor();
    },
  },
  // ── 請求: 締日処理（BL02）──────────────────────────────────────────────────
  {
    id: "billing-closing-list-01",
    docPage: "apps/billing-closing/user",
    path: "/billing/closings",
    steps: async (page) => {
      await page.getByText("デモ商事株式会社").first().waitFor();
    },
  },
  {
    id: "billing-closing-detail-01",
    docPage: "apps/billing-closing/user",
    path: "/billing/closings/dd000000-0000-4000-8000-000000000041",
    steps: async (page) => {
      await page.getByText("請求書を生成").first().waitFor();
    },
  },
  // ── マスタ: 顧客（MS01）────────────────────────────────────────────────────
  {
    id: "master-customer-list-01",
    docPage: "masters/customer/user",
    path: "/master/customers?q=%E3%83%87%E3%83%A2",
    steps: async (page) => {
      await page.getByText("デモ商事株式会社").first().waitFor();
    },
  },
  {
    id: "master-customer-branches-01",
    docPage: "masters/customer/user",
    path: "/master/customers/d0000000-0000-4000-8000-000000000001?tab=branches",
    steps: async (page) => {
      await page.getByText("大阪支店").first().waitFor();
    },
  },
  // ── マスタ: 最終需要家（MS02）──────────────────────────────────────────────
  {
    id: "master-end-user-list-01",
    docPage: "masters/end-user/user",
    path: "/master/end-users?q=%E3%83%87%E3%83%A2",
    steps: async (page) => {
      await page.getByText("デモ電子工業").first().waitFor();
    },
  },
  // ── マスタ: 製品（MS03）────────────────────────────────────────────────────
  {
    id: "master-product-list-01",
    docPage: "masters/product/user",
    path: "/master/products",
    steps: async (page) => {
      await page.getByText("超硬エンドミル").first().waitFor();
    },
  },
  {
    id: "master-product-routes-01",
    docPage: "masters/product/user",
    path: "/master/products/9001?tab=routes",
    steps: async (page) => {
      await page.getByText("標準工程").first().waitFor();
    },
  },
  // ── マスタ: 材種（MS04）────────────────────────────────────────────────────
  {
    id: "master-material-type-list-01",
    docPage: "masters/material-type/user",
    path: "/master/material-types?q=A02",
    steps: async (page) => {
      await page.getByText("A02A0001").first().waitFor();
    },
  },
  // ── マスタ: 素材（MS05）────────────────────────────────────────────────────
  {
    id: "master-material-list-01",
    docPage: "masters/material/user",
    path: "/master/materials?q=A02A0001",
    steps: async (page) => {
      await page.getByText("A02A0001-A010-310").first().waitFor();
    },
  },
  // ── マスタ: 外注企業（MS06）────────────────────────────────────────────────
  {
    id: "master-supplier-list-01",
    docPage: "masters/supplier/user",
    path: "/master/suppliers?q=%E3%83%87%E3%83%A2",
    steps: async (page) => {
      await page.getByText("デモ研磨工業").first().waitFor();
    },
  },
  {
    id: "master-supplier-detail-01",
    docPage: "masters/supplier/user",
    path: "/master/suppliers/da000000-0000-4000-8000-000000000004",
    steps: async (page) => {
      await page
        .getByRole("heading", { name: "デモ研磨工業株式会社" })
        .waitFor();
    },
  },
  // ── マスタ: 工程マスタ（MS07）──────────────────────────────────────────────
  {
    id: "master-process-step-list-01",
    docPage: "masters/process-step/user",
    path: "/master/process-steps",
    steps: async (page) => {
      await page.getByText("センタレス").first().waitFor();
    },
  },
  // ── マスタ: 検査表テンプレート（MS08）──────────────────────────────────────
  {
    id: "master-inspection-template-list-01",
    docPage: "masters/inspection-template/user",
    path: "/master/inspection-templates",
    steps: async (page) => {
      await page.getByText("DEMO-INS-01").first().waitFor();
    },
  },
  {
    id: "master-inspection-template-items-01",
    docPage: "masters/inspection-template/user",
    path: "/master/inspection-templates/9102?tab=items",
    steps: async (page) => {
      await page.getByText("検査項目").first().waitFor();
    },
  },
  // ── マスタ: 不良種類（MS09）────────────────────────────────────────────────
  {
    id: "master-defect-type-list-01",
    docPage: "masters/defect-type/user",
    path: "/master/defect-types",
    steps: async (page) => {
      await page.getByText("キズ").first().waitFor();
    },
  },
  // ── マスタ: 承認グループ（MS0A）────────────────────────────────────────────
  {
    id: "master-approval-group-list-01",
    docPage: "masters/approval-group/user",
    path: "/master/approval-groups",
    steps: async (page) => {
      await page.getByText("第一承認グループ").first().waitFor();
    },
  },
  // ── マスタ: 拠点（MS0B）────────────────────────────────────────────────────
  {
    id: "master-plant-list-01",
    docPage: "masters/plant/user",
    path: "/master/plants",
    steps: async (page) => {
      await page.getByText("第二工場").first().waitFor();
    },
  },
  {
    id: "master-plant-regions-01",
    docPage: "masters/plant/user",
    path: "/master/plants/regions",
    steps: async (page) => {
      await page.getByText("関東").first().waitFor();
    },
  },
  // ── マスタ: 採番構成（MS0C）────────────────────────────────────────────────
  {
    id: "master-material-numbering-01",
    docPage: "masters/material-numbering/user",
    path: "/master/material-numbering",
    steps: async (page) => {
      await page.getByText("メーカー").first().waitFor();
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
  // ── 設定: 試算計算（SY02, 管理者）──────────────────────────────────────────
  {
    id: "trial-pricing-hub-01",
    docPage: "apps/trial-estimate/settings",
    path: "/settings/trial-pricing-engine",
    user: "admin",
    steps: async (page) => {
      await page.getByText("計算基準").first().waitFor();
    },
  },
  {
    id: "trial-pricing-criteria-01",
    docPage: "apps/trial-estimate/settings",
    path: "/settings/trial-pricing-engine/criteria/material",
    user: "admin",
    steps: async (page) => {
      await page.getByText("材料原価").first().waitFor();
    },
  },
  {
    id: "trial-pricing-tool-types-01",
    docPage: "apps/trial-estimate/settings",
    path: "/settings/trial-pricing-engine/tool-types/ROUND_BAR",
    user: "admin",
    steps: async (page) => {
      await page.getByText("適用する計算基準").first().waitFor();
    },
  },
  // ── 設定: 製品種別（SY04, 管理者）──────────────────────────────────────────
  {
    id: "product-types-01",
    docPage: "apps/product-type/settings",
    path: "/settings/product-types",
    user: "admin",
    steps: async (page) => {
      await page.getByText("製品種別").first().waitFor();
    },
  },
];
