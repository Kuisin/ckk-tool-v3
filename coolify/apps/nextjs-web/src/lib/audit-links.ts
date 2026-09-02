/**
 * audit-links.ts — 操作履歴 (SY07) から関連ドキュメント/アプリへのリンク解決。
 * pure / client-safe。
 *
 * audit_logs の recordId は業務識別子（文書番号 QOT-… / 通し番号 / マスタ id）
 * で、各詳細ページの URL id と同じ規約（例: /sales/quotes/QOT-…）。
 * 確実に詳細 URL を組めるテーブルは kind "detail"、それ以外は一覧 + 検索
 * （?q=recordId）の kind "list" で返す。未知のテーブルは null。
 *
 * `appLabel` は呼び出し側（`ActivityLogDetail`）が `{appLabel}を開く` のような
 * 文へ ICU 変数として埋め込むので、ここで locale ごとに解決しておく。
 * 多くはランチャー（`lib/app-list.ts`）と同じアプリなので `appLabelForKey`
 * （ja フォールバックは `appList` から引く — 文言を二重に持たない）でその訳を
 * 再利用し、（製品）のような接尾辞・ランチャーに無い名称（フォーム回答）だけ
 * `messages/*.json` の `admin.activityLogDetail.*` を `lib/messages.ts` の
 * `label()` 経由で足す。
 */

import { appLabelForKey, appList } from "./app-list";
import type { Locale } from "./i18n";
import { label } from "./messages";

export interface AuditLink {
  /** 遷移先アプリの表示ラベル。 */
  appLabel: string;
  href: string;
  /** detail = レコード詳細へ直接 / list = 一覧を検索表示。 */
  kind: "detail" | "list";
}

interface TableRoute {
  /** `lib/app-list.ts` の `AppEntry.key`（ランチャーと同じアプリのとき）。 */
  appListKey?: string;
  /** 接尾辞（`admin.activityLogDetail.<key>` を引く。無ければ翻訳しない）。 */
  suffixKey?: string;
  /** ランチャーに無い名称の翻訳キー（`admin.activityLogDetail.<key>`）。 */
  labelKey?: string;
  listPath: string;
  /** true = `${listPath}/${recordId}` が詳細 URL（業務キー = URL id）。 */
  directDetail?: boolean;
}

const TABLE_ROUTES: Record<string, TableRoute> = {
  // 販売
  quotes: {
    appListKey: "quotes",
    listPath: "/sales/quotes",
    directDetail: true,
  },
  estimates: {
    appListKey: "trial-estimates",
    listPath: "/sales/trial-estimates",
    directDetail: true,
  },
  price_list_entries: {
    appListKey: "price-lists",
    listPath: "/sales/price-lists",
    directDetail: true,
  },
  order_acceptances: {
    appListKey: "order-acceptances",
    listPath: "/sales/order-acceptances",
    directDetail: true,
  },
  design_requests: {
    appListKey: "design-requests",
    listPath: "/sales/design-requests",
    directDetail: true,
  },
  // 生産
  order_lines: {
    appListKey: "order-lines",
    listPath: "/sales/order-lines",
    directDetail: true,
  },
  work_orders: {
    appListKey: "work-orders",
    listPath: "/production/work-orders",
    directDetail: true,
  },
  approval_requests: {
    appListKey: "my-tasks",
    listPath: "/general/tasks",
  },
  product_inventory: {
    appListKey: "inventory",
    suffixKey: "suffixProduct",
    listPath: "/production/inventory/products",
    directDetail: true,
  },
  material_inventory: {
    appListKey: "inventory",
    suffixKey: "suffixMaterial",
    listPath: "/production/inventory/materials",
    directDetail: true,
  },
  // 一般
  forms: {
    appListKey: "forms",
    listPath: "/general/forms",
    directDetail: true,
  },
  internal_pages: {
    appListKey: "internal-pages",
    listPath: "/general/documents",
    directDetail: true,
  },
  form_responses: {
    // 回答の業務キー（FRM-…）だけでは所属フォームが分からないので、
    // 番号から実ページへ 302 する中継ページへ送る。
    labelKey: "formResponsesLabel",
    listPath: "/general/forms/responses",
    directDetail: true,
  },
  // 購買
  purchase_requests: {
    appListKey: "purchase-requests",
    listPath: "/purchase/purchase-requests",
    directDetail: true,
  },
  material_purchase_orders: {
    appListKey: "purchase-orders",
    listPath: "/purchase/purchase-orders",
    directDetail: true,
  },
  material_receipts: {
    appListKey: "material-receipts",
    listPath: "/purchase/material-receipts",
    directDetail: true,
  },
  // 出荷・請求
  delivery_orders: {
    appListKey: "delivery-orders",
    listPath: "/shipping/delivery-orders",
    directDetail: true,
  },
  delivery_notes: {
    appListKey: "delivery-notes",
    listPath: "/shipping/delivery-notes",
    directDetail: true,
  },
  invoices: {
    appListKey: "invoices",
    listPath: "/billing/invoices",
    directDetail: true,
  },
  billing_closings: {
    appListKey: "billing-closings",
    listPath: "/billing/closings",
  },
  // マスタ
  products: {
    appListKey: "master-products",
    listPath: "/master/products",
    directDetail: true,
  },
  materials: {
    appListKey: "master-materials",
    listPath: "/master/materials",
    directDetail: true,
  },
  material_types: {
    appListKey: "master-material-types",
    listPath: "/master/material-types",
    directDetail: true,
  },
  business_partners: {
    appListKey: "master-business-partners",
    listPath: "/master/business-partners",
  },
  plants: {
    appListKey: "master-plants",
    listPath: "/master/plants",
    directDetail: true,
  },
  storage_locations: {
    appListKey: "master-plants",
    suffixKey: "suffixStorageLocation",
    listPath: "/master/plants",
  },
  storage_shelves: {
    appListKey: "master-plants",
    suffixKey: "suffixStorageLocation",
    listPath: "/master/plants",
  },
  process_step_catalog: {
    appListKey: "master-process-steps",
    listPath: "/master/process-steps",
    directDetail: true,
  },
  inspection_templates: {
    appListKey: "master-inspection-templates",
    listPath: "/master/inspection-templates",
    directDetail: true,
  },
  defect_types: {
    appListKey: "master-defect-types",
    listPath: "/master/defect-types",
  },
  approval_groups: {
    appListKey: "master-approval-groups",
    listPath: "/master/approval-settings",
    directDetail: true,
  },
  approval_flows: {
    appListKey: "master-approval-groups",
    listPath: "/master/approval-settings",
  },
  work_location_groups: {
    appListKey: "master-work-locations",
    listPath: "/master/work-locations",
  },
  work_locations: {
    appListKey: "master-work-locations",
    listPath: "/master/work-locations",
  },
  // システム
  feature_flags: {
    appListKey: "app-management",
    listPath: "/settings/apps",
  },
  file_folder_grants: {
    appListKey: "file-management",
    listPath: "/settings/files",
  },
  kiosk_cards: {
    appListKey: "kiosk-cards",
    listPath: "/settings/kiosk-cards",
  },
  kiosk_devices: {
    appListKey: "kiosk-devices",
    listPath: "/settings/kiosk-devices",
  },
  kiosk_floor_maps: {
    appListKey: "kiosk-devices",
    suffixKey: "suffixFloorMap",
    listPath: "/settings/kiosk-devices/map",
  },
  display_devices: {
    appListKey: "kiosk-devices",
    suffixKey: "suffixDisplay",
    listPath: "/settings/kiosk-devices",
  },
};

const NS = "admin.activityLogDetail";

/** ja のフォールバック接尾辞・単独ラベル（鍵がまだカタログに無くても壊れない）。 */
const FALLBACK_JA: Record<string, string> = {
  suffixProduct: "（製品）",
  suffixMaterial: "（素材）",
  suffixStorageLocation: "（保管場所）",
  suffixFloorMap: "（マップ）",
  suffixDisplay: "（ディスプレイ）",
  formResponsesLabel: "フォーム回答",
};

function resolveAppLabel(route: TableRoute, locale: Locale): string {
  if (route.labelKey) {
    return label(
      `${NS}.${route.labelKey}`,
      locale,
      FALLBACK_JA[route.labelKey] ?? "",
    );
  }
  if (!route.appListKey) return "";
  // ランチャー（lib/app-list.ts）の label をそのまま ja フォールバックにする
  // — ここでは同じ文言を重複して持たない。
  const baseJa =
    appList.find((a) => a.key === route.appListKey)?.label ?? route.appListKey;
  const base = appLabelForKey(route.appListKey, baseJa, locale);
  if (!route.suffixKey) return base;
  const suffix = label(
    `${NS}.${route.suffixKey}`,
    locale,
    FALLBACK_JA[route.suffixKey] ?? "",
  );
  return `${base}${suffix}`;
}

/** 対象テーブル + recordId から関連ページへのリンクを解決する。 */
export function auditRecordLink(
  tableName: string,
  recordId: string | null,
  locale: Locale = "ja",
): AuditLink | null {
  const route = TABLE_ROUTES[tableName];
  if (!route) return null;
  const appLabel = resolveAppLabel(route, locale);
  if (route.directDetail && recordId) {
    return {
      appLabel,
      href: `${route.listPath}/${encodeURIComponent(recordId)}`,
      kind: "detail",
    };
  }
  const q = recordId ? `?q=${encodeURIComponent(recordId)}` : "";
  return {
    appLabel,
    href: `${route.listPath}${q}`,
    kind: "list",
  };
}
