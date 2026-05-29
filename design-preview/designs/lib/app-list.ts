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
  | '販売'
  | '購買'
  | '生産'
  | '出荷'
  | '請求'
  | 'マスタ';

export interface AppEntry {
  /** Unique key, also used as i18n dict key */
  key: string;
  /** Japanese display label (also used as fallback if i18n not loaded) */
  label: string;
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
    key: 'price-lists',
    label: '価格表',
    href: '/sales/price-lists',
    icon: 'IconCurrencyYen',
    category: '販売',
    requiredPermission: 'price_list',
  },
  {
    key: 'quotes',
    label: '見積書',
    href: '/sales/quotes',
    icon: 'IconFileText',
    category: '販売',
    requiredPermission: 'quote',
  },
  {
    key: 'order-acceptances',
    label: '注文受諾書',
    href: '/sales/order-acceptances',
    icon: 'IconClipboardCheck',
    category: '販売',
    requiredPermission: 'order_acceptance',
  },
  {
    key: 'design-requests',
    label: '設計依頼書',
    href: '/sales/design-requests',
    icon: 'IconRuler2',
    category: '販売',
    requiredPermission: 'design_request',
  },

  // ─── 購買 ──────────────────────────────────────────────────────────────────
  {
    key: 'material-receipts',
    label: '素材入荷',
    href: '/purchase/material-receipts',
    icon: 'IconPackageImport',
    category: '購買',
    requiredPermission: 'material_receipt',
  },
  {
    key: 'outsource-orders',
    label: '外注依頼',
    href: '/purchase/outsource-orders',
    icon: 'IconTruckDelivery',
    category: '購買',
    requiredPermission: 'outsource_order',
  },

  // ─── 生産 ──────────────────────────────────────────────────────────────────
  {
    key: 'sales-orders',
    label: '受注書',
    href: '/production/sales-orders',
    icon: 'IconClipboardList',
    category: '生産',
    requiredPermission: 'sales_order',
  },
  {
    key: 'work-orders',
    label: '指示書',
    href: '/production/work-orders',
    icon: 'IconSettings2',
    category: '生産',
    requiredPermission: 'work_order',
  },
  {
    key: 'approvals',
    label: '承認管理',
    href: '/production/approvals',
    icon: 'IconShieldCheck',
    category: '生産',
    requiredPermission: 'approve',
  },
  {
    key: 'product-inventory',
    label: '製品在庫',
    href: '/production/inventory/products',
    icon: 'IconBoxSeam',
    category: '生産',
    requiredPermission: 'inventory',
  },
  {
    key: 'material-inventory',
    label: '素材在庫',
    href: '/production/inventory/materials',
    icon: 'IconStack2',
    category: '生産',
    requiredPermission: 'inventory',
  },

  // ─── 出荷 ──────────────────────────────────────────────────────────────────
  {
    key: 'shipping-orders',
    label: '出荷書',
    href: '/shipping/shipping-orders',
    icon: 'IconTruck',
    category: '出荷',
    requiredPermission: 'shipping_order',
  },
  {
    key: 'delivery-notes',
    label: '納品書',
    href: '/shipping/delivery-notes',
    icon: 'IconReceipt',
    category: '出荷',
    requiredPermission: 'delivery_note',
  },

  // ─── 請求 ──────────────────────────────────────────────────────────────────
  {
    key: 'invoices',
    label: '請求書',
    href: '/billing/invoices',
    icon: 'IconFileInvoice',
    category: '請求',
    requiredPermission: 'invoice',
  },
  {
    key: 'billing-closings',
    label: '締日処理',
    href: '/billing/closings',
    icon: 'IconCalendarDue',
    category: '請求',
    requiredPermission: 'billing_closing',
  },

  // ─── マスタ ────────────────────────────────────────────────────────────────
  {
    key: 'master-customers',
    label: '顧客',
    href: '/master/customers',
    icon: 'IconBuilding',
    category: 'マスタ',
    requiredPermission: 'master',
  },
  {
    key: 'master-end-users',
    label: '最終需要家',
    href: '/master/end-users',
    icon: 'IconUsers',
    category: 'マスタ',
    requiredPermission: 'master',
  },
  {
    key: 'master-products',
    label: '製品',
    href: '/master/products',
    icon: 'IconCylinder',
    category: 'マスタ',
    requiredPermission: 'master',
  },
  {
    key: 'master-material-types',
    label: '材種',
    href: '/master/material-types',
    icon: 'IconAtom',
    category: 'マスタ',
    requiredPermission: 'master',
  },
  {
    key: 'master-materials',
    label: '素材',
    href: '/master/materials',
    icon: 'IconBolt',
    category: 'マスタ',
    requiredPermission: 'master',
  },
  {
    key: 'master-suppliers',
    label: '外注企業',
    href: '/master/suppliers',
    icon: 'IconBuildingFactory2',
    category: 'マスタ',
    requiredPermission: 'master',
  },
  {
    key: 'master-process-steps',
    label: '工程マスタ',
    href: '/master/process-steps',
    icon: 'IconGitBranch',
    category: 'マスタ',
    requiredPermission: 'master',
  },
  {
    key: 'master-inspection-templates',
    label: '検査表テンプレート',
    href: '/master/inspection-templates',
    icon: 'IconListCheck',
    category: 'マスタ',
    requiredPermission: 'master',
  },
  {
    key: 'master-defect-types',
    label: '不良種類',
    href: '/master/defect-types',
    icon: 'IconAlertTriangle',
    category: 'マスタ',
    requiredPermission: 'master',
  },
  {
    key: 'master-approval-groups',
    label: '承認グループ',
    href: '/master/approval-groups',
    icon: 'IconUsersGroup',
    category: 'マスタ',
    requiredPermission: 'master',
  },
];

/**
 * Category color mapping for ThemeIcon in AppLauncher and HomeApps.
 * [Custom] Each category gets a consistent color across all views.
 */
export const CATEGORY_COLORS: Record<AppCategory, string> = {
  '販売': 'blue',
  '購買': 'teal',
  '生産': 'violet',
  '出荷': 'orange',
  '請求': 'pink',
  'マスタ': 'gray',
};

/**
 * Returns apps grouped by category, preserving the order above.
 */
export function getAppsByCategory(): Array<{
  category: AppCategory;
  apps: AppEntry[];
  color: string;
}> {
  const order: AppCategory[] = ['販売', '購買', '生産', '出荷', '請求', 'マスタ'];
  return order.map((category) => ({
    category,
    apps: appList.filter((app) => app.category === category),
    color: CATEGORY_COLORS[category],
  }));
}
