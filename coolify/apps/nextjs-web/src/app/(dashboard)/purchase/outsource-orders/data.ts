/**
 * data.ts — 外注依頼 (PU04) のサーバーサイド取得・マッピング。
 *
 * 外注依頼は独立テーブルを持たず、指示書の外注工程
 * （work_order_steps.execution_location = OUTSOURCE）の読み取り専用ビュー。
 * 依頼日・入荷予定日・入荷日の編集は工程実行画面
 * （/production/work-orders/{n}/steps/{stepId}）で行う。
 *
 * 依頼番号（OUT-FFFF-NNNNN）だけは表 outsource_orders が持つ — 工程に依頼日が
 * 入った時点で DB のトリガーが 1 行作って番号を払い出す（アプリは作らない）。
 * 依頼日の無い工程は番号を持たない（null）。行を指す id は従来どおり工程の uuid。
 */

import type { OutsourceStepRow } from "@/components/purchase/outsource-orders/model";
import { prisma } from "@/lib/db";
import { docRefCompany } from "@/lib/doc-ref-core";
import { type LocalizedText, localized } from "@/lib/format";

const dateOnly = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;

/** 外注工程一覧 (PU04) — 指示書番号の新しい順。 */
export async function fetchOutsourceSteps(): Promise<OutsourceStepRow[]> {
  const rows = await prisma.workOrderStep.findMany({
    where: { executionLocation: "OUTSOURCE" },
    include: {
      workOrder: { include: { productItem: true } },
      processStep: true,
      supplierBp: true,
      outsourceOrder: { select: { docNumber: true, docRef: true } },
    },
    orderBy: [{ workOrder: { workOrderNumber: "desc" } }, { sortOrder: "asc" }],
  });
  return rows.map((s) => ({
    stepId: s.id,
    outsourceNumber: s.outsourceOrder?.docNumber ?? null,
    // 依頼番号が無い（依頼日前の）工程も、指示書の法人のもの。
    companyCode: docRefCompany(s.outsourceOrder?.docRef ?? s.workOrder.docRef),
    workOrderNumber: s.workOrder.workOrderNumber,
    productName: localized(
      s.workOrder.productItem.name as LocalizedText | null,
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 外注工程（詳細 URL の id = 工程の uuid）の依頼番号（OUT-FFFF-NNNNN）。
 * 依頼日の無い工程・uuid でない id は null。
 */
export async function fetchOutsourceNumber(
  stepId: string,
): Promise<string | null> {
  if (!UUID_RE.test(stepId)) return null;
  const row = await prisma.outsourceOrder.findUnique({
    where: { workOrderStepId: stepId },
    select: { docNumber: true },
  });
  return row?.docNumber ?? null;
}
