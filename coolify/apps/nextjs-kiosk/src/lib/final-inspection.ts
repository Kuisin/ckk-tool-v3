/**
 * final-inspection.ts — 最終検査・出荷前確認（旧帳票「■最終検査」欄）の
 * 読み取り + 書き込み。server-only。
 *
 * nextjs-web の final-inspection-actions.ts と同じ業務規則のキオスク版。
 * 記録は **指示書 1 件に 1 行**（work_order_final_inspections）で、記入口は
 * 最終検査工程（process_step_catalog.is_final_inspection）の実行画面だけ。
 * 印の付いた工程を工程リストに入れなければ最終検査は無い（= 任意）。
 *
 * 2 点だけ web と条件が違う（どちらも意図的）:
 * - **進行中の工程でのみ書ける。** キオスクの他の記録（検査記録・不良記録）と
 *   同じ `findRecordableStep` の条件に揃える。web は完了後も書ける — 棚包 →
 *   納品書発行 → 出荷許可は現場の作業セッションより後に事務側で続くため。
 * - **監査ノートは鍵 + パラメータで書く**（encodeInventoryNote）。読む人の
 *   言語で出したいので、書いた瞬間の言語で固定しない。web 側の
 *   inventory-note-labels.ts が `inventoryNote.<key>` を引いて訳す。
 */

import { recordAudit } from "./audit";
import { prisma } from "./db";
import { encodeInventoryNote } from "./inventory-note-core";
import type { StepActionResult, StepErrorCode } from "./step-execution";

const fail = (code: StepErrorCode, ...errors: string[]): StepActionResult => ({
  ok: false,
  codes: [code],
  errors: errors.length > 0 ? errors : undefined,
});

// ── 形 ───────────────────────────────────────────────────────────────────────

/** ■最終検査の 3 項目（文言は帳票固定なので列で持つ）。 */
export const FINAL_CHECK_FIELDS = [
  "drawingLabel",
  "protectiveCap",
  "finishedQuantity",
] as const;
export type FinalCheckField = (typeof FINAL_CHECK_FIELDS)[number];

/** 予備在庫（単純トグル — 確認者スタンプなし）。 */
export const FINAL_SPARE_STOCK_FIELDS = [
  "spareStockUsed",
  "spareStockReceived",
] as const;
export type FinalSpareStockField = (typeof FINAL_SPARE_STOCK_FIELDS)[number];

/** 出荷前チェーン（紙の記入順のまま、前段が済むまで次段は押せない）。 */
export const FINAL_SHIPMENT_STAGES = [
  "shelved",
  "deliveryNoteIssued",
  "shipmentAuthorized",
] as const;
export type FinalShipmentStage = (typeof FINAL_SHIPMENT_STAGES)[number];

/** 確認者スタンプ 1 つぶん（押されていなければ両方 null）。 */
export interface FinalStamp {
  at: string | null;
  byName: string | null;
}

export interface FinalInspectionView {
  drawingLabelOk: boolean | null;
  drawingLabel: FinalStamp;
  protectiveCapOk: boolean | null;
  protectiveCap: FinalStamp;
  finishedQuantityOk: boolean | null;
  finishedQuantity: FinalStamp;
  spareStockUsed: boolean;
  spareStockReceived: boolean;
  shelved: FinalStamp;
  deliveryNoteIssued: FinalStamp;
  shipmentAuthorized: FinalStamp;
  shipDefectReviewed: FinalStamp;
  shipDefectNotes: string | null;
}

/** 一度も操作されていない指示書の見え方（行が無い = 全部未記入）。 */
export const EMPTY_FINAL_INSPECTION: FinalInspectionView = {
  drawingLabelOk: null,
  drawingLabel: { at: null, byName: null },
  protectiveCapOk: null,
  protectiveCap: { at: null, byName: null },
  finishedQuantityOk: null,
  finishedQuantity: { at: null, byName: null },
  spareStockUsed: false,
  spareStockReceived: false,
  shelved: { at: null, byName: null },
  deliveryNoteIssued: { at: null, byName: null },
  shipmentAuthorized: { at: null, byName: null },
  shipDefectReviewed: { at: null, byName: null },
  shipDefectNotes: null,
};

// ── 読み取り ─────────────────────────────────────────────────────────────────

/**
 * 指示書の最終検査行 → 表示用。行がまだ無ければ「全部未記入」を返す
 * （null と空を呼び出し側で分けても意味がない — どちらも記入前）。
 */
export async function getFinalInspection(
  workOrderId: string,
): Promise<FinalInspectionView> {
  const fi = await prisma.workOrderFinalInspection.findUnique({
    where: { workOrderId },
  });
  if (!fi) return EMPTY_FINAL_INSPECTION;

  const ids = [
    fi.drawingLabelCheckedBy,
    fi.protectiveCapCheckedBy,
    fi.finishedQuantityCheckedBy,
    fi.shelvedBy,
    fi.deliveryNoteIssuedBy,
    fi.shipmentAuthorizedBy,
    fi.shipDefectReviewedBy,
  ].filter((id): id is string => id != null);
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: [...new Set(ids)] } },
        select: { id: true, displayName: true },
      })
    : [];
  const stamp = (by: string | null, at: Date | null): FinalStamp => ({
    at: at?.toISOString() ?? null,
    byName: by ? (users.find((u) => u.id === by)?.displayName ?? null) : null,
  });

  return {
    drawingLabelOk: fi.drawingLabelOk,
    drawingLabel: stamp(fi.drawingLabelCheckedBy, fi.drawingLabelCheckedAt),
    protectiveCapOk: fi.protectiveCapOk,
    protectiveCap: stamp(fi.protectiveCapCheckedBy, fi.protectiveCapCheckedAt),
    finishedQuantityOk: fi.finishedQuantityOk,
    finishedQuantity: stamp(
      fi.finishedQuantityCheckedBy,
      fi.finishedQuantityCheckedAt,
    ),
    spareStockUsed: fi.spareStockUsed,
    spareStockReceived: fi.spareStockReceived,
    shelved: stamp(fi.shelvedBy, fi.shelvedAt),
    deliveryNoteIssued: stamp(fi.deliveryNoteIssuedBy, fi.deliveryNoteIssuedAt),
    shipmentAuthorized: stamp(fi.shipmentAuthorizedBy, fi.shipmentAuthorizedAt),
    shipDefectReviewed: stamp(fi.shipDefectReviewedBy, fi.shipDefectReviewedAt),
    shipDefectNotes: fi.shipDefectNotes,
  };
}

// ── 書き込み ─────────────────────────────────────────────────────────────────

/**
 * 書ける工程か: 最終検査工程 + 進行中 + ロックが null か自分。
 * 印の付いていない工程からは書かせない — 画面から辿れない記録が残ると
 * 「この指示書は最終検査をしたのか」が後から読めなくなる。
 */
async function findFinalInspectionStep(stepId: string, actorId: string) {
  const step = await prisma.workOrderStep.findUnique({
    where: { id: stepId },
    select: {
      id: true,
      status: true,
      sessionLockedBy: true,
      workOrderId: true,
      workOrder: { select: { workOrderNumber: true } },
      processStep: { select: { isFinalInspection: true } },
    },
  });
  if (!step) return { error: fail("NOT_FOUND") };
  if (!step.processStep.isFinalInspection) {
    return { error: fail("TEMPLATE_INVALID") };
  }
  if (step.status !== "IN_PROGRESS") return { error: fail("NOT_IN_PROGRESS") };
  if (step.sessionLockedBy && step.sessionLockedBy !== actorId) {
    return { error: fail("LOCK_HELD_BY_OTHER") };
  }
  return { step };
}

/** 監査行 1 件（鍵 + パラメータ — 読む人の言語で訳される）。 */
async function auditNote(
  workOrderNumber: number,
  key: string,
  params?: Record<string, string | number>,
): Promise<void> {
  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(workOrderNumber),
    after: { note: encodeInventoryNote(key, params) },
  });
}

/** ■最終検査の 3 項目（○ / ×。押した人と時刻をスタンプする）。 */
export async function recordFinalCheck(
  stepId: string,
  actorId: string,
  field: FinalCheckField,
  ok: boolean,
): Promise<StepActionResult> {
  if (!FINAL_CHECK_FIELDS.includes(field)) return fail("TEMPLATE_INVALID");
  const found = await findFinalInspectionStep(stepId, actorId);
  if (found.error) return found.error;
  const { step } = found;
  const stamp = {
    [`${field}Ok`]: ok,
    [`${field}CheckedBy`]: actorId,
    [`${field}CheckedAt`]: new Date(),
  };
  await prisma.workOrderFinalInspection.upsert({
    where: { workOrderId: step.workOrderId },
    create: { workOrderId: step.workOrderId, ...stamp },
    update: stamp,
  });
  await auditNote(
    step.workOrder.workOrderNumber,
    `finalInspection${field[0].toUpperCase()}${field.slice(1)}`,
    { mark: ok ? "○" : "×" },
  );
  return { ok: true };
}

/** 予備在庫使用 / 入庫（単純なチェック — スタンプなし）。 */
export async function recordFinalSpareStock(
  stepId: string,
  actorId: string,
  field: FinalSpareStockField,
  value: boolean,
): Promise<StepActionResult> {
  if (!FINAL_SPARE_STOCK_FIELDS.includes(field)) {
    return fail("TEMPLATE_INVALID");
  }
  const found = await findFinalInspectionStep(stepId, actorId);
  if (found.error) return found.error;
  const { step } = found;
  await prisma.workOrderFinalInspection.upsert({
    where: { workOrderId: step.workOrderId },
    create: { workOrderId: step.workOrderId, [field]: value },
    update: { [field]: value },
  });
  await auditNote(
    step.workOrder.workOrderNumber,
    `finalInspection${field[0].toUpperCase()}${field.slice(1)}${
      value ? "On" : "Off"
    }`,
  );
  return { ok: true };
}

/**
 * 出荷前チェーン（棚包 → 納品書発行 → 出荷許可）。
 * 紙の記入順のまま — 前段が済むまで次段は記録できず、記録済みの段は押し直せない。
 */
export async function recordFinalShipmentStage(
  stepId: string,
  actorId: string,
  stage: FinalShipmentStage,
): Promise<StepActionResult> {
  const stageIndex = FINAL_SHIPMENT_STAGES.indexOf(stage);
  if (stageIndex < 0) return fail("TEMPLATE_INVALID");
  const found = await findFinalInspectionStep(stepId, actorId);
  if (found.error) return found.error;
  const { step } = found;

  const existing = await prisma.workOrderFinalInspection.findUnique({
    where: { workOrderId: step.workOrderId },
    select: {
      shelvedAt: true,
      deliveryNoteIssuedAt: true,
      shipmentAuthorizedAt: true,
    },
  });
  const stampedAt: Record<FinalShipmentStage, Date | null> = {
    shelved: existing?.shelvedAt ?? null,
    deliveryNoteIssued: existing?.deliveryNoteIssuedAt ?? null,
    shipmentAuthorized: existing?.shipmentAuthorizedAt ?? null,
  };
  if (stampedAt[stage] != null) return fail("STAGE_ALREADY_RECORDED");
  const prior = FINAL_SHIPMENT_STAGES[stageIndex - 1];
  if (prior && stampedAt[prior] == null) return fail("STAGE_OUT_OF_ORDER");

  const stamp = { [`${stage}By`]: actorId, [`${stage}At`]: new Date() };
  await prisma.workOrderFinalInspection.upsert({
    where: { workOrderId: step.workOrderId },
    create: { workOrderId: step.workOrderId, ...stamp },
    update: stamp,
  });
  await auditNote(
    step.workOrder.workOrderNumber,
    `finalInspection${stage[0].toUpperCase()}${stage.slice(1)}`,
  );
  return { ok: true };
}

/** 出荷時不良内容確認者印（任意メモ + 確認スタンプ）。 */
export async function recordFinalShipDefect(
  stepId: string,
  actorId: string,
  notes: string,
): Promise<StepActionResult> {
  const found = await findFinalInspectionStep(stepId, actorId);
  if (found.error) return found.error;
  const { step } = found;
  const stamp = {
    shipDefectReviewedBy: actorId,
    shipDefectReviewedAt: new Date(),
    shipDefectNotes: notes.trim() || null,
  };
  await prisma.workOrderFinalInspection.upsert({
    where: { workOrderId: step.workOrderId },
    create: { workOrderId: step.workOrderId, ...stamp },
    update: stamp,
  });
  await auditNote(
    step.workOrder.workOrderNumber,
    "finalInspectionShipDefectReviewed",
  );
  return { ok: true };
}
