"use server";

/**
 * Server Actions — 指示書 (app.work_orders) + 承認フロー (§3〜§6)。
 *
 * - 作成/更新: 工程構成をサーバー側でも validateComposition で検証し、
 *   ブロッカー（AND 不足・排他違反）があれば保存を拒否する。工程の並びは
 *   defaultOrder（カタログ既定順）で採番する。
 * - 採番: nextSerialNumber("WORK_ORDER") — 指示書番号 = ロット番号（通し連番）。
 *   注文請書の lot_number が未採番なら同番号を書き込む。
 * - 承認: approval_status + 遷移列 + history Json（MaterialPurchaseOrder と
 *   同型の row-workflow）を維持しつつ、承認依頼・記録を approval_requests /
 *   approval_records へ正規化する（§6 本実装 — PD03 横断表示・代理対応）。
 *   承認可否は actOnApprovalRequest 内で判定（本人メンバー or 有効期間内の代理）。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  actOnApprovalRequest,
  appendHistory,
  createApprovalRequest,
  type HistoryEntry,
} from "@/lib/approvals";
import { type MaterialAtp, materialAtp } from "@/lib/atp";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { nextSerialNumber } from "@/lib/numbering";
import {
  fetchRouteVersionSteps,
  listProductRoutes,
  resolveRouteVersionTx,
} from "@/lib/product-routes";
import {
  computePlannedFloor,
  type RouteStepSnapshot,
  type RouteView,
  type StockFloorInfo,
} from "@/lib/product-routes-core";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { type OrderedStepCreate, validateAndOrderSteps } from "@/lib/workflow";
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
  plantId: z.number().int().positive().nullable(),
  supplierBpId: z.string().nullable(),
  // 作業時間 (h) — 任意（0.01〜9999.99）
  workHours: z.number().positive().max(9999.99).nullable(),
});

// 工程ルート（工程リスト）の出所指定 — 指示書は常に工程リストに基づく。
// existing = 既存ルートのバージョンを基準にした構成（変更があれば新バージョン
// として自動保存）/ new = 新ルート v1 として保存。使用済みバージョンは
// 不変（変更は常に新バージョン作成 — resolveRouteVersionTx）。
const routeInput = z.union(
  [
    z.object({
      mode: z.literal("existing"),
      routeId: z.number().int().positive(),
      baseVersionId: z.string().uuid(),
    }),
    z.object({
      mode: z.literal("new"),
      name: z.string().trim().min(1),
    }),
  ],
  { message: "工程リストを選択するか、新しい工程リスト名を入力してください" },
);

const workOrderInput = z.object({
  salesOrderId: z.string().min(1, "注文請書を選択してください"),
  type: z.enum(["FROM_STOCK", "MANUFACTURE"]),
  plannedQuantity: z.number().int().min(1, "予定数量は1以上"),
  materialId: z.number().int().positive().nullable(),
  inspectionTemplateIds: z.array(z.number().int().positive()),
  notes: z.string(),
  steps: z.array(stepInput).min(1, "工程を1つ以上選択してください"),
  route: routeInput,
});

export type WorkOrderInput = z.infer<typeof workOrderInput>;

/** 共通の工程 create 行 → work_order_steps 行（workHours → planned_work_hours）。 */
function toWorkOrderStepCreates(creates: OrderedStepCreate[]) {
  return creates.map(({ workHours, ...s }) => ({
    ...s,
    plannedWorkHours: workHours,
  }));
}

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
 * 在庫フロア（§4 在庫考慮）: この受注へ引当済みの製品在庫と、同受注の他の
 * 製造指示の予定数量を差し引いた最低予定数量。編集時は自分自身を除外する。
 */
async function stockFloorInfo(
  salesOrderId: string,
  excludeWorkOrderNumber?: number | null,
): Promise<(StockFloorInfo & { productId: number }) | null> {
  const so = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    select: { quantity: true, productId: true },
  });
  if (!so) return null;
  const [reservedAgg, otherAgg] = await Promise.all([
    prisma.inventoryReservation.aggregate({
      where: {
        salesOrderId,
        inventoryType: "PRODUCT",
        status: { in: ["RESERVED", "CONFIRMED"] },
      },
      _sum: { quantity: true },
    }),
    prisma.workOrder.aggregate({
      where: {
        salesOrderId,
        type: "MANUFACTURE",
        status: { not: "CANCELLED" },
        ...(excludeWorkOrderNumber != null
          ? { workOrderNumber: { not: excludeWorkOrderNumber } }
          : {}),
      },
      _sum: { plannedQuantity: true },
    }),
  ]);
  const reservedForSo = Number(reservedAgg._sum.quantity ?? 0);
  const otherManufacture = otherAgg._sum.plannedQuantity ?? 0;
  return {
    soQuantity: so.quantity,
    reservedForSo,
    otherManufacture,
    floor: computePlannedFloor({
      soQuantity: so.quantity,
      reservedForSo,
      otherManufacture,
    }),
    productId: so.productId,
  };
}

/** 製造分の予定数量が在庫フロアを下回っていればエラーメッセージを返す。 */
function describeFloorError(
  plannedQuantity: number,
  info: StockFloorInfo,
): string | null {
  if (info.floor <= 0 || plannedQuantity >= info.floor) return null;
  return (
    `予定数量が不足しています（受注数量 ${info.soQuantity} − 在庫引当済 ${info.reservedForSo}` +
    (info.otherManufacture > 0
      ? ` − 他の製造指示 ${info.otherManufacture}`
      : "") +
    ` = 最低 ${info.floor}）。不良予備分を含め ${info.floor} 以上で入力してください`
  );
}

// ── 作成 / 更新 / コピー / キャンセル ────────────────────────────────────────

export async function createWorkOrder(
  payload: WorkOrderInput,
): Promise<ActionResult<{ workOrderNumber: number }>> {
  const authz = await checkPermission("work_order", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = workOrderInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const built = await validateAndOrderSteps(v.steps);
    if (!built.ok) return actionError(built.error);
    const floorInfo = await stockFloorInfo(v.salesOrderId);
    if (!floorInfo) return actionError("対象の注文請書が見つかりません");
    // §4 在庫考慮: 製造分は「受注数量 − 引当済在庫 − 他の製造指示」以上を要求
    // （不良予備分の上乗せは常に可）。在庫分（FROM_STOCK）は対象外。
    if (v.type === "MANUFACTURE") {
      const floorError = describeFloorError(v.plannedQuantity, floorInfo);
      if (floorError) return actionError(floorError);
    }
    const actor = await getCurrentActorId();
    const workOrderNumber = await nextSerialNumber("WORK_ORDER");
    const materialId = v.type === "MANUFACTURE" ? v.materialId : null;

    const routeVersionId = await prisma.$transaction(async (tx) => {
      // 工程構成 → ルートバージョン解決（変更があれば新バージョンを自動保存）
      const resolvedRouteVersionId = await resolveRouteVersionTx(
        tx,
        v.route,
        built.creates,
        actor,
        floorInfo.productId,
        `指示書 #${workOrderNumber} 作成時に変更`,
      );
      await tx.workOrder.create({
        data: {
          workOrderNumber,
          salesOrderId: v.salesOrderId,
          type: v.type,
          plannedQuantity: v.plannedQuantity,
          materialId,
          routeVersionId: resolvedRouteVersionId,
          status: "DRAFT",
          approvalStatus: "NONE",
          notes: v.notes.trim() || null,
          createdBy: actor,
          history: toHistoryJson([entry("CREATE", actor)]),
          steps: { create: toWorkOrderStepCreates(built.creates) },
          inspectionTemplates: {
            create: v.inspectionTemplateIds.map((id) => ({
              inspectionTemplateId: id,
            })),
          },
        },
      });
      // ロット番号 = 指示書番号。注文請書が未採番なら同番号を採用する。
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
      return resolvedRouteVersionId;
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
        routeVersionId,
        stepCount: built.creates.length,
        inspectionTemplateCount: v.inspectionTemplateIds.length,
      },
    });
    revalidate(workOrderNumber);
    if (v.route != null) {
      revalidatePath(`/master/products/${floorInfo.productId}`);
    }
    return actionOk({ workOrderNumber });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "指示書の作成に失敗しました"));
  }
}

export async function updateWorkOrder(
  workOrderNumber: number,
  payload: WorkOrderInput,
): Promise<ActionResult<{ workOrderNumber: number }>> {
  const authz = await checkPermission("work_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
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
    const built = await validateAndOrderSteps(v.steps);
    if (!built.ok) return actionError(built.error);
    const floorInfo = await stockFloorInfo(v.salesOrderId, workOrderNumber);
    if (!floorInfo) return actionError("対象の注文請書が見つかりません");
    if (v.type === "MANUFACTURE") {
      const floorError = describeFloorError(v.plannedQuantity, floorInfo);
      if (floorError) return actionError(floorError);
    }
    const actor = await getCurrentActorId();
    const materialId = v.type === "MANUFACTURE" ? v.materialId : null;

    const routeVersionId = await prisma.$transaction(async (tx) => {
      const resolvedRouteVersionId = await resolveRouteVersionTx(
        tx,
        v.route,
        built.creates,
        actor,
        floorInfo.productId,
        `指示書 #${workOrderNumber} 更新時に変更`,
      );
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
          routeVersionId: resolvedRouteVersionId,
          notes: v.notes.trim() || null,
          history: toHistoryJson(
            appendHistory(prior.history, entry("UPDATE", actor)),
          ),
          steps: { create: toWorkOrderStepCreates(built.creates) },
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
      return resolvedRouteVersionId;
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
        routeVersionId: prior.routeVersionId,
      },
      after: {
        salesOrderId: v.salesOrderId,
        type: v.type,
        plannedQuantity: v.plannedQuantity,
        materialId,
        routeVersionId,
        stepCount: built.creates.length,
      },
    });
    revalidate(workOrderNumber);
    if (v.route != null) {
      revalidatePath(`/master/products/${floorInfo.productId}`);
    }
    return actionOk({ workOrderNumber });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "指示書の更新に失敗しました"));
  }
}

/**
 * コピー作成 — 工程・検査表を引き継いだ DRAFT を対象注文請書に作る。
 * source_work_order_id にコピー元を記録する（バージョン警告用）。
 */
export async function copyWorkOrder(
  sourceWorkOrderNumber: number,
  targetSalesOrderId: string,
): Promise<ActionResult<{ workOrderNumber: number }>> {
  const authz = await checkPermission("work_order", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  if (!targetSalesOrderId)
    return actionError("対象の注文請書を選択してください");
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
          routeVersionId: source.routeVersionId,
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
              plantId: s.plantId,
              supplierBpId: s.supplierBpId,
              plannedWorkHours: s.plannedWorkHours,
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

/** キャンセル — DRAFT / PENDING_APPROVAL のみ。注文請書ロックも解除する。 */
export async function cancelWorkOrder(
  workOrderNumber: number,
): Promise<ActionResult> {
  const authz = await checkPermission("work_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
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
      // 承認待ち中のキャンセル: 未処理の承認依頼行を取り下げる（記録なしの
      // PENDING 行のみ — PD03 の横断一覧に残さない）。
      prisma.approvalRequest.deleteMany({
        where: {
          targetType: "work_orders",
          targetId: String(workOrderNumber),
          status: "PENDING",
        },
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

/** 承認依頼 — DRAFT → PENDING_APPROVAL / PENDING_1ST。注文請書をロックする。 */
export async function requestApproval(
  workOrderNumber: number,
): Promise<ActionResult> {
  // 依頼者は起票側の操作 — "approve" ではなく "work_order":UPDATE（判断メモ）。
  const authz = await checkPermission("work_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
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
    // 正規化された承認依頼行（PD03 横断表示・承認記録の紐付け先）。
    await createApprovalRequest({
      targetType: "work_orders",
      targetId: String(workOrderNumber),
      step: "FIRST",
    });
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
  // 権限チェックは追加ゲート — 実体の承認可否（本人/代理）は
  // actOnApprovalRequest のグループ所属判定が引き続き行う。
  const authz = await checkPermission("work_order", "APPROVE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.workOrder.findUnique({
      where: { workOrderNumber },
    });
    if (!prior) return actionError("対象の指示書が見つかりません");
    if (prior.approvalStatus !== "PENDING_1ST") {
      return actionError("第一承認待ちの指示書ではありません");
    }
    // 承認権限（本人 or 代理）を検証しつつ承認記録を書き、依頼を確定する。
    const acted = await actOnApprovalRequest({
      targetType: "work_orders",
      targetId: String(workOrderNumber),
      step: "FIRST",
      groupType: "FIRST",
      action: "APPROVED",
    });
    if (!acted.ok) {
      return actionError(acted.error ?? "第一承認の権限がありません");
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
    // 続けて第二承認の依頼行を作成する。
    await createApprovalRequest({
      targetType: "work_orders",
      targetId: String(workOrderNumber),
      step: "SECOND",
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
 * 注文請書のロックを解除し、DRAFT/CONFIRMED の注文請書は IN_PRODUCTION へ進める。
 */
export async function approveSecond(
  workOrderNumber: number,
): Promise<ActionResult> {
  const authz = await checkPermission("work_order", "APPROVE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.workOrder.findUnique({
      where: { workOrderNumber },
      include: { salesOrder: { select: { status: true } } },
    });
    if (!prior) return actionError("対象の指示書が見つかりません");
    if (prior.approvalStatus !== "PENDING_2ND") {
      return actionError("第二承認待ちの指示書ではありません");
    }
    // 承認権限（本人 or 代理）を検証しつつ承認記録を書き、依頼を確定する。
    const acted = await actOnApprovalRequest({
      targetType: "work_orders",
      targetId: String(workOrderNumber),
      step: "SECOND",
      groupType: "SECOND",
      action: "APPROVED",
    });
    if (!acted.ok) {
      return actionError(acted.error ?? "第二承認の権限がありません");
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
    // 素材予約（監査 P2-1）: 製造分の承認確定で素材需要を RESERVE — ATP に
    // 製造コミットが反映される。予約超過（reserved > on-hand）は仕様
    // （発注判断のシグナル）。best-effort — 承認は既に確定済み。
    if (prior.type === "MANUFACTURE" && prior.materialId != null) {
      try {
        const { ensureMaterialInventory, applyTransaction } = await import(
          "@/lib/inventory"
        );
        const material = await prisma.material.findUnique({
          where: { id: prior.materialId },
          select: { unit: true },
        });
        await prisma.$transaction(async (tx) => {
          const invId = await ensureMaterialInventory(tx, {
            materialId: prior.materialId as number,
            plantId: null,
            unit: material?.unit ?? "本",
          });
          await applyTransaction(tx, {
            inventoryType: "MATERIAL",
            inventoryId: invId,
            transactionType: "RESERVE",
            quantity: prior.plannedQuantity,
            referenceType: "work_order",
            referenceId: prior.id,
            notes: `指示書 #${workOrderNumber} 承認による素材予約`,
          });
          await tx.inventoryReservation.create({
            data: {
              inventoryType: "MATERIAL",
              inventoryId: invId,
              workOrderId: prior.id,
              salesOrderId: prior.salesOrderId,
              quantity: prior.plannedQuantity,
              status: "RESERVED",
              reservedAt: new Date(),
            },
          });
        });
      } catch (err) {
        console.error("[work-order] 素材予約に失敗:", err);
      }
    }
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
  const authz = await checkPermission("work_order", "APPROVE");
  if (!authz.ok) return actionError(authz.error);
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
    // 現在承認待ちの段（FIRST / SECOND）に対して差し戻しを記録する。
    // 権限（本人 or 代理）の検証は actOnApprovalRequest が行う。
    const pendingStep =
      prior.approvalStatus === "PENDING_1ST" ? "FIRST" : "SECOND";
    const acted = await actOnApprovalRequest({
      targetType: "work_orders",
      targetId: String(workOrderNumber),
      step: pendingStep,
      groupType: pendingStep,
      action: "REJECTED",
      comment: trimmed,
    });
    if (!acted.ok) {
      return actionError(acted.error ?? "差し戻しの権限がありません");
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

/** 注文請書選択時の情報取得（製品・数量表示 + 予定数量の既定値）。 */
export async function getSalesOrderInfo(
  salesOrderId: string,
): Promise<SalesOrderRef | null> {
  if (!salesOrderId) return null;
  return fetchSalesOrderRef(salesOrderId);
}

/**
 * 使用素材選択時の ATP 取得（§5 素材判断 — lib/atp materialAtp のラッパ）。
 * ビルダーの充足/不足インライン警告用。警告のみで保存はブロックしない。
 */
export async function getMaterialAtp(
  materialId: number,
): Promise<MaterialAtp | null> {
  if (!Number.isInteger(materialId) || materialId <= 0) return null;
  try {
    return await materialAtp(materialId);
  } catch (e) {
    console.error("getMaterialAtp failed", e);
    return null;
  }
}

/** 注文請書 → 対象製品の工程ルート一覧（ビルダーのルート選択用）。 */
export async function getProductRoutesForSalesOrder(
  salesOrderId: string,
): Promise<{ productId: number; routes: RouteView[] } | null> {
  if (!salesOrderId) return null;
  const so = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    select: { productId: true },
  });
  if (!so) return null;
  const routes = await listProductRoutes(so.productId);
  return {
    productId: so.productId,
    routes: routes.filter((r) => r.isActive),
  };
}

/** ルートバージョンの工程スナップショット（ビルダーのプリフィル・比較基準）。 */
export async function getRouteVersionSteps(
  versionId: string,
): Promise<RouteStepSnapshot[]> {
  if (!versionId) return [];
  return fetchRouteVersionSteps(versionId);
}

/**
 * 在庫フロア情報（§4 在庫考慮 — 製造分の最低予定数量）。ビルダーの表示 +
 * NumberInput min 用。検証はサーバー側（create/update）が最終判定する。
 */
export async function getStockFloorInfo(
  salesOrderId: string,
  excludeWorkOrderNumber?: number,
): Promise<StockFloorInfo | null> {
  if (!salesOrderId) return null;
  const info = await stockFloorInfo(salesOrderId, excludeWorkOrderNumber);
  if (!info) return null;
  const { productId: _productId, ...rest } = info;
  return rest;
}
