/**
 * enum-labels.ts — DB の enum 値 → 画面のラベル（_specs/design.md §17.1）。
 *
 * **訳はここに持たない。** 実体は `messages/<locale>.json` の `enum.*` にあり、
 * このファイルは「どの表のどの値か」を組み立てて引くだけ。文言の置き場を
 * 言語ファイル 1 本に寄せたのは、置き場が 3 通りあると足すたびに迷ううえ、
 * 翻訳を外に出すとき 3 種類の形式を渡すことになるため（`lib/messages.ts`）。
 *
 * サーバー・クライアントのどちらからでも呼べる（フックを使わないので、
 * Server Component / Server Action からは明示の `locale` を渡す）。
 *
 * 公開しているのは `xxxLabel(value, locale)` / `xxxOptions(locale)` だけで、
 * locale 無しで引ける口は無い。知らない値は ja → 値そのもの、の順に倒れるので、
 * enum に値が増えても画面が空白にならない。
 *
 * shared-db の enum と揃えること。語は `_specs/i18n-glossary.md` §3 が正 —
 * 表にある語に別の訳を当てない。
 */

import type { Locale } from "./i18n";
import {
  label,
  labelKeys,
  labelOptions as messageLabelOptions,
} from "./messages";

/**
 * 表の名前（`UNIT_LABEL` など）で `messages/<locale>.json` の
 * `enum.<表の名前>.<値>` を引く。訳が無ければ ja、それも無ければ値そのもの。
 */
function resolveLabel(map: string, value: string, locale: Locale): string {
  return label(`enum.${map}.${value}`, locale, value);
}

function labelOptions(
  map: string,
  locale: Locale,
): { value: string; label: string }[] {
  return messageLabelOptions(`enum.${map}`, locale);
}

export const unitLabel = (value: string, locale: Locale) =>
  resolveLabel("UNIT_LABEL", value, locale);
export const unitOptions = (locale: Locale) =>
  labelOptions("UNIT_LABEL", locale);

export const taxTypeLabel = (value: string, locale: Locale) =>
  resolveLabel("TAX_TYPE_LABEL", value, locale);
export const taxTypeOptions = (locale: Locale) =>
  labelOptions("TAX_TYPE_LABEL", locale);

export const invoiceMethodLabel = (value: string, locale: Locale) =>
  resolveLabel("INVOICE_METHOD_LABEL", value, locale);
export const invoiceMethodOptions = (locale: Locale) =>
  labelOptions("INVOICE_METHOD_LABEL", locale);

export const bpRoleLabel = (value: string, locale: Locale) =>
  resolveLabel("BP_ROLE_LABEL", value, locale);
export const bpRoleOptions = (locale: Locale) =>
  labelOptions("BP_ROLE_LABEL", locale);

/** ロールバッジの色（design.md §1.1 のカテゴリ色に合わせる）。色名は訳さない。 */
export const BP_ROLE_COLOR: Record<string, string> = {
  CUSTOMER: "blue",
  END_USER: "violet",
  VENDOR: "teal",
};

export const vendorTypeLabel = (value: string, locale: Locale) =>
  resolveLabel("VENDOR_TYPE_LABEL", value, locale);
export const vendorTypeOptions = (locale: Locale) =>
  labelOptions("VENDOR_TYPE_LABEL", locale);

export const countryLabel = (value: string, locale: Locale) =>
  resolveLabel("COUNTRY_LABEL", value, locale);
export const countryOptions = (locale: Locale) =>
  labelOptions("COUNTRY_LABEL", locale);

export const bankAccountTypeLabel = (value: string, locale: Locale) =>
  resolveLabel("BANK_ACCOUNT_TYPE_LABEL", value, locale);
export const bankAccountTypeOptions = (locale: Locale) =>
  labelOptions("BANK_ACCOUNT_TYPE_LABEL", locale);

export const processCategoryLabel = (value: string, locale: Locale) =>
  resolveLabel("PROCESS_CATEGORY_LABEL", value, locale);
export const processCategoryOptions = (locale: Locale) =>
  labelOptions("PROCESS_CATEGORY_LABEL", locale);
/** カタログ順（ja の並び順）の生キー一覧 — 表示ラベルではなく順序だけが要る呼び出し元向け。 */
export const PROCESS_CATEGORY_KEYS: readonly string[] = labelKeys(
  "enum.PROCESS_CATEGORY_LABEL",
);

export const lotInputModeLabel = (value: string, locale: Locale) =>
  resolveLabel("LOT_INPUT_MODE_LABEL", value, locale);
export const lotInputModeOptions = (locale: Locale) =>
  labelOptions("LOT_INPUT_MODE_LABEL", locale);

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

export const processExecutionLabel = (value: string, locale: Locale) =>
  resolveLabel("PROCESS_EXECUTION_LABEL", value, locale);
export const processExecutionOptions = (locale: Locale) =>
  labelOptions("PROCESS_EXECUTION_LABEL", locale);

export const quantityTrackingLabel = (value: string, locale: Locale) =>
  resolveLabel("QUANTITY_TRACKING_LABEL", value, locale);
export const quantityTrackingOptions = (locale: Locale) =>
  labelOptions("QUANTITY_TRACKING_LABEL", locale);

export const dependencyRelationLabel = (value: string, locale: Locale) =>
  resolveLabel("DEPENDENCY_RELATION_LABEL", value, locale);
export const dependencyRelationOptions = (locale: Locale) =>
  labelOptions("DEPENDENCY_RELATION_LABEL", locale);

export const approvalModeLabel = (value: string, locale: Locale) =>
  resolveLabel("APPROVAL_MODE_LABEL", value, locale);
export const approvalModeOptions = (locale: Locale) =>
  labelOptions("APPROVAL_MODE_LABEL", locale);

export const workOrderTypeLabel = (value: string, locale: Locale) =>
  resolveLabel("WORK_ORDER_TYPE_LABEL", value, locale);
export const workOrderTypeOptions = (locale: Locale) =>
  labelOptions("WORK_ORDER_TYPE_LABEL", locale);

export const orderTypeLabel = (value: string, locale: Locale) =>
  resolveLabel("ORDER_TYPE_LABEL", value, locale);
export const orderTypeOptions = (locale: Locale) =>
  labelOptions("ORDER_TYPE_LABEL", locale);

export const deliveryOrderTypeLabel = (value: string, locale: Locale) =>
  resolveLabel("DELIVERY_ORDER_TYPE_LABEL", value, locale);
export const deliveryOrderTypeOptions = (locale: Locale) =>
  labelOptions("DELIVERY_ORDER_TYPE_LABEL", locale);

export const deliveryMethodLabel = (value: string, locale: Locale) =>
  resolveLabel("DELIVERY_METHOD_LABEL", value, locale);
export const deliveryMethodOptions = (locale: Locale) =>
  labelOptions("DELIVERY_METHOD_LABEL", locale);

export const acceptanceDeliveryMethodLabel = (value: string, locale: Locale) =>
  resolveLabel("ACCEPTANCE_DELIVERY_METHOD_LABEL", value, locale);
export const acceptanceDeliveryMethodOptions = (locale: Locale) =>
  labelOptions("ACCEPTANCE_DELIVERY_METHOD_LABEL", locale);

export const purchaseStatusLabel = (value: string, locale: Locale) =>
  resolveLabel("PURCHASE_STATUS_LABEL", value, locale);
export const purchaseStatusOptions = (locale: Locale) =>
  labelOptions("PURCHASE_STATUS_LABEL", locale);

export const purchaseRequestStatusLabel = (value: string, locale: Locale) =>
  resolveLabel("PURCHASE_REQUEST_STATUS_LABEL", value, locale);
export const purchaseRequestStatusOptions = (locale: Locale) =>
  labelOptions("PURCHASE_REQUEST_STATUS_LABEL", locale);

export const designTriggerLabel = (value: string, locale: Locale) =>
  resolveLabel("DESIGN_TRIGGER_LABEL", value, locale);
export const designTriggerOptions = (locale: Locale) =>
  labelOptions("DESIGN_TRIGGER_LABEL", locale);

export const designKindLabel = (value: string, locale: Locale) =>
  resolveLabel("DESIGN_KIND_LABEL", value, locale);
export const designKindOptions = (locale: Locale) =>
  labelOptions("DESIGN_KIND_LABEL", locale);

export const designPriorityLabel = (value: string, locale: Locale) =>
  resolveLabel("DESIGN_PRIORITY_LABEL", value, locale);
export const designPriorityOptions = (locale: Locale) =>
  labelOptions("DESIGN_PRIORITY_LABEL", locale);

export const notificationTypeLabel = (value: string, locale: Locale) =>
  resolveLabel("NOTIFICATION_TYPE_LABEL", value, locale);
export const notificationTypeOptions = (locale: Locale) =>
  labelOptions("NOTIFICATION_TYPE_LABEL", locale);

export const inspectionItemTypeLabel = (value: string, locale: Locale) =>
  resolveLabel("INSPECTION_ITEM_TYPE_LABEL", value, locale);
export const inspectionItemTypeOptions = (locale: Locale) =>
  labelOptions("INSPECTION_ITEM_TYPE_LABEL", locale);

export const inspectionLayoutStyleLabel = (value: string, locale: Locale) =>
  resolveLabel("INSPECTION_LAYOUT_STYLE_LABEL", value, locale);
export const inspectionLayoutStyleOptions = (locale: Locale) =>
  labelOptions("INSPECTION_LAYOUT_STYLE_LABEL", locale);

export const inspectionSampleNamingLabel = (value: string, locale: Locale) =>
  resolveLabel("INSPECTION_SAMPLE_NAMING_LABEL", value, locale);
export const inspectionSampleNamingOptions = (locale: Locale) =>
  labelOptions("INSPECTION_SAMPLE_NAMING_LABEL", locale);

export const inspectionItemSectionLabel = (value: string, locale: Locale) =>
  resolveLabel("INSPECTION_ITEM_SECTION_LABEL", value, locale);
export const inspectionItemSectionOptions = (locale: Locale) =>
  labelOptions("INSPECTION_ITEM_SECTION_LABEL", locale);

export const inspectionDepartmentLabel = (value: string, locale: Locale) =>
  resolveLabel("INSPECTION_DEPARTMENT_LABEL", value, locale);
export const inspectionDepartmentOptions = (locale: Locale) =>
  labelOptions("INSPECTION_DEPARTMENT_LABEL", locale);

export const inspectionSamplingModeLabel = (value: string, locale: Locale) =>
  resolveLabel("INSPECTION_SAMPLING_MODE_LABEL", value, locale);
export const inspectionSamplingModeOptions = (locale: Locale) =>
  labelOptions("INSPECTION_SAMPLING_MODE_LABEL", locale);

/** 表示用ラベル（未知の値はそのまま返す — 新しい enum 追加時も画面が壊れない）。 */
export const permissionActionLabel = (v: string, locale: Locale): string =>
  resolveLabel("PERMISSION_ACTION_LABEL", v, locale);
export const permissionScopeLabel = (v: string, locale: Locale): string =>
  resolveLabel("PERMISSION_SCOPE_LABEL", v, locale);

/** 指示書の履歴（history Json の action）表示ラベル。承認記録・履歴表示用。 */
export const workOrderHistoryActionLabel = (value: string, locale: Locale) =>
  resolveLabel("WORK_ORDER_HISTORY_ACTION_LABEL", value, locale);

/** 設計依頼書の履歴（history Json の action）表示ラベル。 */
export const designHistoryActionLabel = (value: string, locale: Locale) =>
  resolveLabel("DESIGN_HISTORY_ACTION_LABEL", value, locale);
