/**
 * enum-labels.ts — DB enum → ja/en/zh UI label maps (_specs/design.md §17.1).
 *
 * Server- and client-safe (pure data + pure functions — no hooks here, so
 * these can be called from Server Components/Actions with an explicit
 * `locale`, or from client components with `useLocale()`'s result). Mirrors
 * the `Record<Locale, string>`-per-value pattern already used by
 * `StatusBadge.tsx`'s `STATUS_MAPS`, rather than routing through next-intl
 * `messages/*.json` — the translation lives next to the enum value it
 * belongs to instead of being split across two files.
 *
 * Every map below is intentionally **not exported** — only the derived
 * `xxxLabel(value, locale)` / `xxxOptions(locale)` functions are, so there is
 * exactly one way to read a label and it can never be indexed without a
 * locale by accident. Unknown values fall back to `ja`, then to the raw
 * value itself, so a new enum member never blanks out the UI.
 *
 * Keep in sync with shared-db enums. Terms follow `_specs/i18n-glossary.md`
 * §3 — do not invent a second rendering of a term that's already in that
 * table.
 */

import type { Locale } from "./i18n";

type LabelMap = Record<string, Record<Locale, string>>;

function resolveLabel(map: LabelMap, value: string, locale: Locale): string {
  return map[value]?.[locale] ?? map[value]?.ja ?? value;
}

function labelOptions(
  map: LabelMap,
  locale: Locale,
): { value: string; label: string }[] {
  return Object.entries(map).map(([value, l]) => ({
    value,
    label: l[locale] ?? l.ja,
  }));
}

/** 単位 — free-text DB column, but the UI offers a fixed choice set. */
const UNIT_LABEL: LabelMap = {
  本: { ja: "本", en: "pcs", zh: "支" },
  個: { ja: "個", en: "pcs", zh: "个" },
  kg: { ja: "kg", en: "kg", zh: "kg" },
  m: { ja: "m", en: "m", zh: "m" },
  セット: { ja: "セット", en: "Set", zh: "套" },
};
export const unitLabel = (value: string, locale: Locale) =>
  resolveLabel(UNIT_LABEL, value, locale);
export const unitOptions = (locale: Locale) => labelOptions(UNIT_LABEL, locale);

/** bp.TAX_TYPE */
const TAX_TYPE_LABEL: LabelMap = {
  TAXABLE: { ja: "課税", en: "Taxable", zh: "应税" },
  EXEMPT: { ja: "非課税", en: "Tax exempt", zh: "免税" },
  REDUCED: { ja: "軽減税率", en: "Reduced tax rate", zh: "减免税率" },
};
export const taxTypeLabel = (value: string, locale: Locale) =>
  resolveLabel(TAX_TYPE_LABEL, value, locale);
export const taxTypeOptions = (locale: Locale) =>
  labelOptions(TAX_TYPE_LABEL, locale);

/** bp.INVOICE_METHOD */
const INVOICE_METHOD_LABEL: LabelMap = {
  EMAIL: { ja: "メール", en: "Email", zh: "邮件" },
  FAX: { ja: "FAX", en: "Fax", zh: "传真" },
  POST: { ja: "郵送", en: "Post", zh: "邮寄" },
  PORTAL: { ja: "ポータル", en: "Portal", zh: "门户" },
};
export const invoiceMethodLabel = (value: string, locale: Locale) =>
  resolveLabel(INVOICE_METHOD_LABEL, value, locale);
export const invoiceMethodOptions = (locale: Locale) =>
  labelOptions(INVOICE_METHOD_LABEL, locale);

/** bp.BP_ROLE — 1 取引先に複数付与できるロール（MS01 取引先マスタ）。 */
const BP_ROLE_LABEL: LabelMap = {
  CUSTOMER: { ja: "顧客", en: "Customer", zh: "客户" },
  END_USER: { ja: "最終需要家", en: "End user", zh: "最终用户" },
  VENDOR: {
    ja: "仕入先・外注先",
    en: "Supplier/Subcontractor",
    zh: "供应商・外协厂商",
  },
};
export const bpRoleLabel = (value: string, locale: Locale) =>
  resolveLabel(BP_ROLE_LABEL, value, locale);
export const bpRoleOptions = (locale: Locale) =>
  labelOptions(BP_ROLE_LABEL, locale);

/** ロールバッジの色（design.md §1.1 のカテゴリ色に合わせる）。色名は訳さない。 */
export const BP_ROLE_COLOR: Record<string, string> = {
  CUSTOMER: "blue",
  END_USER: "violet",
  VENDOR: "teal",
};

/** bp.VENDOR_TYPE */
const VENDOR_TYPE_LABEL: LabelMap = {
  SUPPLIER: { ja: "仕入先", en: "Supplier", zh: "供应商" },
  OUTSOURCE: { ja: "外注先", en: "Subcontractor", zh: "外协厂商" },
};
export const vendorTypeLabel = (value: string, locale: Locale) =>
  resolveLabel(VENDOR_TYPE_LABEL, value, locale);
export const vendorTypeOptions = (locale: Locale) =>
  labelOptions(VENDOR_TYPE_LABEL, locale);

/** ISO 3166-1 alpha-2 — UI で扱う国の固定リスト。 */
const COUNTRY_LABEL: LabelMap = {
  JP: { ja: "日本", en: "Japan", zh: "日本" },
  CN: { ja: "中国", en: "China", zh: "中国" },
  US: { ja: "アメリカ", en: "United States", zh: "美国" },
  KR: { ja: "韓国", en: "Korea", zh: "韩国" },
};
export const countryLabel = (value: string, locale: Locale) =>
  resolveLabel(COUNTRY_LABEL, value, locale);
export const countryOptions = (locale: Locale) =>
  labelOptions(COUNTRY_LABEL, locale);

/** 銀行口座種別 — free-text DB column, fixed choice set in the UI. */
const BANK_ACCOUNT_TYPE_LABEL: LabelMap = {
  普通: { ja: "普通", en: "Savings", zh: "活期" },
  当座: { ja: "当座", en: "Checking", zh: "支票" },
};
export const bankAccountTypeLabel = (value: string, locale: Locale) =>
  resolveLabel(BANK_ACCOUNT_TYPE_LABEL, value, locale);
export const bankAccountTypeOptions = (locale: Locale) =>
  labelOptions(BANK_ACCOUNT_TYPE_LABEL, locale);

/** app.PROCESS_CATEGORY（工程カタログ） */
const PROCESS_CATEGORY_LABEL: LabelMap = {
  MATERIAL_PREP: { ja: "材料準備", en: "Material prep", zh: "材料准备" },
  MACHINING: { ja: "加工", en: "Machining", zh: "加工" },
  COATING: { ja: "コーティング", en: "Coating", zh: "涂层" },
  INSPECTION: { ja: "検査", en: "Inspection", zh: "检查" },
  APPROVAL: { ja: "検査承認", en: "Inspection approval", zh: "检查批准" },
  SHIPPING: { ja: "出荷", en: "Shipping", zh: "出货" },
};
export const processCategoryLabel = (value: string, locale: Locale) =>
  resolveLabel(PROCESS_CATEGORY_LABEL, value, locale);
export const processCategoryOptions = (locale: Locale) =>
  labelOptions(PROCESS_CATEGORY_LABEL, locale);
/** カタログ順（挿入順）の生キー一覧 — 表示ラベルではなく順序だけが要る呼び出し元向け。 */
export const PROCESS_CATEGORY_KEYS: readonly string[] = Object.keys(
  PROCESS_CATEGORY_LABEL,
);

/** app.LOT_INPUT_MODE（工程実行時のロット/伝票コード入力） */
const LOT_INPUT_MODE_LABEL: LabelMap = {
  REQUIRED: { ja: "必須", en: "Required", zh: "必填" },
  OPTIONAL: { ja: "任意", en: "Optional", zh: "可选" },
  NONE: { ja: "なし", en: "None", zh: "无" },
};
export const lotInputModeLabel = (value: string, locale: Locale) =>
  resolveLabel(LOT_INPUT_MODE_LABEL, value, locale);
export const lotInputModeOptions = (locale: Locale) =>
  labelOptions(LOT_INPUT_MODE_LABEL, locale);

/**
 * 工程種別 → 色（_specs/design.md §12.2）。工程フロー図のノードはこの色で
 * 塗る（= 何の工程かが一目で判る）。工程の**状態**の色（gray/blue/green/red —
 * §9 StepStatus）とぶつからないよう、その 4 色は避けて選んである。色名は訳さない。
 */
export const PROCESS_CATEGORY_COLOR: Record<string, string> = {
  MATERIAL_PREP: "teal",
  MACHINING: "indigo",
  COATING: "grape",
  INSPECTION: "cyan",
  APPROVAL: "violet",
  SHIPPING: "pink",
};

/** app.PROCESS_EXECUTION（工程の実施場所）。用語は「社内」「外注」の2語だけで組み立てる。 */
const PROCESS_EXECUTION_LABEL: LabelMap = {
  INTERNAL: { ja: "社内", en: "In-house", zh: "厂内" },
  INTERNAL_OR_OUTSOURCE: {
    ja: "社内・外注",
    en: "In-house/Outsourced",
    zh: "厂内・外协",
  },
};
export const processExecutionLabel = (value: string, locale: Locale) =>
  resolveLabel(PROCESS_EXECUTION_LABEL, value, locale);
export const processExecutionOptions = (locale: Locale) =>
  labelOptions(PROCESS_EXECUTION_LABEL, locale);

/** app.QUANTITY_TRACKING（工程の数量管理モード） */
const QUANTITY_TRACKING_LABEL: LabelMap = {
  NONE: {
    ja: "なし（記録しない）",
    en: "None (not recorded)",
    zh: "无（不记录）",
  },
  FLOW: {
    ja: "数量管理（受入・良品・不良）",
    en: "Flow (received / good / defect)",
    zh: "数量管理（接收・良品・不良）",
  },
  INSPECTION: {
    ja: "検査（検査数・合格・不合格）",
    en: "Inspection (inspected / pass / fail)",
    zh: "检查（检查数・合格・不合格）",
  },
};
export const quantityTrackingLabel = (value: string, locale: Locale) =>
  resolveLabel(QUANTITY_TRACKING_LABEL, value, locale);
export const quantityTrackingOptions = (locale: Locale) =>
  labelOptions(QUANTITY_TRACKING_LABEL, locale);

/** app.DEPENDENCY_RELATION（工程依存の結合） */
const DEPENDENCY_RELATION_LABEL: LabelMap = {
  AND: { ja: "AND（すべて）", en: "AND (all)", zh: "AND（全部）" },
  OR: { ja: "OR（いずれか）", en: "OR (any)", zh: "OR（任一）" },
};
export const dependencyRelationLabel = (value: string, locale: Locale) =>
  resolveLabel(DEPENDENCY_RELATION_LABEL, value, locale);
export const dependencyRelationOptions = (locale: Locale) =>
  labelOptions(DEPENDENCY_RELATION_LABEL, locale);

/** app.APPROVAL_MODE（承認ステップの成立条件） */
const APPROVAL_MODE_LABEL: LabelMap = {
  ANY: { ja: "いずれか1名", en: "Any one member", zh: "任一人" },
  ALL: { ja: "全員", en: "All members", zh: "全员" },
};
export const approvalModeLabel = (value: string, locale: Locale) =>
  resolveLabel(APPROVAL_MODE_LABEL, value, locale);
export const approvalModeOptions = (locale: Locale) =>
  labelOptions(APPROVAL_MODE_LABEL, locale);

/** app.WORK_ORDER_TYPE（指示書種別） */
const WORK_ORDER_TYPE_LABEL: LabelMap = {
  FROM_STOCK: { ja: "在庫分", en: "From stock", zh: "库存分" },
  MANUFACTURE: { ja: "製造分", en: "Manufacture", zh: "制造分" },
};
export const workOrderTypeLabel = (value: string, locale: Locale) =>
  resolveLabel(WORK_ORDER_TYPE_LABEL, value, locale);
export const workOrderTypeOptions = (locale: Locale) =>
  labelOptions(WORK_ORDER_TYPE_LABEL, locale);

/** sales.ORDER_TYPE（注文種別） */
const ORDER_TYPE_LABEL: LabelMap = {
  PRODUCTION: { ja: "本番", en: "Production", zh: "量产" },
  TEST: { ja: "テスト", en: "Test", zh: "试制" },
  SAMPLE: { ja: "サンプル", en: "Sample", zh: "样品" },
  OTHER: { ja: "その他", en: "Other", zh: "其他" },
};
export const orderTypeLabel = (value: string, locale: Locale) =>
  resolveLabel(ORDER_TYPE_LABEL, value, locale);
export const orderTypeOptions = (locale: Locale) =>
  labelOptions(ORDER_TYPE_LABEL, locale);

/** app.DELIVERY_ORDER_TYPE（出荷書種別） */
const DELIVERY_ORDER_TYPE_LABEL: LabelMap = {
  STOCK_STORAGE: { ja: "在庫保管", en: "Stock storage", zh: "库存保管" },
  DISPATCH: { ja: "発送", en: "Dispatch", zh: "发货" },
};
export const deliveryOrderTypeLabel = (value: string, locale: Locale) =>
  resolveLabel(DELIVERY_ORDER_TYPE_LABEL, value, locale);
export const deliveryOrderTypeOptions = (locale: Locale) =>
  labelOptions(DELIVERY_ORDER_TYPE_LABEL, locale);

/** app.DELIVERY_METHOD（納品方法） */
const DELIVERY_METHOD_LABEL: LabelMap = {
  DIRECT_TO_USER: {
    ja: "ユーザー直送",
    en: "Direct to end user",
    zh: "直送最终用户",
  },
  NORMAL: { ja: "通常納品", en: "Standard delivery", zh: "常规配送" },
};
export const deliveryMethodLabel = (value: string, locale: Locale) =>
  resolveLabel(DELIVERY_METHOD_LABEL, value, locale);
export const deliveryMethodOptions = (locale: Locale) =>
  labelOptions(DELIVERY_METHOD_LABEL, locale);

/**
 * 注文請書の配送方法（同じ app.DELIVERY_METHOD を受注文脈で表示）。
 * 納品書側の「納品方法」と区別して「通常配送」と呼ぶ。
 */
const ACCEPTANCE_DELIVERY_METHOD_LABEL: LabelMap = {
  NORMAL: { ja: "通常配送", en: "Standard delivery", zh: "常规配送" },
  DIRECT_TO_USER: {
    ja: "ユーザー直送",
    en: "Direct to end user",
    zh: "直送最终用户",
  },
};
export const acceptanceDeliveryMethodLabel = (value: string, locale: Locale) =>
  resolveLabel(ACCEPTANCE_DELIVERY_METHOD_LABEL, value, locale);
export const acceptanceDeliveryMethodOptions = (locale: Locale) =>
  labelOptions(ACCEPTANCE_DELIVERY_METHOD_LABEL, locale);

/** app.PURCHASE_STATUS（素材発注書） */
const PURCHASE_STATUS_LABEL: LabelMap = {
  DRAFT: { ja: "下書き", en: "Draft", zh: "草稿" },
  REQUESTED: { ja: "承認依頼中", en: "Pending approval", zh: "审批中" },
  APPROVED: { ja: "承認済", en: "Approved", zh: "已批准" },
  ORDERED: { ja: "発注済", en: "Ordered", zh: "已下单" },
  COMPLETED: { ja: "入荷完了", en: "Received", zh: "已入库" },
  CANCELLED: { ja: "キャンセル", en: "Cancelled", zh: "已取消" },
};
export const purchaseStatusLabel = (value: string, locale: Locale) =>
  resolveLabel(PURCHASE_STATUS_LABEL, value, locale);
export const purchaseStatusOptions = (locale: Locale) =>
  labelOptions(PURCHASE_STATUS_LABEL, locale);

/** app.PURCHASE_REQUEST_STATUS（購買依頼） */
const PURCHASE_REQUEST_STATUS_LABEL: LabelMap = {
  DRAFT: { ja: "下書き", en: "Draft", zh: "草稿" },
  REQUESTED: { ja: "承認依頼中", en: "Pending approval", zh: "审批中" },
  APPROVED: { ja: "承認済", en: "Approved", zh: "已批准" },
  REJECTED: { ja: "差し戻し", en: "Sent back", zh: "已退回" },
  ORDERED: { ja: "発注済", en: "Ordered", zh: "已下单" },
  CANCELLED: { ja: "キャンセル", en: "Cancelled", zh: "已取消" },
};
export const purchaseRequestStatusLabel = (value: string, locale: Locale) =>
  resolveLabel(PURCHASE_REQUEST_STATUS_LABEL, value, locale);
export const purchaseRequestStatusOptions = (locale: Locale) =>
  labelOptions(PURCHASE_REQUEST_STATUS_LABEL, locale);

/** app.DESIGN_TRIGGER（設計依頼のトリガ） */
const DESIGN_TRIGGER_LABEL: LabelMap = {
  QUOTE: { ja: "見積時", en: "At quote", zh: "报价时" },
  SALES_ORDER: { ja: "受注時", en: "At order", zh: "接单时" },
  // 見積にも受注にも紐づかない起票（新製品の検討・事前相談・社内改善）。
  STANDALONE: { ja: "単独", en: "Standalone", zh: "独立" },
};
export const designTriggerLabel = (value: string, locale: Locale) =>
  resolveLabel(DESIGN_TRIGGER_LABEL, value, locale);
export const designTriggerOptions = (locale: Locale) =>
  labelOptions(DESIGN_TRIGGER_LABEL, locale);

/** app.DESIGN_KIND（依頼区分 — 過去の設計書の有無で自動判定） */
const DESIGN_KIND_LABEL: LabelMap = {
  NEW: { ja: "新規", en: "New", zh: "新增" },
  REVISION: { ja: "改訂", en: "Revision", zh: "修订" },
};
export const designKindLabel = (value: string, locale: Locale) =>
  resolveLabel(DESIGN_KIND_LABEL, value, locale);
export const designKindOptions = (locale: Locale) =>
  labelOptions(DESIGN_KIND_LABEL, locale);

/** app.DESIGN_PRIORITY（優先度） */
const DESIGN_PRIORITY_LABEL: LabelMap = {
  NORMAL: { ja: "通常", en: "Normal", zh: "普通" },
  HIGH: { ja: "急ぎ", en: "High", zh: "加急" },
};
export const designPriorityLabel = (value: string, locale: Locale) =>
  resolveLabel(DESIGN_PRIORITY_LABEL, value, locale);
export const designPriorityOptions = (locale: Locale) =>
  labelOptions(DESIGN_PRIORITY_LABEL, locale);

/** app.notifications.type（通知種別） */
const NOTIFICATION_TYPE_LABEL: LabelMap = {
  APPROVAL_REQUEST: {
    ja: "承認依頼",
    en: "Approval request",
    zh: "审批申请",
  },
  APPROVAL_RESULT: { ja: "承認結果", en: "Approval result", zh: "审批结果" },
  INTAKE: { ja: "取込", en: "Intake", zh: "导入" },
  PURCHASE: { ja: "購買", en: "Purchasing", zh: "采购" },
  SHARE: { ja: "共有", en: "Sharing", zh: "共享" },
  DESIGN: { ja: "設計", en: "Design", zh: "设计" },
  FORM_COMPLETED: {
    ja: "申請の完了",
    en: "Request completed",
    zh: "申请已完成",
  },
  SYSTEM: { ja: "システム", en: "System", zh: "系统" },
};
export const notificationTypeLabel = (value: string, locale: Locale) =>
  resolveLabel(NOTIFICATION_TYPE_LABEL, value, locale);
export const notificationTypeOptions = (locale: Locale) =>
  labelOptions(NOTIFICATION_TYPE_LABEL, locale);

/** app.InspectionItemType（検査項目の入力種別） */
const INSPECTION_ITEM_TYPE_LABEL: LabelMap = {
  BOOLEAN: {
    ja: "真偽（はい/いいえ）",
    en: "Yes/No",
    zh: "是否（是/否）",
  },
  NUMBER: { ja: "数値", en: "Number", zh: "数值" },
  SELECT_SINGLE: { ja: "単一選択", en: "Single select", zh: "单选" },
  SELECT_MULTI: { ja: "複数選択", en: "Multi select", zh: "多选" },
};
export const inspectionItemTypeLabel = (value: string, locale: Locale) =>
  resolveLabel(INSPECTION_ITEM_TYPE_LABEL, value, locale);
export const inspectionItemTypeOptions = (locale: Locale) =>
  labelOptions(INSPECTION_ITEM_TYPE_LABEL, locale);

/** app.InspectionSamplingMode（抜取検査モード） */
const INSPECTION_SAMPLING_MODE_LABEL: LabelMap = {
  ALL: { ja: "全数", en: "All", zh: "全数" },
  PERCENT: { ja: "割合(%)", en: "Percent", zh: "比例(%)" },
  COUNT: { ja: "本数", en: "Count", zh: "支数" },
};
export const inspectionSamplingModeLabel = (value: string, locale: Locale) =>
  resolveLabel(INSPECTION_SAMPLING_MODE_LABEL, value, locale);
export const inspectionSamplingModeOptions = (locale: Locale) =>
  labelOptions(INSPECTION_SAMPLING_MODE_LABEL, locale);

/**
 * app.ACTION — 権限のアクション（SY01 実効権限テーブル等の表示用）。
 * 以前は英字のまま画面に出ていた。
 */
const PERMISSION_ACTION_LABEL: LabelMap = {
  READ: { ja: "閲覧", en: "View", zh: "查看" },
  CREATE: { ja: "作成", en: "Create", zh: "新建" },
  UPDATE: { ja: "更新", en: "Update", zh: "更新" },
  DELETE: { ja: "削除", en: "Delete", zh: "删除" },
  EXPORT: { ja: "書き出し", en: "Export", zh: "导出" },
  APPROVE: { ja: "承認", en: "Approve", zh: "批准" },
  ADMIN: { ja: "管理", en: "Admin", zh: "管理" },
};

/** app.SCOPE — 権限が及ぶ範囲。 */
const PERMISSION_SCOPE_LABEL: LabelMap = {
  ALL: { ja: "全社", en: "All", zh: "全公司" },
  REGION: { ja: "地域", en: "Region", zh: "地区" },
  COUNTRY: { ja: "国", en: "Country", zh: "国家" },
  PLANT: { ja: "拠点", en: "Site", zh: "据点" },
  FACTORY: { ja: "拠点", en: "Site", zh: "据点" },
  DEPARTMENT: { ja: "部門", en: "Department", zh: "部门" },
  TEAM: { ja: "チーム", en: "Team", zh: "团队" },
  SUB: { ja: "配下", en: "Subordinates", zh: "下属" },
  OWN: { ja: "自分の担当", en: "Own", zh: "本人负责" },
};

/** 表示用ラベル（未知の値はそのまま返す — 新しい enum 追加時も画面が壊れない）。 */
export const permissionActionLabel = (v: string, locale: Locale): string =>
  resolveLabel(PERMISSION_ACTION_LABEL, v, locale);
export const permissionScopeLabel = (v: string, locale: Locale): string =>
  resolveLabel(PERMISSION_SCOPE_LABEL, v, locale);
