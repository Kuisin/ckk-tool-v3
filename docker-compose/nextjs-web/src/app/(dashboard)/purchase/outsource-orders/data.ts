/**
 * data.ts — 外注依頼 (PU02) のサーバーサイド取得・マッピング。
 *
 * 外注依頼は独立テーブルを持たず、指示書の外注工程
 * （work_order_steps.execution_location = OUTSOURCE）の読み取り専用ビュー。
 * 依頼日・入荷予定日・入荷日の編集は工程実行画面
 * （/production/work-orders/{n}/steps/{stepId}）で行う。
 */

import type { OutsourceStepRow } from "@/components/purchase/outsource-orders/model";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

const dateOnly = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;

/** 外注工程一覧 (PU02) — 指示書番号の新しい順。 */
export async function fetchOutsourceSteps(): Promise<OutsourceStepRow[]> {
  const rows = await prisma.workOrderStep.findMany({
    where: { executionLocation: "OUTSOURCE" },
    include: {
      workOrder: {
        include: { salesOrder: { include: { product: true } } },
      },
      processStep: true,
      supplierBp: true,
    },
    orderBy: [{ workOrder: { workOrderNumber: "desc" } }, { sortOrder: "asc" }],
  });
  return rows.map((s) => ({
    stepId: s.id,
    workOrderNumber: s.workOrder.workOrderNumber,
    productName: localized(
      s.workOrder.salesOrder.product.name as LocalizedText | null,
    ),
    processName: localized(s.processStep.name as LocalizedText | null),
    supplierBpId: s.supplierBpId,
    supplierName: s.supplierBp
      ? localized(s.supplierBp.name as LocalizedText | null)
      : null,
    requestedAt: dateOnly(s.outsourceRequestedAt),
    expectedAt: dateOnly(s.outsourceExpectedAt),
    receivedAt: dateOnly(s.outsourceReceivedAt),
    status: s.status,
  }));
}
