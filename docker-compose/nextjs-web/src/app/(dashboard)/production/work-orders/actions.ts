"use server";

/**
 * Server Actions — 指示書 (app.work_orders) + 承認フロー (§3〜§6)。
 *
 * - 作成/更新: 工程構成をサーバー側でも validateComposition で検証し、
 *   ブロッカー（AND 不足・排他違反）があれば保存を拒否する。工程の並びは
 *   defaultOrder（カタログ既定順）で採番する。
 * - 採番: nextSerialNumber("WORK_ORDER") — 指示書番号 = ロット番号（通し連番）。
 *   注文明細の lot_number が未採番なら同番号を書き込む。
 * - 承認: approval_status + 遷移列 + history Json（MaterialPurchaseOrder と
 *   同型の row-workflow）を維持しつつ、承認依頼・記録を approval_requests /
 *   approval_records へ正規化する（§6 本実装 — PD03 横断表示・代理対応）。
 *   承認可否は actOnApprovalRequest 内で判定（本人メンバー or 有効期間内の代理）。
 */

import { type Access, rowInScope } from "@ckk/authz-core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  actOnCurrentStep,
  appendHistory,
  assertFlowConfigured,
  type HistoryEntry,
  startApprovalFlow,
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
import {
  applyApprovedFlowChange,
  closeFlowChange,
} from "@/lib/work-order-flow-changes";
import { type OrderedStepCreate, validateAndOrderSteps } from "@/lib/workflow";
import { fetchOrderLineRef, type OrderLineRef } from "./data";

const BASE_PATH = "/production/work-orders";
const APPROVALS_PATH = "/production/approvals";
const SCOPE_DENIED = "この操作の権限がありません（対象範囲外）";

/**
 * 対象指示書がスコープ内か（PLANT = 工程の実施拠点 ∪ OWN = 作成者）。
 * ALL は素通し。不存在は true — 既存の not-found 系エラー処理に委ねる。
 */
async function workOrderInScope(
  access: Access,
  userId: string,
  workOrderNumber: number,
): Promise<boolean> {
  if (access.kind === "ALL") return true;
  const row = await prisma.workOrder.findUnique({
    where: { workOrderNumber },
    select: { createdBy: true, steps: { select: { plantId: true } } },
  });
  if (!row) return true;
  return rowInScope(
    access,
    { plantIds: row.steps.map((s) => s.plantId), createdBy: row.createdBy },
    userId,
  );
}

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

// orderLineId = null は在庫向けの独立指示書（在庫積み増し）。type は
// MANUFACTURE のみ・製品を直接指定する。顧客注文分（FROM_STOCK 含む）は
// 常に注文明細配下。
const workOrderInput = z
  .object({
    orderLineId: z.string().nullable(),
    productId: z.number().int().positive().nullable(),
    type: z.enum(["FROM_STOCK", "MANUFACTURE"]),
    plannedQuantity: z.number().int().min(1, "予定数量は1以上"),
    materialId: z.number().int().positive().nullable(),
    inspectionTemplateIds: z.array(z.number().int().positive()),
    notes: z.string(),
    steps: z.array(stepInput).min(1, "工程を1つ以上選択してください"),
    route: routeInput,
  })
  .superRefine((v, refCtx) => {
    if (!v.orderLineId) {
      if (v.type !== "MANUFACTURE") {
        refCtx.addIssue({
          code: "custom",
          message: "在庫向けの指示書は製造分のみ作成できます",
        });
      }
      if (v.productId == null) {
        refCtx.addIssue({
          code: "custom",
          message: "在庫向けの指示書は対象製品を選択してください",
        });
      }
    }
  });

export type WorkOrderInput = z.infer<typeof workOrderInput>;

/**
 * 保存対象の解決: 注文明細配下は SO の製品 + 在庫フロア検証、在庫向け
 * （orderLineId = null）は製品を直接検証する。エラー時は文字列を返す。
 */
async function resolveWorkOrderTarget(
  v: WorkOrderInput,
  excludeWorkOrderNumber?: number | null,
): Promise<{ productId: number } | string> {
  if (v.orderLineId) {
    const floorInfo = await stockFloorInfo(
      v.orderLineId,
      excludeWorkOrderNumber,
    );
    if (!floorInfo) return "対象の注文明細が見つかりません";
    // §4 在庫考慮: 製造分は「受注数量 − 引当済在庫 − 他の製造指示」以上を要求
    // （不良予備分の上乗せは常に可）。在庫分（FROM_STOCK）は対象外。
    if (v.type === "MANUFACTURE") {
      const floorError = describeFloorError(v.plannedQuantity, floorInfo);
      if (floorError) return floorError;
    }
    return { productId: floorInfo.productId };
  }
  const product = await prisma.product.findUnique({
    where: { id: v.productId ?? 0 },
    select: { id: true, isActive: true },
  });
  if (!product) return "対象の製品が見つかりません";
  return { productId: product.id };
}

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
  orderLineId: string,
  excludeWorkOrderNumber?: number | null,
): Promise<(StockFloorInfo & { productId: number }) | null> {
  const so = await prisma.orderLine.findUnique({
    where: { id: orderLineId },
    select: { quantity: true, productId: true },
  });
  if (!so) return null;
  const [reservedAgg, otherAgg] = await Promise.all([
    prisma.inventoryReservation.aggregate({
      where: {
        orderLineId,
        inventoryType: "PRODUCT",
        status: { in: ["RESERVED", "CONFIRMED"] },
      },
      _sum: { quantity: true },
    }),
    prisma.workOrder.aggregate({
      where: {
        orderLineId,
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
    productId: so.productId as number,
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
    const target = await resolveWorkOrderTarget(v);
    if (typeof target === "string") return actionError(target);
    const { productId } = target;
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
        productId,
        `指示書 #${workOrderNumber} 作成時に変更`,
      );
      await tx.workOrder.create({
        data: {
          workOrderNumber,
          orderLineId: v.orderLineId,
          productId,
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
      // ロット番号 = 指示書番号。注文明細が未採番なら同番号を採用する。
      if (v.orderLineId) {
        const so = await tx.orderLine.findUnique({
          where: { id: v.orderLineId },
          select: { lotNumber: true },
        });
        if (so && so.lotNumber == null) {
          await tx.orderLine.update({
            where: { id: v.orderLineId },
            data: { lotNumber: workOrderNumber },
          });
        }
      }
      return resolvedRouteVersionId;
    });

    await recordAudit({
      action: "CREATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: {
        orderLineId: v.orderLineId,
        productId,
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
      revalidatePath(`/master/products/${productId}`);
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
  if (!(await workOrderInScope(authz.access, authz.userId, workOrderNumber))) {
    return actionError(SCOPE_DENIED);
  }
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
    const target = await resolveWorkOrderTarget(v, workOrderNumber);
    if (typeof target === "string") return actionError(target);
    const { productId } = target;
    const actor = await getCurrentActorId();
    const materialId = v.type === "MANUFACTURE" ? v.materialId : null;

    const routeVersionId = await prisma.$transaction(async (tx) => {
      const resolvedRouteVersionId = await resolveRouteVersionTx(
        tx,
        v.route,
        built.creates,
        actor,
        productId,
        `指示書 #${workOrderNumber} 更新時に変更`,
      );
      await tx.workOrderStep.deleteMany({ where: { workOrderId: prior.id } });
      await tx.workOrderInspectionTemplate.deleteMany({
        where: { workOrderId: prior.id },
      });
      await tx.workOrder.update({
        where: { id: prior.id },
        data: {
          orderLineId: v.orderLineId,
          productId,
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
      if (v.orderLineId) {
        const so = await tx.orderLine.findUnique({
          where: { id: v.orderLineId },
          select: { lotNumber: true },
        });
        if (so && so.lotNumber == null) {
          await tx.orderLine.update({
            where: { id: v.orderLineId },
            data: { lotNumber: workOrderNumber },
          });
        }
      }
      return resolvedRouteVersionId;
    });

    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      before: {
        orderLineId: prior.orderLineId,
        type: prior.type,
        plannedQuantity: prior.plannedQuantity,
        materialId: prior.materialId,
        routeVersionId: prior.routeVersionId,
      },
      after: {
        orderLineId: v.orderLineId,
        type: v.type,
        plannedQuantity: v.plannedQuantity,
        materialId,
        routeVersionId,
        stepCount: built.creates.length,
      },
    });
    revalidate(workOrderNumber);
    if (v.route != null) {
      revalidatePath(`/master/products/${productId}`);
    }
    return actionOk({ workOrderNumber });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "指示書の更新に失敗しました"));
  }
}

/**
 * コピー作成 — 工程・検査表を引き継いだ DRAFT を対象注文明細に作る。
 * source_work_order_id にコピー元を記録する（バージョン警告用）。
 * 対象注文明細が未指定のときは在庫向けの独立指示書としてコピーする
 * （製品はコピー元を引き継ぐ。在庫分 FROM_STOCK は注文明細必須）。
 */
export async function copyWorkOrder(
  sourceWorkOrderNumber: number,
  targetOrderLineId: string,
): Promise<ActionResult<{ workOrderNumber: number }>> {
  const authz = await checkPermission("work_order", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  if (
    !(await workOrderInScope(authz.access, authz.userId, sourceWorkOrderNumber))
  ) {
    return actionError(SCOPE_DENIED);
  }
  try {
    const source = await prisma.workOrder.findUnique({
      where: { workOrderNumber: sourceWorkOrderNumber },
      include: {
        steps: { orderBy: { sortOrder: "asc" } },
        inspectionTemplates: true,
      },
    });
    if (!source) return actionError("コピー元の指示書が見つかりません");
    if (!targetOrderLineId && source.type === "FROM_STOCK") {
      return actionError(
        "在庫分の指示書は注文明細配下でのみ作成できます（対象の注文明細を選択してください）",
      );
    }
    // コピー先: 注文明細指定 = その SO の製品 / 未指定 = 在庫向け（製品引継ぎ）
    let productId = source.productId;
    if (targetOrderLineId) {
      const targetSo = await prisma.orderLine.findUnique({
        where: { id: targetOrderLineId },
        select: { productId: true },
      });
      if (!targetSo) return actionError("対象の注文明細が見つかりません");
      if (targetSo.productId == null) {
        return actionError("製品未特定の注文明細には指示書を作成できません");
      }
      productId = targetSo.productId;
    }
    const actor = await getCurrentActorId();
    const workOrderNumber = await nextSerialNumber("WORK_ORDER");

    await prisma.$transaction(async (tx) => {
      await tx.workOrder.create({
        data: {
          workOrderNumber,
          orderLineId: targetOrderLineId || null,
          productId,
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
      if (targetOrderLineId) {
        const so = await tx.orderLine.findUnique({
          where: { id: targetOrderLineId },
          select: { lotNumber: true },
        });
        if (so && so.lotNumber == null) {
          await tx.orderLine.update({
            where: { id: targetOrderLineId },
            data: { lotNumber: workOrderNumber },
          });
        }
      }
    });

    await recordAudit({
      action: "CREATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: {
        orderLineId: targetOrderLineId,
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

/** キャンセル — DRAFT / PENDING_APPROVAL のみ。注文明細ロックも解除する。 */
export async function cancelWorkOrder(
  workOrderNumber: number,
): Promise<ActionResult> {
  const authz = await checkPermission("work_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await workOrderInScope(authz.access, authz.userId, workOrderNumber))) {
    return actionError(SCOPE_DENIED);
  }
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
      ...(prior.orderLineId
        ? [
            prisma.orderLine.update({
              where: { id: prior.orderLineId },
              data: { isLocked: false },
            }),
          ]
        : []),
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

// ── 承認フロー（段数は承認設定 MS0B が決める — lib/approvals） ──────────────

/** 承認依頼 — DRAFT → PENDING_APPROVAL / PENDING。注文明細をロックする。 */
export async function requestApproval(
  workOrderNumber: number,
): Promise<ActionResult> {
  // 依頼者は起票側の操作 — "approve" ではなく "work_order":UPDATE（判断メモ）。
  const authz = await checkPermission("work_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await workOrderInScope(authz.access, authz.userId, workOrderNumber))) {
    return actionError(SCOPE_DENIED);
  }
  try {
    const prior = await prisma.workOrder.findUnique({
      where: { workOrderNumber },
    });
    if (!prior) return actionError("対象の指示書が見つかりません");
    if (prior.status !== "DRAFT") {
      return actionError("下書きの指示書のみ承認依頼できます");
    }
    // フローが無いと依頼を出しても誰も承認できないので、状態を変える前に確かめる
    const flowError = await assertFlowConfigured("work_orders");
    if (flowError) return actionError(flowError);
    const actor = await getCurrentActorId();
    const now = new Date();
    await prisma.$transaction([
      prisma.workOrder.update({
        where: { id: prior.id },
        data: {
          status: "PENDING_APPROVAL",
          approvalStatus: "PENDING",
          requestedAt: now,
          requestedBy: actor,
          rejectedAt: null,
          rejectedBy: null,
          rejectReason: null,
          history: toHistoryJson(
            appendHistory(prior.history, entry("REQUEST_APPROVAL", actor)),
          ),
        },
      }),
      ...(prior.orderLineId
        ? [
            prisma.orderLine.update({
              where: { id: prior.orderLineId },
              data: { isLocked: true },
            }),
          ]
        : []),
    ]);
    // 1 段目の承認依頼を作る（PD03 横断表示・承認記録の紐付け先）。
    const started = await startApprovalFlow({
      targetType: "work_orders",
      targetId: String(workOrderNumber),
    });
    if (!started.ok)
      return actionError(started.error ?? "承認依頼に失敗しました");
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      before: { status: prior.status, approvalStatus: prior.approvalStatus },
      after: { status: "PENDING_APPROVAL", approvalStatus: "PENDING" },
    });
    revalidate(workOrderNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "承認依頼に失敗しました"));
  }
}

/**
 * 承認 — 現在の段に承認を 1 件記録する。
 *
 * 段数は承認設定（MS0B）で決まるので、この関数は「何段目か」を知らない。
 * 段が閉じてまだ後続があれば次段の依頼はエンジンが同一トランザクションで
 * 作るので、ここは指示書側の副作用（最終承認のときだけ）を足すだけ。
 *
 * ALL 段でまだ全員そろっていないときは stepClosed=false で戻り、指示書の
 * 状態は PENDING のまま据え置く。
 */
export async function approveWorkOrder(
  workOrderNumber: number,
): Promise<ActionResult<{ remaining: number; completed: boolean }>> {
  // 権限チェックは追加ゲート — 実体の承認可否（本人/代理）は
  // actOnCurrentStep のグループ所属判定が引き続き行う。
  const authz = await checkPermission("work_order", "APPROVE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await workOrderInScope(authz.access, authz.userId, workOrderNumber))) {
    return actionError(SCOPE_DENIED);
  }
  try {
    const prior = await prisma.workOrder.findUnique({
      where: { workOrderNumber },
      include: { orderLine: { select: { status: true } } },
    });
    if (!prior) return actionError("対象の指示書が見つかりません");
    if (prior.approvalStatus !== "PENDING") {
      return actionError("承認待ちの指示書ではありません");
    }
    // 承認権限（本人 or 代理）を検証しつつ承認記録を書き、段を進める。
    const acted = await actOnCurrentStep({
      targetType: "work_orders",
      targetId: String(workOrderNumber),
      action: "APPROVED",
    });
    if (!acted.ok) return actionError(acted.error ?? "承認の権限がありません");

    const actor = await getCurrentActorId();

    // まだフローの途中 — 指示書の状態は動かさず履歴だけ足す
    if (!acted.flowCompleted) {
      await prisma.workOrder.update({
        where: { id: prior.id },
        data: {
          history: toHistoryJson(
            appendHistory(
              prior.history,
              entry(
                "APPROVE_STEP",
                actor,
                acted.stepClosed
                  ? undefined
                  : `この段の残り ${acted.remaining} 名`,
              ),
            ),
          ),
        },
      });
      await recordAudit({
        action: "UPDATE",
        tableName: "work_orders",
        recordId: String(workOrderNumber),
        after: {
          note: acted.stepClosed
            ? "承認（次の段へ）"
            : `承認（この段の残り ${acted.remaining} 名）`,
        },
      });
      revalidate(workOrderNumber);
      return actionOk({ remaining: acted.remaining, completed: false });
    }

    // ── 最終承認 — ここから先が指示書を動かす副作用 ──
    const now = new Date();
    const soStatus = prior.orderLine?.status ?? null;
    const moveToProduction = soStatus === "DRAFT" || soStatus === "CONFIRMED";
    await prisma.$transaction([
      prisma.workOrder.update({
        where: { id: prior.id },
        data: {
          status: "APPROVED",
          approvalStatus: "APPROVED",
          approvedAt: now,
          approvedBy: actor,
          history: toHistoryJson(
            appendHistory(prior.history, entry("APPROVE_FINAL", actor)),
          ),
        },
      }),
      ...(prior.orderLineId
        ? [
            prisma.orderLine.update({
              where: { id: prior.orderLineId },
              data: {
                isLocked: false,
                ...(moveToProduction
                  ? { status: "IN_PRODUCTION" as const }
                  : {}),
              },
            }),
          ]
        : []),
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
              orderLineId: prior.orderLineId,
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
      before: { status: prior.status, approvalStatus: "PENDING" },
      after: { status: "APPROVED", approvalStatus: "APPROVED" },
    });
    revalidate(workOrderNumber);
    return actionOk({ remaining: 0, completed: true });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "承認に失敗しました"));
  }
}

/** 差し戻し — PENDING → REJECTED（指示書は DRAFT へ戻す）。 */
export async function rejectWorkOrder(
  workOrderNumber: number,
  reason: string,
): Promise<ActionResult> {
  const authz = await checkPermission("work_order", "APPROVE");
  if (!authz.ok) return actionError(authz.error);
  const trimmed = reason.trim();
  if (!trimmed) return actionError("差し戻し理由を入力してください");
  if (!(await workOrderInScope(authz.access, authz.userId, workOrderNumber))) {
    return actionError(SCOPE_DENIED);
  }
  try {
    const prior = await prisma.workOrder.findUnique({
      where: { workOrderNumber },
    });
    if (!prior) return actionError("対象の指示書が見つかりません");
    if (prior.approvalStatus !== "PENDING") {
      return actionError("承認待ちの指示書ではありません");
    }
    // 現在承認待ちの段に対して差し戻しを記録する。差し戻しは段数に依らず
    // 1 件でフローを止める。権限（本人 or 代理）の検証は actOnCurrentStep が行う。
    const acted = await actOnCurrentStep({
      targetType: "work_orders",
      targetId: String(workOrderNumber),
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
      ...(prior.orderLineId
        ? [
            prisma.orderLine.update({
              where: { id: prior.orderLineId },
              data: { isLocked: false },
            }),
          ]
        : []),
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

/** 注文明細選択時の情報取得（製品・数量表示 + 予定数量の既定値）。 */
export async function getOrderLineInfo(
  orderLineId: string,
): Promise<OrderLineRef | null> {
  if (!orderLineId) return null;
  return fetchOrderLineRef(orderLineId);
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

/** 注文明細 → 対象製品の工程ルート一覧（ビルダーのルート選択用）。 */
export async function getProductRoutesForOrderLine(
  orderLineId: string,
): Promise<{ productId: number; routes: RouteView[] } | null> {
  if (!orderLineId) return null;
  const so = await prisma.orderLine.findUnique({
    where: { id: orderLineId },
    select: { productId: true },
  });
  // 確定前の明細（製品未特定）は指示書の対象にならない。
  if (!so || so.productId == null) return null;
  const productId = so.productId;
  const routes = await listProductRoutes(productId);
  return {
    productId,
    routes: routes.filter((r) => r.isActive),
  };
}

/** 製品直接指定（在庫向け指示書）の工程ルート一覧。 */
export async function getProductRoutesForProduct(
  productId: number,
): Promise<{ productId: number; routes: RouteView[] } | null> {
  if (!Number.isInteger(productId) || productId <= 0) return null;
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) return null;
  const routes = await listProductRoutes(productId);
  return { productId, routes: routes.filter((r) => r.isActive) };
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
  orderLineId: string,
  excludeWorkOrderNumber?: number,
): Promise<StockFloorInfo | null> {
  if (!orderLineId) return null;
  const info = await stockFloorInfo(orderLineId, excludeWorkOrderNumber);
  if (!info) return null;
  const { productId: _productId, ...rest } = info;
  return rest;
}

// ── 工程フロー変更の承認 ─────────────────────────────────────────────────────
//
// 対象は指示書ではなく「保留中の変更」（work_order_flow_changes の id）。
// 段数・承認者は承認設定（MS0B）の「工程フロー変更」フローが決めるので、
// ここは最終承認のときに実際の適用を呼ぶだけ。差し戻しは適用せずに閉じる。

/** 工程フロー変更を承認する。最終承認なら、その場で工程へ適用する。 */
export async function approveFlowChange(
  flowChangeId: string,
): Promise<ActionResult<{ completed: boolean; applied: boolean }>> {
  const authz = await checkPermission("work_order", "APPROVE");
  if (!authz.ok) return actionError(authz.error);
  const change = await prisma.workOrderFlowChange.findUnique({
    where: { id: flowChangeId },
    select: {
      status: true,
      workOrder: { select: { workOrderNumber: true } },
    },
  });
  if (!change) return actionError("対象の変更が見つかりません");
  if (change.status !== "PENDING") {
    return actionError("承認待ちの変更ではありません");
  }
  if (
    !(await workOrderInScope(
      authz.access,
      authz.userId,
      change.workOrder.workOrderNumber,
    ))
  ) {
    return actionError(SCOPE_DENIED);
  }
  try {
    const acted = await actOnCurrentStep({
      targetType: "work_order_flow_changes",
      targetId: flowChangeId,
      action: "APPROVED",
    });
    if (!acted.ok) return actionError(acted.error ?? "承認の権限がありません");

    // まだ途中の段 — 工程は触らない。
    if (!acted.flowCompleted) {
      revalidate(change.workOrder.workOrderNumber);
      return actionOk({ completed: false, applied: false });
    }

    // 最終承認 — ここで初めて工程へ当てる（承認待ちの間に前提が変わって
    // いれば通常の検証で弾かれ、FAILED として残る）。
    const applied = await applyApprovedFlowChange(flowChangeId);
    revalidate(change.workOrder.workOrderNumber);
    if (!applied.ok) {
      return actionError(
        applied.errors?.join(" / ") ?? "変更の適用に失敗しました",
      );
    }
    return actionOk({ completed: true, applied: true });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "承認に失敗しました"));
  }
}

/** 工程フロー変更を差し戻す（工程は変わらないまま閉じる）。 */
export async function rejectFlowChange(
  flowChangeId: string,
  reason: string,
): Promise<ActionResult> {
  const authz = await checkPermission("work_order", "APPROVE");
  if (!authz.ok) return actionError(authz.error);
  if (!reason.trim()) return actionError("差し戻し理由を入力してください");
  const change = await prisma.workOrderFlowChange.findUnique({
    where: { id: flowChangeId },
    select: {
      status: true,
      workOrder: { select: { workOrderNumber: true } },
    },
  });
  if (!change) return actionError("対象の変更が見つかりません");
  if (change.status !== "PENDING") {
    return actionError("承認待ちの変更ではありません");
  }
  if (
    !(await workOrderInScope(
      authz.access,
      authz.userId,
      change.workOrder.workOrderNumber,
    ))
  ) {
    return actionError(SCOPE_DENIED);
  }
  try {
    const acted = await actOnCurrentStep({
      targetType: "work_order_flow_changes",
      targetId: flowChangeId,
      action: "REJECTED",
      comment: reason,
    });
    if (!acted.ok)
      return actionError(acted.error ?? "差し戻しの権限がありません");
    await closeFlowChange(flowChangeId, "REJECTED");
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(change.workOrder.workOrderNumber),
      after: { note: `工程フロー変更を差し戻し（${reason}）` },
    });
    revalidate(change.workOrder.workOrderNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "差し戻しに失敗しました"));
  }
}
