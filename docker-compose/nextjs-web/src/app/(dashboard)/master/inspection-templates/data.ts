import "server-only";

/**
 * data.ts — 検査表テンプレートの読み取りヘルパ (MS08)。
 * inspection_template_items の Json カラムを型別フィールドへ分解して
 * クライアント行 / inspection-core spec に変換する。
 */

import type { InspectionTemplateItemRow } from "@/components/master/inspection-templates/InspectionTemplateModals";
import type { LocalizedText } from "@/lib/format";
import {
  type InspectionItemRecord as CoreItemRecord,
  parseSelectOptions,
  parseStringArray,
} from "@/lib/inspection-core";

/** inspection_template_items 行のうち変換に使うフィールド（Prisma include 由来）。 */
export interface InspectionItemRecord extends CoreItemRecord {
  itemName: unknown;
  sortOrder: number;
}

const num = (v: unknown): number | null => (v == null ? null : Number(v));

/** DB 行 → クライアント行（Json カラムを型別フィールドへ分解）。 */
export function toItemRow(
  item: InspectionItemRecord,
): InspectionTemplateItemRow {
  const itemName = item.itemName as LocalizedText | null;
  const goal = item.goalValue;
  return {
    id: item.id,
    itemNameJa: itemName?.ja ?? "",
    itemNameEn: itemName?.en ?? "",
    inputType: item.inputType,
    unit: item.unit ?? "",
    toleranceMin: num(item.toleranceMin),
    toleranceMax: num(item.toleranceMax),
    options: parseSelectOptions(item.options).map((o) => ({
      value: o.value,
      labelJa: o.label.ja ?? "",
      labelEn: o.label.en ?? "",
    })),
    acceptBool: item.acceptBool,
    acceptOptions: parseStringArray(item.acceptOptions) ?? [],
    goalNumber:
      item.inputType === "NUMBER" && typeof goal === "number" ? goal : null,
    goalBool:
      item.inputType === "BOOLEAN" && typeof goal === "boolean" ? goal : null,
    goalOptions:
      item.inputType === "SELECT_SINGLE"
        ? typeof goal === "string"
          ? [goal]
          : []
        : item.inputType === "SELECT_MULTI"
          ? (parseStringArray(goal) ?? [])
          : [],
    allowManualOverride: item.allowManualOverride,
    isRequired: item.isRequired,
    sortOrder: item.sortOrder,
  };
}
