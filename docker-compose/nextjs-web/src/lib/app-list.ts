/**
 * app-list.ts — App launcher & home page data source
 *
 * Each entry defines one "app" (a route section).
 * Used by AppLauncher (popover) and HomeApps (dashboard grid).
 *
 * DESIGN NOTES:
 * - [Custom] This is a static config file, not a DB table.
 *   The demo system used a similar pattern with `appList` / `shortcutList`.
 * - [Custom] `requiredPermission` maps to the `permissions.code` column in the DB.
 *   The UI filters the list at runtime based on the current user's permissions
 *   (queried via the `user_permissions` view — see CLAUDE.md RBAC note).
 * - [Custom] Icons use @tabler/icons-react (tree-shakeable, Mantine-aligned).
 *   In the real implementation, import each icon by name; listed as string here for reference.
 */

export type AppCategory =
  | "販売"
  | "購買"
  | "生産"
  | "出荷"
  | "請求"
  | "マスタ"
  | "ドキュメント"
  | "システム";

export interface AppEntry {
  /** Unique key, also used as i18n dict key */
  key: string;
  /** Japanese display label (also used as fallback if i18n not loaded) */
  label: string;
  /** List-screen operation code — see `_specs/operation-code.md` */
  operationCode: string;
  /** Route path relative to / */
  href: string;
  /** Tabler icon name — import as Icon{Name} from @tabler/icons-react */
  icon: string;
  /** App category for grouping */
  category: AppCategory;
  /**
   * Permission code required to see this app.
   * Matches `permissions.code` in the DB.
   * null = visible to all authenticated users.
   */
  requiredPermission: string | null;
}

export const appList: AppEntry[] = [
  // ─── 販売 ──────────────────────────────────────────────────────────────────
  // 業務フロー順: 試算 → 価格表 → 見積書 → 受注請書（設計依頼書は並行フロー）
  {
    key: "trial-estimates",
    label: "試算",
    operationCode: "SA01",
    href: "/sales/trial-estimates",
    icon: "IconCalculator",
    category: "販売",
    // 試算のアクションは price_list を要求する（見積連動の価格表ソース）
    requiredPermission: "price_list",
  },
  {
    key: "price-lists",
    label: "価格表",
    operationCode: "SA02",
    href: "/sales/price-lists",
    icon: "IconCurrencyYen",
    category: "販売",
    requiredPermission: "price_list",
  },
  {
    key: "quotes",
    label: "見積書",
    operationCode: "SA03",
    href: "/sales/quotes",
    icon: "IconFileText",
    category: "販売",
    requiredPermission: "quote",
  },
  {
    // 受注請書 intake（§2）— 監視フォルダ / 優先取込の取込状況一覧が本体。
    // 展開後の注文請書管理（PD01）は /production/sales-orders
    // （取込一覧のヘッダーからリンク）。
    key: "order-acceptances",
    label: "受注請書",
    operationCode: "SA04",
    href: "/sales/order-acceptances",
    icon: "IconClipboardCheck",
    category: "販売",
    requiredPermission: "order_acceptance",
  },
  {
    key: "design-requests",
    label: "設計依頼書",
    operationCode: "SA05",
    href: "/sales/design-requests",
    icon: "IconRuler2",
    category: "販売",
    requiredPermission: "design_request",
  },

  // ─── 購買 ──────────────────────────────────────────────────────────────────
  // 業務フロー順: 購買依頼 → 素材発注書 → 素材入荷（外注依頼は工程外注の別フロー）
  {
    // 業務フロー上、素材発注書の前段（依頼 → 承認 → 発注書へ変換）
    key: "purchase-requests",
    label: "購買依頼",
    operationCode: "PU01",
    href: "/purchase/purchase-requests",
    icon: "IconClipboardList",
    category: "購買",
    requiredPermission: "purchase_order",
  },
  {
    key: "purchase-orders",
    label: "素材発注書",
    operationCode: "PU02",
    href: "/purchase/purchase-orders",
    icon: "IconShoppingCart",
    category: "購買",
    requiredPermission: "purchase_order",
  },
  {
    key: "material-receipts",
    label: "素材入荷",
    operationCode: "PU03",
    href: "/purchase/material-receipts",
    icon: "IconPackageImport",
    category: "購買",
    requiredPermission: "material_receipt",
  },
  {
    key: "outsource-orders",
    label: "外注依頼",
    operationCode: "PU04",
    href: "/purchase/outsource-orders",
    icon: "IconTruckDelivery",
    category: "購買",
    requiredPermission: "outsource_order",
  },

  // ─── 生産 ──────────────────────────────────────────────────────────────────
  {
    key: "work-orders",
    label: "指示書",
    operationCode: "PD02",
    href: "/production/work-orders",
    icon: "IconSettings2",
    category: "生産",
    requiredPermission: "work_order",
  },
  {
    key: "approvals",
    label: "承認管理",
    operationCode: "PD03",
    href: "/production/approvals",
    icon: "IconShieldCheck",
    category: "生産",
    requiredPermission: "approve",
  },
  {
    // 在庫管理 — 旧 製品在庫 (PD04) / 素材在庫 (PD05) を統合した単一アプリ。
    // 製品・素材・仕掛品・ロケーション（保管場所×棚）+ 在庫移動。
    key: "inventory",
    label: "在庫管理",
    operationCode: "PD04",
    href: "/production/inventory",
    icon: "IconBoxSeam",
    category: "生産",
    requiredPermission: "inventory",
  },

  // ─── 出荷 ──────────────────────────────────────────────────────────────────
  {
    key: "shipping-orders",
    label: "出荷書",
    operationCode: "SH01",
    href: "/shipping/shipping-orders",
    icon: "IconTruck",
    category: "出荷",
    requiredPermission: "shipping_order",
  },
  {
    key: "delivery-notes",
    label: "納品書",
    operationCode: "SH02",
    href: "/shipping/delivery-notes",
    icon: "IconReceipt",
    category: "出荷",
    requiredPermission: "delivery_note",
  },

  // ─── 請求 ──────────────────────────────────────────────────────────────────
  {
    key: "invoices",
    label: "請求書",
    operationCode: "BL01",
    href: "/billing/invoices",
    icon: "IconFileInvoice",
    category: "請求",
    requiredPermission: "invoice",
  },
  {
    key: "billing-closings",
    label: "締日処理",
    operationCode: "BL02",
    href: "/billing/closings",
    icon: "IconCalendarDue",
    category: "請求",
    requiredPermission: "billing_closing",
  },

  // ─── マスタ ────────────────────────────────────────────────────────────────
  // 顧客 (旧 MS01) / 最終需要家 (旧 MS02) / 外注企業 (旧 MS03) は 1 つの
  // 取引先マスタに統合済み — 1 法人 1 レコード + ロール付与で使い分ける。
  // MS02 / MS03 は欠番（他マスタの操作コードは据え置き）。
  {
    key: "master-business-partners",
    label: "取引先",
    operationCode: "MS01",
    href: "/master/business-partners",
    icon: "IconBuilding",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-products",
    label: "製品",
    operationCode: "MS04",
    href: "/master/products",
    icon: "IconCylinder",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-material-types",
    label: "材種",
    operationCode: "MS05",
    href: "/master/material-types",
    icon: "IconAtom",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-materials",
    label: "素材",
    operationCode: "MS06",
    href: "/master/materials",
    icon: "IconBolt",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-material-numbering",
    label: "採番構成",
    operationCode: "MS07",
    href: "/master/material-numbering",
    icon: "IconHash",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-process-steps",
    label: "工程マスタ",
    operationCode: "MS08",
    href: "/master/process-steps",
    icon: "IconGitBranch",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-inspection-templates",
    label: "検査表テンプレート",
    operationCode: "MS09",
    href: "/master/inspection-templates",
    icon: "IconListCheck",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-defect-types",
    label: "不良種類",
    operationCode: "MS0A",
    href: "/master/defect-types",
    icon: "IconAlertTriangle",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-approval-groups",
    label: "承認グループ",
    operationCode: "MS0B",
    href: "/master/approval-groups",
    icon: "IconUsersGroup",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-plants",
    label: "拠点",
    operationCode: "MS0C",
    href: "/master/plants",
    icon: "IconBuildingWarehouse",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    // 作業場所（グループ = 機械種別/エリア、場所 = 機械 1 台・1 区画）
    key: "master-work-locations",
    label: "作業場所",
    operationCode: "MS0D",
    href: "/master/work-locations",
    icon: "IconMapPin",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    // 保管場所（拠点内の倉庫・置場 + 棚。フロアマップへのピン配置も行う）
    key: "master-storage-locations",
    label: "保管場所",
    operationCode: "MS0E",
    href: "/master/storage-locations",
    icon: "IconPackages",
    category: "マスタ",
    requiredPermission: "master",
  },

  // ─── ドキュメント ──────────────────────────────────────────────────────────
  {
    // マニュアル（/manual・fumadocs）。公開ページだが launcher からも開ける。
    key: "docs",
    label: "マニュアル",
    operationCode: "DC01",
    href: "/manual/ja",
    icon: "IconBook2",
    category: "ドキュメント",
    requiredPermission: null,
  },
  {
    // 社内ドキュメント（/internal-docs）。端末セットアップ等の管理者向け手順。
    // 公開マニュアル（DC01）とは別権限 — internal_docs を持つ人だけに見せる。
    key: "internal-docs",
    label: "社内ドキュメント",
    operationCode: "DC02",
    href: "/internal-docs/ja",
    icon: "IconBookmarks",
    category: "ドキュメント",
    requiredPermission: "internal_docs",
  },

  // ─── システム ──────────────────────────────────────────────────────────────
  // 採番: SY01 = ユーザー管理、SY02–SY04 = アプリ設定、SY05– = 管理系。
  // （旧 SY01 システム設定ハブは廃止 — 他カテゴリ同様ハブアプリは持たない。）
  {
    // ユーザー管理 — app.users の一覧・詳細（ロール割当・実効権限の確認）。
    key: "user-management",
    label: "ユーザー管理",
    operationCode: "SY01",
    href: "/settings/users",
    icon: "IconUserCog",
    category: "システム",
    requiredPermission: "system",
  },
  {
    // 試算カスタマイズ（計算基準・カスタム入力・カスタム計算 JS）。system 権限。
    key: "trial-pricing-engine",
    label: "試算計算",
    operationCode: "SY02",
    href: "/settings/trial-pricing-engine",
    icon: "IconMathFunction",
    category: "システム",
    requiredPermission: "system",
  },
  {
    // 製品項目 — 入力項目の定義ライブラリ。system 権限。
    key: "product-items",
    label: "製品項目",
    operationCode: "SY03",
    href: "/settings/product-items",
    icon: "IconListDetails",
    category: "システム",
    requiredPermission: "system",
  },
  {
    // 製品種別 — 項目を割り当てるテンプレート。system 権限。
    key: "product-types",
    label: "製品種別",
    operationCode: "SY04",
    href: "/settings/product-types",
    icon: "IconCategory",
    category: "システム",
    requiredPermission: "system",
  },
  {
    // アプリ管理 — 環境別のアプリ表示 ON/OFF（feature_flags）。
    key: "app-management",
    label: "アプリ管理",
    operationCode: "SY05",
    href: "/settings/apps",
    icon: "IconLayoutGrid",
    category: "システム",
    requiredPermission: "system",
  },
  {
    // ファイル管理 — ファイル（SeaweedFS）の Finder 風ブラウザ。閲覧範囲は
    // lib/file-access.ts（system:ADMIN / フォルダ権限 / 所有アプリ権限）で
    // 決まるため誰でも開ける — 権限が無ければ空表示になるだけ。
    key: "file-management",
    label: "ファイル管理",
    operationCode: "SY06",
    href: "/settings/files",
    icon: "IconFolder",
    category: "システム",
    requiredPermission: null,
  },
  {
    // 操作履歴 — 監査ログ（作成・更新・削除の before/after）。
    key: "activity-log",
    label: "操作履歴",
    operationCode: "SY07",
    href: "/settings/activity",
    icon: "IconHistory",
    category: "システム",
    requiredPermission: "system",
  },
  {
    // QRカード管理 — キオスク（共有端末）ログイン用カードの発行・割当・印刷。
    key: "kiosk-cards",
    label: "QRカード管理",
    operationCode: "SY08",
    href: "/settings/kiosk-cards",
    icon: "IconQrcode",
    category: "システム",
    requiredPermission: "kiosk",
  },
  {
    // 端末管理 — キオスク端末の有効化・状態管理・フロアマップ配置。
    key: "kiosk-devices",
    label: "端末管理",
    operationCode: "SY09",
    href: "/settings/kiosk-devices",
    icon: "IconDeviceTablet",
    category: "システム",
    requiredPermission: "kiosk",
  },
  {
    // キオスク設定 — ランチャーのアプリ表示 on/off + 認証ポリシー参照。
    key: "kiosk-settings",
    label: "キオスク設定",
    operationCode: "SY0A",
    href: "/settings/kiosk",
    icon: "IconDeviceTabletCog",
    category: "システム",
    requiredPermission: "kiosk",
  },
  {
    // リンク管理 — メモ / コメント内の外部リンク索引とブロック指定。
    key: "links",
    label: "リンク管理",
    operationCode: "SY0B",
    href: "/settings/links",
    icon: "IconLink",
    category: "システム",
    requiredPermission: "system",
  },
];

/** Home 絞り込み（工程）で使う URL パラメータのキー。 */
export const WORKPROCESS_PARAM = "wp";

/** 有効な工程（カテゴリ）名か判定する。パンくず/URL の検証に使う。 */
export function isAppCategory(value: string): value is AppCategory {
  return value in CATEGORY_COLORS;
}

/** 工程（カテゴリ）で Home を絞り込むリンク先。 */
export function workprocessHomeHref(category: AppCategory): string {
  return `/?${WORKPROCESS_PARAM}=${encodeURIComponent(category)}`;
}

/**
 * Category color mapping for ThemeIcon in AppLauncher and HomeApps.
 * [Custom] Each category gets a consistent color across all views.
 */
export const CATEGORY_COLORS: Record<AppCategory, string> = {
  販売: "blue",
  購買: "teal",
  生産: "violet",
  出荷: "orange",
  請求: "pink",
  マスタ: "gray",
  ドキュメント: "cyan",
  システム: "dark",
};

/**
 * Returns apps grouped by category, preserving the order above.
 */
export function getAppsByCategory(): Array<{
  category: AppCategory;
  apps: AppEntry[];
  color: string;
}> {
  const order: AppCategory[] = [
    "販売",
    "購買",
    "生産",
    "出荷",
    "請求",
    "マスタ",
    "ドキュメント",
    "システム",
  ];
  return order.map((category) => ({
    category,
    apps: appList.filter((app) => app.category === category),
    color: CATEGORY_COLORS[category],
  }));
}
