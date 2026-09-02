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
import { getTranslations } from "next-intl/server";
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

function checklistLabel(
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Record<ChecklistField, string> {
  return {
    drawingLabel: tr("production.finalInspectionActions.drawingLabelCheck"),
    protectiveCap: tr("production.finalInspectionActions.protectiveCapCheck"),
    finishedQuantity: tr(
      "production.finalInspectionActions.finishedQuantityCheck",
    ),
  };
}

/** ■最終検査の3項目（画像固定・確認者スタンプ付き）。 */
export async function setFinalInspectionCheck(
  workOrderNumber: number,
  field: ChecklistField,
  ok: boolean,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const denied = await deniedPermission();
  if (denied) return denied;
  if (!CHECKLIST_FIELDS.includes(field))
    return actionError(tr("production.finalInspectionActions.invalidField"));
  const workOrderId = await findWorkOrderId(workOrderNumber);
  if (!workOrderId)
    return actionError(tr("production.finalInspectionActions.woNotFound"));
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
        note: tr("production.finalInspectionActions.checkRecordedNote", {
          label: checklistLabel(tr)[field],
          mark: ok
            ? tr("production.finalInspectionActions.markOk")
            : tr("production.finalInspectionActions.markNg"),
        }),
      },
    });
    revalidate(workOrderNumber);
    return actionOk();
  } catch (e) {
    console.error("setFinalInspectionCheck failed", e);
    return actionError(tr("production.finalInspectionActions.checkSaveFailed"));
  }
}

const SPARE_STOCK_FIELDS = ["spareStockUsed", "spareStockReceived"] as const;
type SpareStockField = (typeof SPARE_STOCK_FIELDS)[number];

function spareStockLabel(
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Record<SpareStockField, string> {
  return {
    spareStockUsed: tr("production.finalInspectionActions.spareStockUsed"),
    spareStockReceived: tr(
      "production.finalInspectionActions.spareStockReceived",
    ),
  };
}

/** 予備在庫使用・予備在庫入庫（単純なチェック — スタンプなし）。 */
export async function setFinalInspectionSpareStock(
  workOrderNumber: number,
  field: SpareStockField,
  value: boolean,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const denied = await deniedPermission();
  if (denied) return denied;
  if (!SPARE_STOCK_FIELDS.includes(field))
    return actionError(tr("production.finalInspectionActions.invalidField"));
  const workOrderId = await findWorkOrderId(workOrderNumber);
  if (!workOrderId)
    return actionError(tr("production.finalInspectionActions.woNotFound"));
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
      after: {
        note: tr("production.finalInspectionActions.spareStockNote", {
          label: spareStockLabel(tr)[field],
          value: value
            ? tr("production.finalInspectionActions.present")
            : tr("production.finalInspectionActions.absent"),
        }),
      },
    });
    revalidate(workOrderNumber);
    return actionOk();
  } catch (e) {
    console.error("setFinalInspectionSpareStock failed", e);
    return actionError(
      tr("production.finalInspectionActions.spareStockSaveFailed"),
    );
  }
}

const SHIPMENT_STAGES = [
  "shelved",
  "deliveryNoteIssued",
  "shipmentAuthorized",
] as const;
type ShipmentStage = (typeof SHIPMENT_STAGES)[number];

function shipmentStageLabel(
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Record<ShipmentStage, string> {
  return {
    shelved: tr("production.finalInspectionActions.shelvedBy"),
    deliveryNoteIssued: tr(
      "production.finalInspectionActions.deliveryNoteIssuedBy",
    ),
    shipmentAuthorized: tr(
      "production.finalInspectionActions.shipmentAuthorizedBy",
    ),
  };
}

/**
 * 出荷前チェーン（棚包→納品書発行→出荷許可）— 紙の記入順のまま、
 * 前段が済むまで次段は記録できない。
 */
export async function advanceShipmentStage(
  workOrderNumber: number,
  stage: ShipmentStage,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const denied = await deniedPermission();
  if (denied) return denied;
  const stageIndex = SHIPMENT_STAGES.indexOf(stage);
  if (stageIndex < 0)
    return actionError(tr("production.finalInspectionActions.invalidStage"));
  const workOrderId = await findWorkOrderId(workOrderNumber);
  if (!workOrderId)
    return actionError(tr("production.finalInspectionActions.woNotFound"));
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
    const labels = shipmentStageLabel(tr);
    if (stampedAt[stage] != null) {
      return actionError(
        tr("production.finalInspectionActions.stageAlreadyRecorded", {
          label: labels[stage],
        }),
      );
    }
    const priorStage = SHIPMENT_STAGES[stageIndex - 1];
    if (priorStage && stampedAt[priorStage] == null) {
      return actionError(
        tr("production.finalInspectionActions.recordPriorStageFirst", {
          label: labels[priorStage],
        }),
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
      after: {
        note: tr("production.finalInspectionActions.stageRecordedNote", {
          label: labels[stage],
        }),
      },
    });
    revalidate(workOrderNumber);
    return actionOk();
  } catch (e) {
    console.error("advanceShipmentStage failed", e);
    return actionError(
      tr("production.finalInspectionActions.shipmentStageSaveFailed"),
    );
  }
}

/** 出荷時不良内容確認者印（任意メモ + 確認スタンプ）。 */
export async function recordShipDefectReview(
  workOrderNumber: number,
  notes: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const denied = await deniedPermission();
  if (denied) return denied;
  const workOrderId = await findWorkOrderId(workOrderNumber);
  if (!workOrderId)
    return actionError(tr("production.finalInspectionActions.woNotFound"));
  const parsed = z.string().max(2000).safeParse(notes);
  if (!parsed.success) return actionError(tr("common.invalidInput"));
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
      after: {
        note: tr("production.finalInspectionActions.shipDefectReviewedNote"),
      },
    });
    revalidate(workOrderNumber);
    return actionOk();
  } catch (e) {
    console.error("recordShipDefectReview failed", e);
    return actionError(
      tr("production.finalInspectionActions.shipDefectSaveFailed"),
    );
  }
}
