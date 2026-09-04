/**
 * inspection-value-label.ts — 検査記録 1 行の「実測値」表示文字列。
 *
 * 検査記録の一覧（step-records.ts）と検査承認（inspection-approval.ts）の
 * **両方が同じ見え方でなければならない** — 承認する人が見る値と、記録した人が
 * 見る値が違ったら承認の意味がない。以前は step-records.ts の中に閉じた
 * ローカル関数だったので、承認側が同じものを書き写す形になりかけた。
 *
 * 3 通りある:
 *   合格数のみ（COUNTS）   → 「合格 3/5」
 *   新形式 measured_values → 型別のフォーマット（複数サンプルは " / " 連結）
 *   旧形式 measured_value  → 生値のまま
 */

import { getMessages, type Locale } from "./i18n";
import {
  type BoolLabels,
  formatCounts,
  formatSampleValue,
  itemSpecFromRow,
  parseStoredSamples,
} from "./inspection-core";

/** 実測値表示のはい/いいえ（ロケール別）。 */
const BOOL_LABELS: Record<Locale, BoolLabels> = {
  ja: { yes: "はい", no: "いいえ" },
  en: { yes: "Yes", no: "No" },
  zh: { yes: "是", no: "否" },
};

/** 検査記録項目（Prisma の行をそのまま渡せる形）。 */
export interface InspectionRecordItemRow {
  measuredValue: string | null;
  measuredValues: unknown;
  inspectedCount: number | null;
  passedCount: number | null;
  templateItem: Parameters<typeof itemSpecFromRow>[0];
}

/** その言語での実測値フォーマッタを作る。 */
export function inspectionValueLabel(
  locale: Locale,
): (it: InspectionRecordItemRow) => string | null {
  const bool = BOOL_LABELS[locale];
  const passLabel = getMessages(locale).steps.inspection.pass;
  return (it) => {
    if (it.inspectedCount != null || it.passedCount != null) {
      return formatCounts(it.inspectedCount, it.passedCount, passLabel);
    }
    const samples = parseStoredSamples(it.measuredValues);
    if (samples.length === 0) return it.measuredValue;
    const spec = itemSpecFromRow(it.templateItem);
    return samples
      .map((s) => formatSampleValue(spec, s, locale, bool))
      .join(" / ");
  };
}
