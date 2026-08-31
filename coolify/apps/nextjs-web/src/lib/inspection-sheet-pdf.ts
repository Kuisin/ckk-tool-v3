import "server-only";

/**
 * inspection-sheet-pdf.ts — 検査表 PDF（inspection-sheet.html）のデータ組み立て。
 *
 * 空欄シート（テンプレートから現場メモ用）と記入済みシート（検査記録の結果
 * 確認用）の両モードを同じテンプレートで描画する。値セル・合否マークは
 * ルート側で HTML 片として組み立てる（pdf.ts のテンプレートは条件分岐を
 * 持たないため）。ユーザー入力由来の文字列はすべて esc() で HTML エスケープ。
 */

import { inspectionItemTypeLabel } from "@/lib/enum-labels";
import type { LocalizedText } from "@/lib/format";
import { localized } from "@/lib/format";
import {
  acceptLabel,
  formatCounts,
  formatSampleValue,
  goalLabel,
  type InspectionItemRecord,
  type InspectionRecordStyle,
  type InspectionSampleValue,
  type InspectionSamplingSpec,
  itemSpecFromRow,
  parseStoredSamples,
  requiredSampleCount,
  samplingLabelJa,
} from "@/lib/inspection-core";

export function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** 空欄記入線（未確定のメタ欄）。 */
const BLANK = '<span class="blank-line"></span>';

interface TemplateHead {
  code: string;
  version: number;
  name: unknown;
  relatedProcessStep: { name: unknown } | null;
  samplingMode: "ALL" | "PERCENT" | "COUNT";
  samplingValue: unknown; // Prisma Decimal
  recordStyle: InspectionRecordStyle;
}

interface ItemRow extends InspectionItemRecord {
  itemName: unknown;
}

/** 空欄シートの実測値セル数（要求数がそれ以上でも欄はここまで）。 */
const BLANK_CELL_CAP = 10;
/** 抜取指定なし（全数など数が出ない）ときの既定セル数。 */
const BLANK_CELL_DEFAULT = 3;

function blankValueCells(required: number | null): string {
  const n = Math.max(
    1,
    Math.min(required ?? BLANK_CELL_DEFAULT, BLANK_CELL_CAP),
  );
  const cells = Array.from(
    { length: n },
    () => '<span class="value-cell"></span>',
  ).join("");
  const more =
    required != null && required > BLANK_CELL_CAP
      ? `<span class="value-more">…全${required}本</span>`
      : "";
  return cells + more;
}

function itemBase(item: ItemRow) {
  const spec = itemSpecFromRow(item);
  return {
    spec,
    name: esc(localized(item.itemName as LocalizedText | null)),
    required_mark: item.isRequired
      ? ' <span class="pass-mark fail">*</span>'
      : "",
    type_label: esc(inspectionItemTypeLabel(item.inputType, "ja")),
    accept: esc(acceptLabel(spec) ?? "—"),
    goal: esc(goalLabel(spec) ?? "—"),
  };
}

/** 空欄シート（メモ用）の items — 検査対象・記録方式はシート単位。 */
export function blankSheetItems(
  items: ItemRow[],
  sampling: InspectionSamplingSpec,
  style: InspectionRecordStyle,
  lotQuantity: number | null,
) {
  const required = requiredSampleCount(sampling, lotQuantity);
  return items.map((item) => {
    const base = itemBase(item);
    return {
      ...base,
      values_html:
        style === "COUNTS"
          ? '<span class="value-more">検査数</span><span class="value-cell"></span><span class="value-more">合格数</span><span class="value-cell"></span>'
          : blankValueCells(required),
      judge_html: '<span class="judge-blank">合 ・ 否</span>',
    };
  });
}

/** 記入済みシート（結果確認用）の items。 */
export function filledSheetItems(
  rows: {
    templateItem: ItemRow;
    measuredValue: string | null;
    measuredValues: unknown;
    inspectedCount: number | null;
    passedCount: number | null;
    isPass: boolean | null;
  }[],
) {
  return rows.map((row) => {
    const base = itemBase(row.templateItem);
    const samples: InspectionSampleValue[] = parseStoredSamples(
      row.measuredValues,
    );
    const values =
      samples.length > 0
        ? samples
        : row.measuredValue != null
          ? [row.measuredValue]
          : [];
    const values_html =
      row.inspectedCount != null || row.passedCount != null
        ? `<span class="value-cell filled">${esc(formatCounts(row.inspectedCount, row.passedCount))}</span>`
        : values.length > 0
          ? values
              .map(
                (s) =>
                  `<span class="value-cell filled">${esc(formatSampleValue(base.spec, s))}</span>`,
              )
              .join("")
          : '<span class="value-more">—</span>';
    const judge_html =
      row.isPass == null
        ? '<span class="judge-blank">—</span>'
        : row.isPass
          ? '<span class="pass-mark pass">合格</span>'
          : '<span class="pass-mark fail">不合格</span>';
    return {
      ...base,
      values_html,
      judge_html,
    };
  });
}

/** テンプレートヘッダ部の共通データ（検査対象・記録方式を含む）。 */
export function sheetTemplateHead(t: TemplateHead, lotQuantity: number | null) {
  const sampling: InspectionSamplingSpec = {
    samplingMode: t.samplingMode,
    samplingValue: t.samplingValue == null ? null : Number(t.samplingValue),
  };
  const required = requiredSampleCount(sampling, lotQuantity);
  return {
    code: esc(t.code),
    version: `v${t.version}`,
    name: esc(localized(t.name as LocalizedText | null)),
    related_step: t.relatedProcessStep
      ? esc(localized(t.relatedProcessStep.name as LocalizedText | null))
      : "—",
    sampling: esc(samplingLabelJa(sampling, required)),
    record_style: t.recordStyle === "COUNTS" ? "合格数のみ" : "実測値",
  };
}

export const BLANK_LINE = BLANK;
