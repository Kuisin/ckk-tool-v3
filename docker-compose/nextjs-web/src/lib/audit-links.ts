/**
 * audit-links.ts — 操作履歴 (SY07) から関連ドキュメント/アプリへのリンク解決。
 * pure / client-safe。
 *
 * audit_logs の recordId は業務識別子（文書番号 QOT-… / 通し番号 / マスタ id）
 * で、各詳細ページの URL id と同じ規約（例: /sales/quotes/QOT-…）。
 * 確実に詳細 URL を組めるテーブルは kind "detail"、それ以外は一覧 + 検索
 * （?q=recordId）の kind "list" で返す。未知のテーブルは null。
 */

export interface AuditLink {
  /** 遷移先アプリの表示ラベル。 */
  appLabel: string;
  href: string;
  /** detail = レコード詳細へ直接 / list = 一覧を検索表示。 */
  kind: "detail" | "list";
}

interface TableRoute {
  appLabel: string;
  listPath: string;
  /** true = `${listPath}/${recordId}` が詳細 URL（業務キー = URL id）。 */
  directDetail?: boolean;
}

const TABLE_ROUTES: Record<string, TableRoute> = {
  // 販売
  quotes: { appLabel: "見積書", listPath: "/sales/quotes", directDetail: true },
  estimates: {
    appLabel: "試算",
    listPath: "/sales/trial-estimates",
    directDetail: true,
  },
  price_list_entries: {
    appLabel: "価格表",
    listPath: "/sales/price-lists",
    directDetail: true,
  },
  order_acceptances: {
    appLabel: "注文請書",
    listPath: "/sales/order-acceptances",
    directDetail: true,
  },
  design_requests: {
    appLabel: "設計依頼書",
    listPath: "/sales/design-requests",
    directDetail: true,
  },
  // 生産
  order_lines: {
    appLabel: "注文明細",
    listPath: "/sales/order-lines",
    directDetail: true,
  },
  work_orders: {
    appLabel: "指示書",
    listPath: "/production/work-orders",
    directDetail: true,
  },
  approval_requests: {
    appLabel: "承認管理",
    listPath: "/production/approvals",
  },
  product_inventory: {
    appLabel: "在庫管理（製品）",
    listPath: "/production/inventory/products",
    directDetail: true,
  },
  material_inventory: {
    appLabel: "在庫管理（素材）",
    listPath: "/production/inventory/materials",
    directDetail: true,
  },
  // 購買
  purchase_requests: {
    appLabel: "購買依頼",
    listPath: "/purchase/purchase-requests",
    directDetail: true,
  },
  material_purchase_orders: {
    appLabel: "素材発注書",
    listPath: "/purchase/purchase-orders",
    directDetail: true,
  },
  material_receipts: {
    appLabel: "素材入荷",
    listPath: "/purchase/material-receipts",
    directDetail: true,
  },
  // 出荷・請求
  shipping_orders: {
    appLabel: "出荷書",
    listPath: "/shipping/shipping-orders",
    directDetail: true,
  },
  delivery_notes: {
    appLabel: "納品書",
    listPath: "/shipping/delivery-notes",
    directDetail: true,
  },
  invoices: {
    appLabel: "請求書",
    listPath: "/billing/invoices",
    directDetail: true,
  },
  billing_closings: { appLabel: "締日処理", listPath: "/billing/closings" },
  // マスタ
  products: {
    appLabel: "製品",
    listPath: "/master/products",
    directDetail: true,
  },
  materials: {
    appLabel: "素材",
    listPath: "/master/materials",
    directDetail: true,
  },
  material_types: {
    appLabel: "材種",
    listPath: "/master/material-types",
    directDetail: true,
  },
  business_partners: {
    appLabel: "取引先",
    listPath: "/master/business-partners",
  },
  plants: {
    appLabel: "拠点",
    listPath: "/master/plants",
    directDetail: true,
  },
  storage_locations: {
    appLabel: "拠点（保管場所）",
    listPath: "/master/plants",
  },
  storage_shelves: {
    appLabel: "拠点（保管場所）",
    listPath: "/master/plants",
  },
  process_step_catalog: {
    appLabel: "工程マスタ",
    listPath: "/master/process-steps",
    directDetail: true,
  },
  inspection_templates: {
    appLabel: "検査表テンプレート",
    listPath: "/master/inspection-templates",
    directDetail: true,
  },
  defect_types: { appLabel: "不良種類", listPath: "/master/defect-types" },
  approval_groups: {
    appLabel: "承認グループ",
    listPath: "/master/approval-groups",
    directDetail: true,
  },
  work_location_groups: {
    appLabel: "作業場所",
    listPath: "/master/work-locations",
  },
  work_locations: {
    appLabel: "作業場所",
    listPath: "/master/work-locations",
  },
  // システム
  feature_flags: { appLabel: "アプリ管理", listPath: "/settings/apps" },
  file_folder_grants: {
    appLabel: "ファイル管理",
    listPath: "/settings/files",
  },
  kiosk_cards: { appLabel: "QRカード管理", listPath: "/settings/kiosk-cards" },
  kiosk_devices: { appLabel: "端末管理", listPath: "/settings/kiosk-devices" },
  kiosk_floor_maps: {
    appLabel: "端末管理（マップ）",
    listPath: "/settings/kiosk-devices/map",
  },
};

/** 対象テーブル + recordId から関連ページへのリンクを解決する。 */
export function auditRecordLink(
  tableName: string,
  recordId: string | null,
): AuditLink | null {
  const route = TABLE_ROUTES[tableName];
  if (!route) return null;
  if (route.directDetail && recordId) {
    return {
      appLabel: route.appLabel,
      href: `${route.listPath}/${encodeURIComponent(recordId)}`,
      kind: "detail",
    };
  }
  const q = recordId ? `?q=${encodeURIComponent(recordId)}` : "";
  return {
    appLabel: route.appLabel,
    href: `${route.listPath}${q}`,
    kind: "list",
  };
}
