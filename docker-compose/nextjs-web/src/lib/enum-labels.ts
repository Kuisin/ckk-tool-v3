/**
 * enum-labels.ts — DB enum → Japanese UI label maps (_specs/design.md §17.1).
 *
 * Server- and client-safe (pure data). Keep in sync with shared-db enums.
 */

/** 単位 — free-text DB column, but the UI offers a fixed choice set. */
export const UNIT_OPTIONS = ["本", "個", "kg", "m", "セット"].map((u) => ({
  value: u,
  label: u,
}));

/** bp.TAX_TYPE */
export const TAX_TYPE_LABEL: Record<string, string> = {
  TAXABLE: "課税",
  EXEMPT: "非課税",
  REDUCED: "軽減税率",
};

export const TAX_TYPE_OPTIONS = Object.entries(TAX_TYPE_LABEL).map(
  ([value, label]) => ({ value, label }),
);

/** bp.INVOICE_METHOD */
export const INVOICE_METHOD_LABEL: Record<string, string> = {
  EMAIL: "メール",
  FAX: "FAX",
  POST: "郵送",
  PORTAL: "ポータル",
};

export const INVOICE_METHOD_OPTIONS = Object.entries(INVOICE_METHOD_LABEL).map(
  ([value, label]) => ({ value, label }),
);

/** bp.BP_ROLE — 1 取引先に複数付与できるロール（MS01 取引先マスタ）。 */
export const BP_ROLE_LABEL: Record<string, string> = {
  CUSTOMER: "顧客",
  END_USER: "最終需要家",
  VENDOR: "仕入先・外注先",
};

export const BP_ROLE_OPTIONS = Object.entries(BP_ROLE_LABEL).map(
  ([value, label]) => ({ value, label }),
);

/** ロールバッジの色（design.md §1.1 のカテゴリ色に合わせる）。 */
export const BP_ROLE_COLOR: Record<string, string> = {
  CUSTOMER: "blue",
  END_USER: "violet",
  VENDOR: "teal",
};

/** bp.VENDOR_TYPE */
export const VENDOR_TYPE_LABEL: Record<string, string> = {
  SUPPLIER: "仕入先",
  OUTSOURCE: "外注先",
};

export const VENDOR_TYPE_OPTIONS = Object.entries(VENDOR_TYPE_LABEL).map(
  ([value, label]) => ({ value, label }),
);

/** ISO 3166-1 alpha-2 — UI で扱う国の固定リスト。 */
export const COUNTRY_LABEL: Record<string, string> = {
  JP: "日本",
  CN: "中国",
  US: "アメリカ",
  KR: "韓国",
};

export const COUNTRY_OPTIONS = Object.entries(COUNTRY_LABEL).map(
  ([value, label]) => ({ value, label }),
);

/** 銀行口座種別 — free-text DB column, fixed choice set in the UI. */
export const BANK_ACCOUNT_TYPE_OPTIONS = ["普通", "当座"].map((v) => ({
  value: v,
  label: v,
}));

/** app.PROCESS_CATEGORY（工程カタログ） */
export const PROCESS_CATEGORY_LABEL: Record<string, string> = {
  MATERIAL_PREP: "材料準備",
  MACHINING: "加工",
  COATING: "コーティング",
  INSPECTION: "検査",
  APPROVAL: "検査承認",
  SHIPPING: "出荷",
};

export const PROCESS_CATEGORY_OPTIONS = Object.entries(
  PROCESS_CATEGORY_LABEL,
).map(([value, label]) => ({ value, label }));

/** app.PROCESS_EXECUTION（工程の実施場所） */
export const PROCESS_EXECUTION_LABEL: Record<string, string> = {
  INTERNAL: "社内のみ",
  INTERNAL_OR_OUTSOURCE: "社内・外注",
};

export const PROCESS_EXECUTION_OPTIONS = Object.entries(
  PROCESS_EXECUTION_LABEL,
).map(([value, label]) => ({ value, label }));

/** app.QUANTITY_TRACKING（工程の数量管理モード） */
export const QUANTITY_TRACKING_LABEL: Record<string, string> = {
  NONE: "なし（記録しない）",
  FLOW: "数量管理（受入・良品・不良）",
  INSPECTION: "検査（検査数・合格・不合格）",
};

export const QUANTITY_TRACKING_OPTIONS = Object.entries(
  QUANTITY_TRACKING_LABEL,
).map(([value, label]) => ({ value, label }));

/** app.DEPENDENCY_RELATION（工程依存の結合） */
export const DEPENDENCY_RELATION_LABEL: Record<string, string> = {
  AND: "AND（すべて）",
  OR: "OR（いずれか）",
};

export const DEPENDENCY_RELATION_OPTIONS = Object.entries(
  DEPENDENCY_RELATION_LABEL,
).map(([value, label]) => ({ value, label }));

/** app.APPROVAL_GROUP_TYPE（承認グループ種別） */
/** app.APPROVAL_MODE（承認ステップの成立条件） */
export const APPROVAL_MODE_LABEL: Record<string, string> = {
  ANY: "いずれか1名",
  ALL: "全員",
};

export const APPROVAL_MODE_OPTIONS = Object.entries(APPROVAL_MODE_LABEL).map(
  ([value, label]) => ({ value, label }),
);

/** app.WORK_ORDER_TYPE（指示書種別） */
export const WORK_ORDER_TYPE_LABEL: Record<string, string> = {
  FROM_STOCK: "在庫分",
  MANUFACTURE: "製造分",
};

export const WORK_ORDER_TYPE_OPTIONS = Object.entries(
  WORK_ORDER_TYPE_LABEL,
).map(([value, label]) => ({ value, label }));

/** sales.ORDER_TYPE（注文種別）— 既存画面は各所ローカル定義。共通化用。 */
export const ORDER_TYPE_LABEL: Record<string, string> = {
  PRODUCTION: "本番",
  TEST: "テスト",
  SAMPLE: "サンプル",
  OTHER: "その他",
};

export const ORDER_TYPE_OPTIONS = Object.entries(ORDER_TYPE_LABEL).map(
  ([value, label]) => ({ value, label }),
);

/** app.SHIPPING_TYPE（出荷書種別） */
export const SHIPPING_TYPE_LABEL: Record<string, string> = {
  STOCK_STORAGE: "在庫保管",
  DISPATCH: "発送",
};

export const SHIPPING_TYPE_OPTIONS = Object.entries(SHIPPING_TYPE_LABEL).map(
  ([value, label]) => ({ value, label }),
);

/** app.DELIVERY_METHOD（納品方法） */
export const DELIVERY_METHOD_LABEL: Record<string, string> = {
  DIRECT_TO_USER: "ユーザー直送",
  NORMAL: "通常納品",
};

export const DELIVERY_METHOD_OPTIONS = Object.entries(
  DELIVERY_METHOD_LABEL,
).map(([value, label]) => ({ value, label }));

/** app.PURCHASE_STATUS（素材発注書） */
export const PURCHASE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "作成中",
  REQUESTED: "承認依頼中",
  APPROVED: "承認済",
  ORDERED: "発注済",
  COMPLETED: "入荷完了",
  CANCELLED: "キャンセル",
};

export const PURCHASE_STATUS_OPTIONS = Object.entries(
  PURCHASE_STATUS_LABEL,
).map(([value, label]) => ({ value, label }));

/** app.PURCHASE_REQUEST_STATUS（購買依頼） */
export const PURCHASE_REQUEST_STATUS_LABEL: Record<string, string> = {
  DRAFT: "下書き",
  REQUESTED: "承認依頼中",
  APPROVED: "承認済",
  REJECTED: "差し戻し",
  ORDERED: "発注済",
  CANCELLED: "キャンセル",
};

export const PURCHASE_REQUEST_STATUS_OPTIONS = Object.entries(
  PURCHASE_REQUEST_STATUS_LABEL,
).map(([value, label]) => ({ value, label }));

/** app.DESIGN_TRIGGER（設計依頼のトリガ） */
export const DESIGN_TRIGGER_LABEL: Record<string, string> = {
  QUOTE: "見積時",
  SALES_ORDER: "受注時",
};

export const DESIGN_TRIGGER_OPTIONS = Object.entries(DESIGN_TRIGGER_LABEL).map(
  ([value, label]) => ({ value, label }),
);

/** app.notifications.type（通知種別） */
export const NOTIFICATION_TYPE_LABEL: Record<string, string> = {
  APPROVAL_REQUEST: "承認依頼",
  APPROVAL_RESULT: "承認結果",
  INTAKE: "取込",
  PURCHASE: "購買",
  SHARE: "共有",
  SYSTEM: "システム",
};

export const NOTIFICATION_TYPE_OPTIONS = Object.entries(
  NOTIFICATION_TYPE_LABEL,
).map(([value, label]) => ({ value, label }));

/** app.InspectionItemType（検査項目の入力種別） */
export const INSPECTION_ITEM_TYPE_LABEL: Record<string, string> = {
  BOOLEAN: "真偽（はい/いいえ）",
  NUMBER: "数値",
  SELECT_SINGLE: "単一選択",
  SELECT_MULTI: "複数選択",
};

export const INSPECTION_ITEM_TYPE_OPTIONS = Object.entries(
  INSPECTION_ITEM_TYPE_LABEL,
).map(([value, label]) => ({ value, label }));

/** app.InspectionSamplingMode（抜取検査モード） */
export const INSPECTION_SAMPLING_MODE_LABEL: Record<string, string> = {
  ALL: "全数",
  PERCENT: "割合(%)",
  COUNT: "本数",
};

export const INSPECTION_SAMPLING_MODE_OPTIONS = Object.entries(
  INSPECTION_SAMPLING_MODE_LABEL,
).map(([value, label]) => ({ value, label }));

/**
 * app.ACTION — 権限のアクション（SY01 実効権限テーブル等の表示用）。
 * 以前は英字のまま画面に出ていた。
 */
export const PERMISSION_ACTION_LABEL: Record<string, string> = {
  READ: "閲覧",
  CREATE: "作成",
  UPDATE: "更新",
  DELETE: "削除",
  EXPORT: "書き出し",
  APPROVE: "承認",
  ADMIN: "管理",
};

/** app.SCOPE — 権限が及ぶ範囲。 */
export const PERMISSION_SCOPE_LABEL: Record<string, string> = {
  ALL: "全社",
  REGION: "地域",
  COUNTRY: "国",
  PLANT: "拠点",
  FACTORY: "拠点",
  DEPARTMENT: "部門",
  TEAM: "チーム",
  SUB: "配下",
  OWN: "自分の担当",
};

/** 表示用ラベル（未知の値はそのまま返す — 新しい enum 追加時も画面が壊れない）。 */
export const permissionActionLabel = (v: string): string =>
  PERMISSION_ACTION_LABEL[v] ?? v;
export const permissionScopeLabel = (v: string): string =>
  PERMISSION_SCOPE_LABEL[v] ?? v;
