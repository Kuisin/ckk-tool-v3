/**
 * workflow-core-labels.ts — workflow-core.ts（twin file）が持つ `t()` の鍵を
 * next-intl で解決する。**web 専用・twin ではない。**
 *
 * kiosk は自分の辞書 + fillMessage を包んだ同じ形の resolver を自前で
 * 作って渡す（キオスクの i18n を web に持ち込まない・その逆もしない）。
 */

import type { useTranslations } from "next-intl";
import type { QuantityTrackingMode, WorkflowCoreT } from "./workflow-core";
import { QUANTITY_LABELS } from "./workflow-core";

type Tr = ReturnType<typeof useTranslations>;

/** workflow-core.ts の t() を next-intl の tr（`workflowCore.*` 名前空間）へつなぐ。 */
export function workflowCoreT(tr: Tr): WorkflowCoreT {
  return (key, fallback, vars) =>
    tr(`workflowCore.${key}`, vars as Record<string, string | number>) ||
    fallback;
}

/** QUANTITY_LABELS を画面表示用に解決したもの。 */
export function localizedQuantityLabels(
  tr: Tr,
  mode: QuantityTrackingMode,
): {
  input: string;
  success: string;
  semi: string;
  scrap: string;
  rework: string;
} {
  const t = workflowCoreT(tr);
  const labels = QUANTITY_LABELS[mode];
  return {
    input: t(labels.input, labels.input),
    success: t(labels.success, labels.success),
    semi: t(labels.semi, labels.semi),
    scrap: t(labels.scrap, labels.scrap),
    rework: t(labels.rework, labels.rework),
  };
}
