import "server-only";

/**
 * data.ts — 検査表テンプレートの読み取りヘルパ (MS09)。
 * inspection_template_items の Json カラムを型別フィールドへ分解して
 * クライアント行 / inspection-core spec に変換する。
 */

import type { InspectionTemplateItemRow } from "@/components/master/inspection-templates/InspectionTemplateModals";
import { prisma } from "@/lib/db";
import type { LocalizedText } from "@/lib/format";
import { localized } from "@/lib/format";
import {
  type InspectionItemRecord as CoreItemRecord,
  parseSelectOptions,
  parseStringArray,
} from "@/lib/inspection-core";

/** 検査承認グループの選択肢（承認設定 MS0B の approval_groups。有効のみ）。 */
export async function fetchApprovalGroupOptions(): Promise<
  { value: string; label: string }[]
> {
  const groups = await prisma.approvalGroup.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
    select: { id: true, name: true },
  });
  return groups.map((g) => ({
    value: String(g.id),
    label: localized(g.name as LocalizedText | null),
  }));
}

/** inspection_template_items 行のうち変換に使うフィールド（Prisma include 由来）。 */
export interface InspectionItemRecord extends CoreItemRecord {
  itemName: unknown;
  sortOrder: number;
  section: "MEASUREMENT" | "SHAPE";
  department: "MANUFACTURING" | "QUALITY_ASSURANCE" | null;
  measurementEquipment: string | null;
  nominalValue: unknown; // Prisma Decimal
  toleranceTopDelta: unknown;
  toleranceBottomDelta: unknown;
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
    section: item.section,
    department: item.department,
    measurementEquipment: item.measurementEquipment ?? "",
    nominalValue: num(item.nominalValue),
    toleranceTopDelta: num(item.toleranceTopDelta),
    toleranceBottomDelta: num(item.toleranceBottomDelta),
  };
}
