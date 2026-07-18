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
  {
    key: "price-lists",
    label: "価格表",
    operationCode: "SA01",
    href: "/sales/price-lists",
    icon: "IconCurrencyYen",
    category: "販売",
    requiredPermission: "price_list",
  },
  {
    key: "quotes",
    label: "見積書",
    operationCode: "SA02",
    href: "/sales/quotes",
    icon: "IconFileText",
    category: "販売",
    requiredPermission: "quote",
  },
  {
    // 受注請書 intake（§2）— 監視フォルダ / 優先取込の取込状況一覧が本体。
    // 展開後の注文請書管理（旧 PD01）は /production/sales-orders
    // （取込一覧のヘッダーからリンク）。
    key: "order-acceptances",
    label: "受注請書",
    operationCode: "SA03",
    href: "/sales/order-acceptances",
    icon: "IconClipboardCheck",
    category: "販売",
    requiredPermission: "order_acceptance",
  },
  {
    key: "design-requests",
    label: "設計依頼書",
    operationCode: "SA04",
    href: "/sales/design-requests",
    icon: "IconRuler2",
    category: "販売",
    requiredPermission: "design_request",
  },
  {
    key: "trial-estimates",
    label: "試算",
    operationCode: "SA05",
    href: "/sales/trial-estimates",
    icon: "IconCalculator",
    category: "販売",
    requiredPermission: "quote",
  },

  // ─── 購買 ──────────────────────────────────────────────────────────────────
  {
    key: "material-receipts",
    label: "素材入荷",
    operationCode: "PU01",
    href: "/purchase/material-receipts",
    icon: "IconPackageImport",
    category: "購買",
    requiredPermission: "material_receipt",
  },
  {
    key: "outsource-orders",
    label: "外注依頼",
    operationCode: "PU02",
    href: "/purchase/outsource-orders",
    icon: "IconTruckDelivery",
    category: "購買",
    requiredPermission: "outsource_order",
  },
  {
    // 業務フロー上、素材発注書の前段（依頼 → 承認 → 発注書へ変換）
    key: "purchase-requests",
    label: "購買依頼",
    operationCode: "PU04",
    href: "/purchase/purchase-requests",
    icon: "IconClipboardList",
    category: "購買",
    requiredPermission: "purchase_order",
  },
  {
    key: "purchase-orders",
    label: "素材発注書",
    operationCode: "PU03",
    href: "/purchase/purchase-orders",
    icon: "IconShoppingCart",
    category: "購買",
    requiredPermission: "purchase_order",
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
    key: "product-inventory",
    label: "製品在庫",
    operationCode: "PD04",
    href: "/production/inventory/products",
    icon: "IconBoxSeam",
    category: "生産",
    requiredPermission: "inventory",
  },
  {
    key: "material-inventory",
    label: "素材在庫",
    operationCode: "PD05",
    href: "/production/inventory/materials",
    icon: "IconStack2",
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
  {
    key: "master-customers",
    label: "顧客",
    operationCode: "MS01",
    href: "/master/customers",
    icon: "IconBuilding",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-end-users",
    label: "最終需要家",
    operationCode: "MS02",
    href: "/master/end-users",
    icon: "IconUsers",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-products",
    label: "製品",
    operationCode: "MS03",
    href: "/master/products",
    icon: "IconCylinder",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-material-types",
    label: "材種",
    operationCode: "MS04",
    href: "/master/material-types",
    icon: "IconAtom",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-materials",
    label: "素材",
    operationCode: "MS05",
    href: "/master/materials",
    icon: "IconBolt",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-suppliers",
    label: "外注企業",
    operationCode: "MS06",
    href: "/master/suppliers",
    icon: "IconBuildingFactory2",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-process-steps",
    label: "工程マスタ",
    operationCode: "MS07",
    href: "/master/process-steps",
    icon: "IconGitBranch",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-inspection-templates",
    label: "検査表テンプレート",
    operationCode: "MS08",
    href: "/master/inspection-templates",
    icon: "IconListCheck",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-defect-types",
    label: "不良種類",
    operationCode: "MS09",
    href: "/master/defect-types",
    icon: "IconAlertTriangle",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-approval-groups",
    label: "承認グループ",
    operationCode: "MS0A",
    href: "/master/approval-groups",
    icon: "IconUsersGroup",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-factories",
    label: "工場",
    operationCode: "MS0B",
    href: "/master/factories",
    icon: "IconBuildingWarehouse",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-material-numbering",
    label: "採番構成",
    operationCode: "MS0C",
    href: "/master/material-numbering",
    icon: "IconHash",
    category: "マスタ",
    requiredPermission: "master",
  },

  // ─── システム ──────────────────────────────────────────────────────────────
  {
    // システム設定ハブ（アプリ設定・システム管理）。
    key: "system-settings",
    label: "システム設定",
    operationCode: "SY01",
    href: "/settings",
    icon: "IconAdjustments",
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
];

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
    "システム",
  ];
  return order.map((category) => ({
    category,
    apps: appList.filter((app) => app.category === category),
    color: CATEGORY_COLORS[category],
  }));
}
