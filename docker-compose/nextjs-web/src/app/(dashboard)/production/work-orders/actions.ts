"use server";

/**
 * Server Actions — 指示書 (app.work_orders) + 承認フロー (§3〜§6)。
 *
 * - 作成/更新: 工程構成をサーバー側でも validateComposition で検証し、
 *   ブロッカー（AND 不足・排他違反）があれば保存を拒否する。工程の並びは
 *   defaultOrder（カタログ既定順）で採番する。
 * - 採番: nextSerialNumber("WORK_ORDER") — 指示書番号 = ロット番号（通し連番）。
 *   受注書の lot_number が未採番なら同番号を書き込む。
 * - 承認: approval_status + 遷移列 + history Json（MaterialPurchaseOrder と
 *   同型の row-workflow）。承認可否は approval_group_members で判定。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { describeIssue } from "@/components/production/work-orders/model";
import { appendHistory, type HistoryEntry, isApprover } from "@/lib/approvals";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { nextSerialNumber } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { loadCatalog } from "@/lib/workflow";
import {
  defaultOrder,
  isBlockingIssue,
  validateComposition,
} from "@/lib/workflow-core";
import { fetchSalesOrderRef, type SalesOrderRef } from "./data";

const BASE_PATH = "/production/work-orders";
const APPROVALS_PATH = "/production/approvals";

function revalidate(workOrderNumber?: number) {
  revalidatePath(BASE_PATH);
  revalidatePath(APPROVALS_PATH);
  if (workOrderNumber != null) {
    revalidatePath(`${BASE_PATH}/${workOrderNumber}`);
    revalidatePath(`${BASE_PATH}/${workOrderNumber}/edit`);
    revalidatePath(`${APPROVALS_PATH}/${workOrderNumber}`);
  }
}

// ── 入力スキーマ ─────────────────────────────────────────────────────────────

const stepInput = z.object({
  processStepId: z.number().int().positive(),
  executionLocation: z.enum(["INTERNAL", "OUTSOURCE"]),
  factoryId: z.number().int().positive().nullable(),
  supplierBpId: z.string().nullable(),
});

const workOrderInput = z.object({
  salesOrderId: z.string().min(1, "受注書を選択してください"),
  type: z.enum(["FROM_STOCK", "MANUFACTURE"]),
  plannedQuantity: z.number().int().min(1, "予定数量は1以上"),
  materialId: z.number().int().positive().nullable(),
  inspectionTemplateIds: z.array(z.number().int().positive()),
  notes: z.string(),
  steps: z.array(stepInput).min(1, "工程を1つ以上選択してください"),
});

export type WorkOrderInput = z.infer<typeof workOrderInput>;

function entry(
  action: string,
  actor: string | null,
  notes?: string,
): HistoryEntry {
  return {
    action,
    user: actor,
    at: new Date().toISOString(),
    ...(notes ? { notes } : {}),
  };
}

/** 履歴エントリ列を Prisma Json 入力型（index signature 付き）へ変換する。 */
function toHistoryJson(list: HistoryEntry[]): Record<string, string | null>[] {
  return list.map((e) => ({
    action: e.action,
    user: e.user,
    at: e.at,
    ...(e.notes ? { notes: e.notes } : {}),
  }));
}

/**
 * 工程構成のサーバー側検証 + 既定順の並び。
 * ブロッカーがあればエラーメッセージ、なければ sortOrder 付きの create 配列。
 */
interface StepCreate {
  processStepId: number;
  sortOrder: number;
  executionLocation: "INTERNAL" | "OUTSOURCE";
  factoryId: number | null;
  supplierBpId: string | null;
}

async function buildSteps(
  v: WorkOrderInput,
): Promise<{ ok: false; error: string } | { ok: true; creates: StepCreate[] }> {
  const catalog = await loadCatalog();
  const ids = v.steps.map((s) => s.processStepId);
  const known = new Set(catalog.steps.map((s) => s.id));
  if (ids.some((id) => !known.has(id))) {
    return { ok: false, error: "存在しない工程が含まれています" };
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "同じ工程が重複しています" };
  }
  const blocking = validateComposition(ids, catalog.useDeps).filter(
    isBlockingIssue,
  );
  if (blocking.length > 0) {
    return {
      ok: false,
      error: blocking.map((i) => describeIssue(i, catalog.steps)).join(" / "),
    };
  }
  const byId = new Map(v.steps.map((s) => [s.processStepId, s]));
  const creates = defaultOrder(ids, catalog.steps).map((stepId, i) => {
    const s = byId.get(stepId);
    if (!s) throw new Error("step mapping failed");
    return {
      processStepId: stepId,
      sortOrder: i,
      executionLocation: s.executionLocation,
      factoryId: s.executionLocation === "INTERNAL" ? s.factoryId : null,
      supplierBpId: s.executionLocation === "OUTSOURCE" ? s.supplierBpId : null,
    };
  });
  return { ok: true, creates };
}

// ── 作成 / 更新 / コピー / キャンセル ────────────────────────────────────────

export async function createWorkOrder(
  payload: WorkOrderInput,
): Promise<ActionResult<{ workOrderNumber: number }>> {
  const parsed = workOrderInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const built = await buildSteps(v);
    if (!built.ok) return actionError(built.error);
    const actor = await getCurrentActorId();
    const workOrderNumber = await nextSerialNumber("WORK_ORDER");
    const materialId = v.type === "MANUFACTURE" ? v.materialId : null;

    await prisma.$transaction(async (tx) => {
      await tx.workOrder.create({
        data: {
          workOrderNumber,
          salesOrderId: v.salesOrderId,
          type: v.type,
          plannedQuantity: v.plannedQuantity,
          materialId,
          status: "DRAFT",
          approvalStatus: "NONE",
          notes: v.notes.trim() || null,
          createdBy: actor,
          history: toHistoryJson([entry("CREATE", actor)]),
          steps: { create: built.creates },
          inspectionTemplates: {
            create: v.inspectionTemplateIds.map((id) => ({
              inspectionTemplateId: id,
            })),
          },
        },
      });
      // ロット番号 = 指示書番号。受注書が未採番なら同番号を採用する。
      const so = await tx.salesOrder.findUnique({
        where: { id: v.salesOrderId },
        select: { lotNumber: true },
      });
      if (so && so.lotNumber == null) {
        await tx.salesOrder.update({
          where: { id: v.salesOrderId },
          data: { lotNumber: workOrderNumber },
        });
      }
    });

    await recordAudit({
      action: "CREATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: {
        salesOrderId: v.salesOrderId,
        type: v.type,
        plannedQuantity: v.plannedQuantity,
        materialId,
        stepCount: built.creates.length,
        inspectionTemplateCount: v.inspectionTemplateIds.length,
      },
    });
    revalidate(workOrderNumber);
    return actionOk({ workOrderNumber });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "指示書の作成に失敗しました"));
  }
}

export async function updateWorkOrder(
  workOrderNumber: number,
  payload: WorkOrderInput,
): Promise<ActionResult<{ workOrderNumber: number }>> {
  const parsed = workOrderInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const prior = await prisma.workOrder.findUnique({
      where: { workOrderNumber },
    });
    if (!prior) return actionError("対象の指示書が見つかりません");
    if (prior.status !== "DRAFT") {
      return actionError("下書きの指示書のみ編集できます");
    }
    const built = await buildSteps(v);
    if (!built.ok) return actionError(built.error);
    const actor = await getCurrentActorId();
    const materialId = v.type === "MANUFACTURE" ? v.materialId : null;

    await prisma.$transaction(async (tx) => {
      await tx.workOrderStep.deleteMany({ where: { workOrderId: prior.id } });
      await tx.workOrderInspectionTemplate.deleteMany({
        where: { workOrderId: prior.id },
      });
      await tx.workOrder.update({
        where: { id: prior.id },
        data: {
          salesOrderId: v.salesOrderId,
          type: v.type,
          plannedQuantity: v.plannedQuantity,
          materialId,
          notes: v.notes.trim() || null,
          history: toHistoryJson(
            appendHistory(prior.history, entry("UPDATE", actor)),
          ),
          steps: { create: built.creates },
          inspectionTemplates: {
            create: v.inspectionTemplateIds.map((id) => ({
              inspectionTemplateId: id,
            })),
          },
        },
      });
      const so = await tx.salesOrder.findUnique({
        where: { id: v.salesOrderId },
        select: { lotNumber: true },
      });
      if (so && so.lotNumber == null) {
        await tx.salesOrder.update({
          where: { id: v.salesOrderId },
          data: { lotNumber: workOrderNumber },
        });
      }
    });

    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      before: {
        salesOrderId: prior.salesOrderId,
        type: prior.type,
        plannedQuantity: prior.plannedQuantity,
        materialId: prior.materialId,
      },
      after: {
        salesOrderId: v.salesOrderId,
        type: v.type,
        plannedQuantity: v.plannedQuantity,
        materialId,
        stepCount: built.creates.length,
      },
    });
    revalidate(workOrderNumber);
    return actionOk({ workOrderNumber });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "指示書の更新に失敗しました"));
  }
}

/**
 * コピー作成 — 工程・検査表を引き継いだ DRAFT を対象受注書に作る。
 * source_work_order_id にコピー元を記録する（バージョン警告用）。
 */
export async function copyWorkOrder(
  sourceWorkOrderNumber: number,
  targetSalesOrderId: string,
): Promise<ActionResult<{ workOrderNumber: number }>> {
  if (!targetSalesOrderId) return actionError("対象の受注書を選択してください");
  try {
    const source = await prisma.workOrder.findUnique({
      where: { workOrderNumber: sourceWorkOrderNumber },
      include: {
        steps: { orderBy: { sortOrder: "asc" } },
        inspectionTemplates: true,
      },
    });
    if (!source) return actionError("コピー元の指示書が見つかりません");
    const actor = await getCurrentActorId();
    const workOrderNumber = await nextSerialNumber("WORK_ORDER");

    await prisma.$transaction(async (tx) => {
      await tx.workOrder.create({
        data: {
          workOrderNumber,
          salesOrderId: targetSalesOrderId,
          type: source.type,
          plannedQuantity: source.plannedQuantity,
          materialId: source.materialId,
          status: "DRAFT",
          approvalStatus: "NONE",
          sourceWorkOrderId: source.id,
          notes: source.notes,
          createdBy: actor,
          history: toHistoryJson([
            entry("COPY", actor, `#${sourceWorkOrderNumber} からコピー`),
          ]),
          steps: {
            create: source.steps.map((s) => ({
              processStepId: s.processStepId,
              sortOrder: s.sortOrder,
              executionLocation: s.executionLocation,
              factoryId: s.factoryId,
              supplierBpId: s.supplierBpId,
            })),
          },
          inspectionTemplates: {
            create: source.inspectionTemplates.map((t) => ({
              inspectionTemplateId: t.inspectionTemplateId,
            })),
          },
        },
      });
      const so = await tx.salesOrder.findUnique({
        where: { id: targetSalesOrderId },
        select: { lotNumber: true },
      });
      if (so && so.lotNumber == null) {
        await tx.salesOrder.update({
          where: { id: targetSalesOrderId },
          data: { lotNumber: workOrderNumber },
        });
      }
    });

    await recordAudit({
      action: "CREATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: {
        salesOrderId: targetSalesOrderId,
        sourceWorkOrderNumber,
        type: source.type,
        plannedQuantity: source.plannedQuantity,
        stepCount: source.steps.length,
      },
    });
    revalidate(workOrderNumber);
    revalidate(sourceWorkOrderNumber);
    return actionOk({ workOrderNumber });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "指示書のコピーに失敗しました"));
  }
}

/** キャンセル — DRAFT / PENDING_APPROVAL のみ。受注書ロックも解除する。 */
export async function cancelWorkOrder(
  workOrderNumber: number,
): Promise<ActionResult> {
  try {
    const prior = await prisma.workOrder.findUnique({
      where: { workOrderNumber },
    });
    if (!prior) return actionError("対象の指示書が見つかりません");
    if (prior.status !== "DRAFT" && prior.status !== "PENDING_APPROVAL") {
      return actionError("下書き・承認待ちの指示書のみキャンセルできます");
    }
    const actor = await getCurrentActorId();
    await prisma.$transaction([
      prisma.workOrder.update({
        where: { id: prior.id },
        data: {
          status: "CANCELLED",
          approvalStatus: "NONE",
          history: toHistoryJson(
            appendHistory(prior.history, entry("CANCEL", actor)),
          ),
        },
      }),
      prisma.salesOrder.update({
        where: { id: prior.salesOrderId },
        data: { isLocked: false },
      }),
    ]);
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      before: { status: prior.status, approvalStatus: prior.approvalStatus },
      after: { status: "CANCELLED", approvalStatus: "NONE" },
    });
    revalidate(workOrderNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "キャンセルに失敗しました"));
  }
}

// ── 承認フロー (§6 簡易版) ───────────────────────────────────────────────────

/** 承認依頼 — DRAFT → PENDING_APPROVAL / PENDING_1ST。受注書をロックする。 */
export async function requestApproval(
  workOrderNumber: number,
): Promise<ActionResult> {
  try {
    const prior = await prisma.workOrder.findUnique({
      where: { workOrderNumber },
    });
    if (!prior) return actionError("対象の指示書が見つかりません");
    if (prior.status !== "DRAFT") {
      return actionError("下書きの指示書のみ承認依頼できます");
    }
    const actor = await getCurrentActorId();
    const now = new Date();
    await prisma.$transaction([
      prisma.workOrder.update({
        where: { id: prior.id },
        data: {
          status: "PENDING_APPROVAL",
          approvalStatus: "PENDING_1ST",
          requested1stAt: now,
          requested1stBy: actor,
          rejectedAt: null,
          rejectedBy: null,
          rejectReason: null,
          history: toHistoryJson(
            appendHistory(prior.history, entry("REQUEST_APPROVAL", actor)),
          ),
        },
      }),
      prisma.salesOrder.update({
        where: { id: prior.salesOrderId },
        data: { isLocked: true },
      }),
    ]);
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      before: { status: prior.status, approvalStatus: prior.approvalStatus },
      after: { status: "PENDING_APPROVAL", approvalStatus: "PENDING_1ST" },
    });
    revalidate(workOrderNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "承認依頼に失敗しました"));
  }
}

/** 第一承認 — PENDING_1ST → (APPROVED_1ST →) PENDING_2ND。 */
export async function approveFirst(
  workOrderNumber: number,
): Promise<ActionResult> {
  try {
    if (!(await isApprover("FIRST"))) {
      return actionError("第一承認の権限がありません");
    }
    const prior = await prisma.workOrder.findUnique({
      where: { workOrderNumber },
    });
    if (!prior) return actionError("対象の指示書が見つかりません");
    if (prior.approvalStatus !== "PENDING_1ST") {
      return actionError("第一承認待ちの指示書ではありません");
    }
    const actor = await getCurrentActorId();
    const now = new Date();
    // 第一承認の完了と同時に第二承認待ちへ（APPROVED_1ST は経過状態）。
    await prisma.workOrder.update({
      where: { id: prior.id },
      data: {
        approvalStatus: "PENDING_2ND",
        approved1stAt: now,
        approved1stBy: actor,
        history: toHistoryJson(
          appendHistory(prior.history, entry("APPROVE_1ST", actor)),
        ),
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      before: { approvalStatus: "PENDING_1ST" },
      after: { approvalStatus: "PENDING_2ND" },
    });
    revalidate(workOrderNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "第一承認に失敗しました"));
  }
}

/**
 * 第二承認 — PENDING_2ND → APPROVED（指示書 status も APPROVED）。
 * 受注書のロックを解除し、DRAFT/CONFIRMED の受注書は IN_PRODUCTION へ進める。
 */
export async function approveSecond(
  workOrderNumber: number,
): Promise<ActionResult> {
  try {
    if (!(await isApprover("SECOND"))) {
      return actionError("第二承認の権限がありません");
    }
    const prior = await prisma.workOrder.findUnique({
      where: { workOrderNumber },
      include: { salesOrder: { select: { status: true } } },
    });
    if (!prior) return actionError("対象の指示書が見つかりません");
    if (prior.approvalStatus !== "PENDING_2ND") {
      return actionError("第二承認待ちの指示書ではありません");
    }
    const actor = await getCurrentActorId();
    const now = new Date();
    const soStatus = prior.salesOrder.status;
    const moveToProduction = soStatus === "DRAFT" || soStatus === "CONFIRMED";
    await prisma.$transaction([
      prisma.workOrder.update({
        where: { id: prior.id },
        data: {
          status: "APPROVED",
          approvalStatus: "APPROVED",
          approved2ndAt: now,
          approved2ndBy: actor,
          approvedAt: now,
          history: toHistoryJson(
            appendHistory(prior.history, entry("APPROVE_2ND", actor)),
          ),
        },
      }),
      prisma.salesOrder.update({
        where: { id: prior.salesOrderId },
        data: {
          isLocked: false,
          ...(moveToProduction ? { status: "IN_PRODUCTION" as const } : {}),
        },
      }),
    ]);
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      before: { status: prior.status, approvalStatus: "PENDING_2ND" },
      after: { status: "APPROVED", approvalStatus: "APPROVED" },
    });
    revalidate(workOrderNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "第二承認に失敗しました"));
  }
}

/** 差し戻し — PENDING_1ST / PENDING_2ND → REJECTED（指示書は DRAFT へ戻す）。 */
export async function rejectWorkOrder(
  workOrderNumber: number,
  reason: string,
): Promise<ActionResult> {
  const trimmed = reason.trim();
  if (!trimmed) return actionError("差し戻し理由を入力してください");
  try {
    const prior = await prisma.workOrder.findUnique({
      where: { workOrderNumber },
    });
    if (!prior) return actionError("対象の指示書が見つかりません");
    if (
      prior.approvalStatus !== "PENDING_1ST" &&
      prior.approvalStatus !== "PENDING_2ND"
    ) {
      return actionError("承認待ちの指示書ではありません");
    }
    const requiredGroup =
      prior.approvalStatus === "PENDING_1ST" ? "FIRST" : "SECOND";
    if (!(await isApprover(requiredGroup))) {
      return actionError("差し戻しの権限がありません");
    }
    const actor = await getCurrentActorId();
    await prisma.$transaction([
      prisma.workOrder.update({
        where: { id: prior.id },
        data: {
          status: "DRAFT",
          approvalStatus: "REJECTED",
          rejectedAt: new Date(),
          rejectedBy: actor,
          rejectReason: trimmed,
          history: toHistoryJson(
            appendHistory(prior.history, entry("REJECT", actor, trimmed)),
          ),
        },
      }),
      prisma.salesOrder.update({
        where: { id: prior.salesOrderId },
        data: { isLocked: false },
      }),
    ]);
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      before: { status: prior.status, approvalStatus: prior.approvalStatus },
      after: {
        status: "DRAFT",
        approvalStatus: "REJECTED",
        rejectReason: trimmed,
      },
    });
    revalidate(workOrderNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "差し戻しに失敗しました"));
  }
}

// ── ビルダー補助 ─────────────────────────────────────────────────────────────

/** 受注書選択時の情報取得（製品・数量表示 + 予定数量の既定値）。 */
export async function getSalesOrderInfo(
  salesOrderId: string,
): Promise<SalesOrderRef | null> {
  if (!salesOrderId) return null;
  return fetchSalesOrderRef(salesOrderId);
}
