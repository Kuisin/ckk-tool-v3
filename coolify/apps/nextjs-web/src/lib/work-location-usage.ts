/**
 * work-location-usage.ts — 作業場所の使用状況を人が読む形にする。
 *
 * 削除の Server Action（場所・グループ）と、作業場所マスタ (MS0D) の削除確認の
 * 事前表示が**同じ数え方・同じ文言**を使うための唯一の定義。数える関連は
 * lib/master-refs の `MASTER_REFERENCES.WorkLocation` で、ここはその 1 本ずつに
 * 文言を 1 つ対応させる — total > 0 なのに文言が空（= 削除が素通りする）、
 * という取りこぼしを作らない（work-location-usage.test.ts が両者の一致を守る）。
 */

/** `Model.field`（lib/master-refs referenceKey）→ 文言のキー（`{count}` を取る）。 */
export const WORK_LOCATION_USAGE_MESSAGES = {
  "WorkOrderStepPlan.workLocationId":
    "master.workLocationsActions.usedByStepPlans",
  "WorkOrderStepActual.workLocationId":
    "master.workLocationsActions.usedByStepActuals",
  "KioskDevice.defaultWorkLocationId":
    "master.workLocationsActions.usedByKioskDevices",
  "OrderAcceptance.shippingWorkLocationId":
    "master.workLocationsActions.usedByOrderAcceptances",
  "OrderLine.shippingWorkLocationId":
    "master.workLocationsActions.usedByOrderLines",
  "ProcessStepWorkLocation.workLocationId":
    "master.workLocationsActions.usedByProcessSteps",
} as const;

type UsageMessageKey =
  (typeof WORK_LOCATION_USAGE_MESSAGES)[keyof typeof WORK_LOCATION_USAGE_MESSAGES];

/** 翻訳関数（next-intl の t / getTranslations の戻り値のどちらでもよい）。 */
type UsageTr = (key: UsageMessageKey, values: { count: number }) => string;

/** 参照件数（`Model.field` → 件数）を「作業計画 3 件」のような文言の列にする。 */
export function workLocationUsage(
  tr: UsageTr,
  byTable: Record<string, number>,
): string[] {
  const used: string[] = [];
  for (const [key, message] of Object.entries(WORK_LOCATION_USAGE_MESSAGES)) {
    const count = byTable[key] ?? 0;
    if (count > 0) used.push(tr(message as UsageMessageKey, { count }));
  }
  return used;
}
