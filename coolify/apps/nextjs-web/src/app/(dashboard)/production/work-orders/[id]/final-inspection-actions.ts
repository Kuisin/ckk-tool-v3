"use server";

/**
 * Server Actions — 最終検査・出荷前確認（旧帳票「■最終検査」欄）。
 *
 * work_order_final_inspections は指示書 1 件に 1 行（初回操作で作成）。
 * 各役割は「押した人が誰か」を都度スタンプする（recordedBy/approvedBy と
 * 同じ作法）。棚包→納品書発行→出荷許可は紙の記入順のまま — 前段が済むまで
 * 次段は記録できない。権限は指示書の実行と同じ work_order:UPDATE
 * （役割ごとに RBAC を細分するのは過剰と判断）。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { type ActionResult, actionError, actionOk } from "@/lib/server-action";

const BASE_PATH = "/production/work-orders";

function revalidate(workOrderNumber: number) {
  revalidatePath(BASE_PATH);
  revalidatePath(`${BASE_PATH}/${workOrderNumber}`);
}

async function deniedPermission(): Promise<ActionResult | null> {
  const authz = await checkPermission("work_order", "UPDATE");
  return authz.ok ? null : actionError(authz.error);
}

async function findWorkOrderId(
  workOrderNumber: number,
): Promise<string | null> {
  const wo = await prisma.workOrder.findUnique({
    where: { workOrderNumber },
    select: { id: true },
  });
  return wo?.id ?? null;
}

const CHECKLIST_FIELDS = [
  "drawingLabel",
  "protectiveCap",
  "finishedQuantity",
] as const;
type ChecklistField = (typeof CHECKLIST_FIELDS)[number];

const CHECKLIST_LABEL: Record<ChecklistField, string> = {
  drawingLabel: "図面・ラベル・膜厚・寸法と間違いがないか",
  protectiveCap: "保護キャップ使用しているか(φ0.6以下)",
  finishedQuantity: "完成本数は合っているか",
};

/** ■最終検査の3項目（画像固定・確認者スタンプ付き）。 */
export async function setFinalInspectionCheck(
  workOrderNumber: number,
  field: ChecklistField,
  ok: boolean,
): Promise<ActionResult> {
  const denied = await deniedPermission();
  if (denied) return denied;
  if (!CHECKLIST_FIELDS.includes(field)) return actionError("不正な項目です");
  const workOrderId = await findWorkOrderId(workOrderNumber);
  if (!workOrderId) return actionError("指示書が見つかりません");
  const actor = await getCurrentActorId();
  const now = new Date();
  try {
    await prisma.workOrderFinalInspection.upsert({
      where: { workOrderId },
      create: {
        workOrderId,
        [`${field}Ok`]: ok,
        [`${field}CheckedBy`]: actor,
        [`${field}CheckedAt`]: now,
      },
      update: {
        [`${field}Ok`]: ok,
        [`${field}CheckedBy`]: actor,
        [`${field}CheckedAt`]: now,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: {
        note: `最終検査「${CHECKLIST_LABEL[field]}」を${ok ? "○" : "×"}で記録`,
      },
    });
    revalidate(workOrderNumber);
    return actionOk();
  } catch (e) {
    console.error("setFinalInspectionCheck failed", e);
    return actionError("最終検査の記録に失敗しました");
  }
}

const SPARE_STOCK_FIELDS = ["spareStockUsed", "spareStockReceived"] as const;
type SpareStockField = (typeof SPARE_STOCK_FIELDS)[number];

const SPARE_STOCK_LABEL: Record<SpareStockField, string> = {
  spareStockUsed: "予備在庫使用",
  spareStockReceived: "予備在庫入庫",
};

/** 予備在庫使用・予備在庫入庫（単純なチェック — スタンプなし）。 */
export async function setFinalInspectionSpareStock(
  workOrderNumber: number,
  field: SpareStockField,
  value: boolean,
): Promise<ActionResult> {
  const denied = await deniedPermission();
  if (denied) return denied;
  if (!SPARE_STOCK_FIELDS.includes(field)) return actionError("不正な項目です");
  const workOrderId = await findWorkOrderId(workOrderNumber);
  if (!workOrderId) return actionError("指示書が見つかりません");
  try {
    await prisma.workOrderFinalInspection.upsert({
      where: { workOrderId },
      create: { workOrderId, [field]: value },
      update: { [field]: value },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: { note: `${SPARE_STOCK_LABEL[field]}: ${value ? "有" : "無"}` },
    });
    revalidate(workOrderNumber);
    return actionOk();
  } catch (e) {
    console.error("setFinalInspectionSpareStock failed", e);
    return actionError("予備在庫の記録に失敗しました");
  }
}

const SHIPMENT_STAGES = [
  "shelved",
  "deliveryNoteIssued",
  "shipmentAuthorized",
] as const;
type ShipmentStage = (typeof SHIPMENT_STAGES)[number];

const SHIPMENT_STAGE_LABEL: Record<ShipmentStage, string> = {
  shelved: "棚包担当者",
  deliveryNoteIssued: "納品書発行者",
  shipmentAuthorized: "出荷許可者",
};

/**
 * 出荷前チェーン（棚包→納品書発行→出荷許可）— 紙の記入順のまま、
 * 前段が済むまで次段は記録できない。
 */
export async function advanceShipmentStage(
  workOrderNumber: number,
  stage: ShipmentStage,
): Promise<ActionResult> {
  const denied = await deniedPermission();
  if (denied) return denied;
  const stageIndex = SHIPMENT_STAGES.indexOf(stage);
  if (stageIndex < 0) return actionError("不正な段階です");
  const workOrderId = await findWorkOrderId(workOrderNumber);
  if (!workOrderId) return actionError("指示書が見つかりません");
  try {
    const existing = await prisma.workOrderFinalInspection.findUnique({
      where: { workOrderId },
      select: {
        shelvedAt: true,
        deliveryNoteIssuedAt: true,
        shipmentAuthorizedAt: true,
      },
    });
    const stampedAt: Record<ShipmentStage, Date | null> = {
      shelved: existing?.shelvedAt ?? null,
      deliveryNoteIssued: existing?.deliveryNoteIssuedAt ?? null,
      shipmentAuthorized: existing?.shipmentAuthorizedAt ?? null,
    };
    if (stampedAt[stage] != null) {
      return actionError(
        `${SHIPMENT_STAGE_LABEL[stage]}は既に記録されています`,
      );
    }
    const priorStage = SHIPMENT_STAGES[stageIndex - 1];
    if (priorStage && stampedAt[priorStage] == null) {
      return actionError(
        `先に${SHIPMENT_STAGE_LABEL[priorStage]}を記録してください`,
      );
    }
    const actor = await getCurrentActorId();
    const now = new Date();
    await prisma.workOrderFinalInspection.upsert({
      where: { workOrderId },
      create: {
        workOrderId,
        [`${stage}By`]: actor,
        [`${stage}At`]: now,
      },
      update: {
        [`${stage}By`]: actor,
        [`${stage}At`]: now,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: { note: `${SHIPMENT_STAGE_LABEL[stage]}を記録` },
    });
    revalidate(workOrderNumber);
    return actionOk();
  } catch (e) {
    console.error("advanceShipmentStage failed", e);
    return actionError("出荷前確認の記録に失敗しました");
  }
}

/** 出荷時不良内容確認者印（任意メモ + 確認スタンプ）。 */
export async function recordShipDefectReview(
  workOrderNumber: number,
  notes: string,
): Promise<ActionResult> {
  const denied = await deniedPermission();
  if (denied) return denied;
  const workOrderId = await findWorkOrderId(workOrderNumber);
  if (!workOrderId) return actionError("指示書が見つかりません");
  const parsed = z.string().max(2000).safeParse(notes);
  if (!parsed.success) return actionError("入力が不正です");
  const actor = await getCurrentActorId();
  const now = new Date();
  try {
    await prisma.workOrderFinalInspection.upsert({
      where: { workOrderId },
      create: {
        workOrderId,
        shipDefectReviewedBy: actor,
        shipDefectReviewedAt: now,
        shipDefectNotes: parsed.data.trim() || null,
      },
      update: {
        shipDefectReviewedBy: actor,
        shipDefectReviewedAt: now,
        shipDefectNotes: parsed.data.trim() || null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: { note: "出荷時不良内容確認者印を記録" },
    });
    revalidate(workOrderNumber);
    return actionOk();
  } catch (e) {
    console.error("recordShipDefectReview failed", e);
    return actionError("出荷時不良内容の記録に失敗しました");
  }
}
