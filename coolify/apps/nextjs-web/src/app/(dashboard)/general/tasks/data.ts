/**
 * data.ts — 未処理一覧 (CM01) の作業予定セクションのデータソース。
 *
 * 自分に割り当てられた作業計画（work_order_step_plans）のうち、まだ終わって
 * いないもの（工程が PENDING / IN_PROGRESS・指示書がキャンセル以外）を
 * 計画日順に返す。行から工程実行画面へ 1 クリックで着ける。
 */

import { getCurrentActorId } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { formatDocNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

/** 未処理一覧の作業予定 1 行（client-safe）。 */
export interface MyPlanRow {
  id: string;
  /** 計画日（YYYY-MM-DD）。 */
  date: string;
  /** HH:mm（JST）— 時刻指定なしは null。 */
  startTime: string | null;
  endTime: string | null;
  quantity: number | null;
  stepId: string;
  stepName: string;
  stepStatus: string; // STEP_STATUS
  workOrderNumber: number;
  /** 書類番号 WO-YYYYMM-NNNNN。 */
  docNumber: string;
  workOrderStatus: string; // WORK_ORDER_STATUS
  productName: string;
  workLocationName: string | null;
}

const jstTime = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d)
    : null;

/** 自分の未完了の作業計画（計画日 → 開始時刻順）。 */
export async function fetchMyPendingPlans(): Promise<MyPlanRow[]> {
  const actor = await getCurrentActorId();
  if (!actor) return [];
  const rows = await prisma.workOrderStepPlan.findMany({
    where: {
      userId: actor,
      step: {
        status: { in: ["PENDING", "IN_PROGRESS"] },
        workOrder: { status: { not: "CANCELLED" } },
      },
    },
    select: {
      id: true,
      plannedDate: true,
      plannedStartAt: true,
      plannedEndAt: true,
      quantity: true,
      workLocation: { select: { name: true } },
      step: {
        select: {
          id: true,
          status: true,
          processStep: { select: { name: true } },
          workOrder: {
            select: {
              workOrderNumber: true,
              yearMonth: true,
              seq: true,
              status: true,
              product: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ plannedDate: "asc" }, { plannedStartAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    date: r.plannedDate.toISOString().slice(0, 10),
    startTime: jstTime(r.plannedStartAt),
    endTime: jstTime(r.plannedEndAt),
    quantity: r.quantity,
    stepId: r.step.id,
    stepName: localized(r.step.processStep.name as LocalizedText | null),
    stepStatus: r.step.status,
    workOrderNumber: r.step.workOrder.workOrderNumber,
    docNumber: formatDocNumber("WOR", r.step.workOrder),
    workOrderStatus: r.step.workOrder.status,
    productName: localized(
      r.step.workOrder.product.name as LocalizedText | null,
    ),
    workLocationName: r.workLocation
      ? localized(r.workLocation.name as LocalizedText | null)
      : null,
  }));
}
