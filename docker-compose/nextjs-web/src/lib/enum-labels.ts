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

/** app.DEPENDENCY_RELATION（工程依存の結合） */
export const DEPENDENCY_RELATION_LABEL: Record<string, string> = {
  AND: "AND（すべて）",
  OR: "OR（いずれか）",
};

export const DEPENDENCY_RELATION_OPTIONS = Object.entries(
  DEPENDENCY_RELATION_LABEL,
).map(([value, label]) => ({ value, label }));

/** app.APPROVAL_GROUP_TYPE（承認グループ種別） */
export const APPROVAL_GROUP_TYPE_LABEL: Record<string, string> = {
  FIRST: "第一承認",
  SECOND: "第二承認",
  WORKFLOW_CHANGE: "ワークフロー変更承認",
};

export const APPROVAL_GROUP_TYPE_OPTIONS = Object.entries(
  APPROVAL_GROUP_TYPE_LABEL,
).map(([value, label]) => ({ value, label }));

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
