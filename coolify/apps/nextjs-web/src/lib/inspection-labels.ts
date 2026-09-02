/**
 * inspection-labels.ts — inspection-core.ts（twin file）の `samplingLabelJa` /
 * `sampleLabel` に相当する、**web の画面表示専用**の言語対応版。
 *
 * twin file の2つは意図的に ja 固定（PDF はいまも内部文書として ja 固定で
 * 出す — `inspection-sheet-pdf.ts` は twin file 側をそのまま使う）。kiosk は
 * これらを一切呼ばず、自前の `samplingLabel`（StepInspectionForm.tsx）を
 * 自分の辞書から組み立てている。web の画面（一覧・記録フォーム）でも同じ
 * ように、next-intl の `tr` から文言を組み立てるのがここ。
 */

import type { useTranslations } from "next-intl";
import type {
  InspectionSampleNaming,
  InspectionSamplingSpec,
} from "./inspection-core";

type Tr = ReturnType<typeof useTranslations>;

/** 検査対象の表示（画面用）。twin file の samplingLabelJa の言語対応版。 */
export function samplingLabel(
  tr: Tr,
  sampling: InspectionSamplingSpec,
  required?: number | null,
): string {
  switch (sampling.samplingMode) {
    case "ALL":
      return required != null
        ? tr("inspectionLabels.samplingAllWithCount", { count: required })
        : tr("inspectionLabels.samplingAll");
    case "PERCENT": {
      const pct = sampling.samplingValue ?? 0;
      return required != null
        ? tr("inspectionLabels.samplingPercentWithCount", {
            pct,
            count: required,
          })
        : tr("inspectionLabels.samplingPercent", { pct });
    }
    case "COUNT":
      return tr("inspectionLabels.samplingCount", {
        count: required ?? sampling.samplingValue ?? 0,
      });
  }
}

/** サンプルページの見出し（画面用）。twin file の sampleLabel の言語対応版。 */
export function sampleLabel(
  tr: Tr,
  index: number,
  naming: InspectionSampleNaming,
): string {
  if (naming === "INITIAL_MID_FINAL") {
    if (index === 0) return tr("inspectionLabels.sampleInitial");
    if (index === 1) return tr("inspectionLabels.sampleMid");
    if (index === 2) return tr("inspectionLabels.sampleFinal");
  }
  return tr("inspectionLabels.sampleGeneric", { n: index + 1 });
}
