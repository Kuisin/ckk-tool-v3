"use server";

/**
 * Server Actions — 指示書 (app.work_orders) + 承認フロー (§3〜§6)。
 *
 * - 作成/更新: 工程構成をサーバー側でも validateComposition で検証し、
 *   ブロッカー（AND 不足・排他違反）があれば保存を拒否する。工程の並びは
 *   defaultOrder（カタログ既定順）で採番する。
 * - 採番: 書類番号は allocateDocumentKey("WORK_ORDER_DOC")（WO-YYYYMM-NNNNN
 *   — 月次リセット・表示用）、ロット番号は nextSerialNumber("WORK_ORDER")
 *   （通し連番 — 在庫・QR・業務キー）。注文明細の lot_number が未採番なら
 *   ロット番号を書き込む。
 * - 承認: approval_status + 遷移列 + history Json（MaterialPurchaseOrder と
 *   同型の row-workflow）を維持しつつ、承認依頼・記録を approval_requests /
 *   approval_records へ正規化する（§6 本実装 — PD03 横断表示・代理対応）。
 *   承認可否は actOnApprovalRequest 内で判定（本人メンバー or 有効期間内の代理）。
 */

import { type Access, rowInScope } from "@ckk/authz-core";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
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
import { checkApprovalDocAccess, checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import {
  type DesignFileRole,
  resolveSeriesCustomer,
} from "@/lib/design-files-core";
import { formatDocNumber, orderLineNumberOf } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { allocateDocumentKey, nextSerialNumber } from "@/lib/numbering";
import {
  fetchRouteVersionSteps,
  listProductRoutes,
  resolveRouteVersionTx,
} from "@/lib/product-routes";
import type { RouteStepSnapshot, RouteView } from "@/lib/product-routes-core";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { effectiveAllocatedByLine } from "@/lib/work-order-alloc";
import {
  type AllocationInput,
  type LineAllocInfo,
  remainingAllocatable,
  validateAllocations,
} from "@/lib/work-order-alloc-core";
import {
  acknowledgeFlowChange,
  applyApprovedFlowChange,
  closeFlowChange,
} from "@/lib/work-order-flow-changes";
import {
  addWorkOrderLink as addWoLink,
  removeWorkOrderLink as removeWoLink,
} from "@/lib/work-order-links";
import { type OrderedStepCreate, validateAndOrderSteps } from "@/lib/workflow";
import { fetchOrderLineRef, type OrderLineRef } from "./data";

const BASE_PATH = "/production/work-orders";
const APPROVALS_PATH = "/general/tasks";

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

function revalidate(workOrderNumber?: number, docNumber?: string | null) {
  revalidatePath(BASE_PATH);
  revalidatePath(APPROVALS_PATH);
  if (workOrderNumber != null) {
    revalidatePath(`${BASE_PATH}/${workOrderNumber}`);
    revalidatePath(`${BASE_PATH}/${workOrderNumber}/edit`);
  }
  // 書類番号の URL でも同じページが出る（両形式を受ける）ため両方を再検証
  if (docNumber) {
    revalidatePath(`${BASE_PATH}/${docNumber}`);
    revalidatePath(`${BASE_PATH}/${docNumber}/edit`);
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
  // ロット入力の上書き（null/未指定 = 工程マスタの既定を継承）
  lotInputMode: z.enum(["REQUIRED", "OPTIONAL", "NONE"]).nullable().optional(),
  // 検査工程で使う検査表テンプレート（工程単位の割当。検査工程以外は無視）
  inspectionTemplateIds: z.array(z.number().int().positive()).default([]),
});

// 工程ルート（工程リスト）の出所指定 — 指示書は常に工程リストに基づく。
// existing = 既存ルートのバージョンを基準にした構成（変更があれば新バージョン
// として自動保存）/ new = 新ルート v1 として保存。使用済みバージョンは
// 不変（変更は常に新バージョン作成 — resolveRouteVersionTx）。
function routeInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.union(
    [
      z.object({
        mode: z.literal("existing"),
        routeId: z.number().int().positive(),
        baseVersionId: z.string().uuid(),
      }),
      z.object({
        mode: z.literal("new"),
        name: z.string().trim().min(1),
        // 対象の受注元（取引先）。null/未指定 = 汎用ルート。
        customerBpId: z.string().uuid().nullable().optional(),
      }),
    ],
    { message: tr("production.workOrderActions.selectOrCreateRoute") },
  );
}

// allocations = 指示書に割り当てる注文明細（m:n — 分割・統合の両方に対応）。
// 空配列は在庫向けの独立指示書（在庫積み増し）。type は MANUFACTURE のみ・
// 製品を直接指定する。顧客注文分（FROM_STOCK 含む）は常に割当を持つ。
function allocationInputSchema(
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
  return z.object({
    orderLineId: z.string().min(1),
    quantity: z
      .number()
      .int()
      .min(
        1,
        tr("production.workOrderActions.allocationQuantityMustBeAtLeastOne"),
      ),
  });
}

// 作成時の作業計画（工程 × 担当者 × 計画日）。指示書と同時に
// work_order_step_plans を作る — 担当は指示書ごとに違うため、工程リストと
// 違ってルートには保存しない。編集（updateWorkOrder）では無視する（計画の
// 追加・削除は工程実行画面の計画パネルで行う）。
function planInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    processStepId: z.number().int().positive(),
    userId: z.string().min(1),
    /** 計画日（YYYY-MM-DD, JST）。 */
    date: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        tr("production.workOrderActions.invalidPlanDate"),
      ),
  });
}

function workOrderInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z
    .object({
      allocations: z.array(allocationInputSchema(tr)),
      productId: z.number().int().positive().nullable(),
      type: z.enum(["FROM_STOCK", "MANUFACTURE"]),
      plannedQuantity: z
        .number()
        .int()
        .min(
          1,
          tr("production.workOrderActions.plannedQuantityMustBeAtLeastOne"),
        ),
      materialId: z.number().int().positive().nullable(),
      storageLocationId: z.number().int().positive().nullable(),
      /** 使用する図面の版（任意）。null = 固定しない（そのつど最新を引く）。 */
      designFileId: z.string().uuid().nullable().optional(),
      notes: z.string(),
      steps: z
        .array(stepInput)
        .min(1, tr("production.workOrderActions.selectAtLeastOneStep")),
      // 製造分は必須。在庫分（FROM_STOCK）は固定構成のため工程リストを使わない。
      route: routeInputSchema(tr).nullable(),
      plans: z.array(planInputSchema(tr)),
    })
    .superRefine((v, refCtx) => {
      if (v.type !== "FROM_STOCK" && v.route == null) {
        refCtx.addIssue({
          code: "custom",
          message: tr("production.workOrderActions.selectOrCreateRoute"),
        });
      }
      if (v.allocations.length === 0) {
        if (v.type !== "MANUFACTURE") {
          refCtx.addIssue({
            code: "custom",
            message: tr(
              "production.workOrderActions.stockOrderMustBeManufacture",
            ),
          });
        }
        if (v.productId == null) {
          refCtx.addIssue({
            code: "custom",
            message: tr(
              "production.workOrderActions.stockOrderRequiresProduct",
            ),
          });
        }
      }
    });
}

export type WorkOrderInput = z.infer<ReturnType<typeof workOrderInputSchema>>;

/**
 * 割当対象の明細現況を集める（他の指示書の割当合計は キャンセル除く・
 * 編集時は自分を除く・**完了済みは実際にできた分だけ** —
 * lib/work-order-alloc effectiveAllocatedByLine）。存在しない id は
 * lines に載らず、検証側で弾かれる。
 */
async function loadLineAllocInfos(
  orderLineIds: string[],
  excludeWorkOrderNumber?: number | null,
): Promise<LineAllocInfo[]> {
  if (orderLineIds.length === 0) return [];
  const [rows, allocated] = await Promise.all([
    prisma.orderLine.findMany({
      where: { id: { in: orderLineIds } },
      select: {
        id: true,
        acceptanceYearMonth: true,
        acceptanceSeq: true,
        branch: true,
        quantity: true,
        productId: true,
        status: true,
      },
    }),
    effectiveAllocatedByLine(orderLineIds, { excludeWorkOrderNumber }),
  ]);
  return rows.map((r) => ({
    orderLineId: r.id,
    number: orderLineNumberOf(r) ?? r.id,
    lineQuantity: r.quantity,
    otherAllocated: allocated.get(r.id) ?? 0,
    productId: r.productId,
    status: r.status,
  }));
}

/**
 * 保存対象の解決: 割当あり = 明細の製品 + 割当検証（work-order-alloc-core）、
 * 割当なし（在庫向け）= 製品を直接検証する。エラー時は文字列を返す。
 */
async function resolveWorkOrderTarget(
  v: WorkOrderInput,
  tr: Awaited<ReturnType<typeof getTranslations>>,
  excludeWorkOrderNumber?: number | null,
): Promise<{ productId: number } | string> {
  if (v.allocations.length > 0) {
    const lines = await loadLineAllocInfos(
      v.allocations.map((a) => a.orderLineId),
      excludeWorkOrderNumber,
    );
    const error = validateAllocations(
      {
        type: v.type,
        plannedQuantity: v.plannedQuantity,
        allocations: v.allocations,
        lines,
      },
      tr,
    );
    if (error) return error;
    // validateAllocations が「全行同一製品・productId 非 null」を保証済み
    const productId = lines.find(
      (l) => l.orderLineId === v.allocations[0].orderLineId,
    )?.productId;
    if (productId == null)
      return tr("production.workOrderActions.orderLineNotFound");
    return { productId };
  }
  const product = await prisma.product.findUnique({
    where: { id: v.productId ?? 0 },
    select: { id: true, isActive: true },
  });
  if (!product) return tr("production.workOrderActions.productNotFound");
  return { productId: product.id };
}

/** 保管場所（任意）の存在・有効チェック。null = 未指定は素通し。 */
/**
 * 固定する図面がその製品のものか。**別製品の版を貼らせない** — 画面では
 * 選べないが、呼び出しが画面からしか来ないとは限らない。
 * 返り値はエラー文字列、問題なければ null。
 */
async function validateDesignFile(
  designFileId: string | null | undefined,
  productId: number,
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Promise<string | null> {
  if (!designFileId) return null;
  const df = await prisma.designFile.findUnique({
    where: { id: designFileId },
    select: { productId: true },
  });
  if (!df) return tr("production.workOrderActions.designFileNotFound");
  if (df.productId !== productId) {
    return tr("production.workOrderActions.designFileWrongProduct");
  }
  return null;
}

async function validateStorageLocation(
  storageLocationId: number | null,
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Promise<string | null> {
  if (storageLocationId == null) return null;
  const loc = await prisma.storageLocation.findUnique({
    where: { id: storageLocationId },
    select: { isActive: true },
  });
  if (!loc || !loc.isActive)
    return tr("production.workOrderActions.storageLocationNotFound");
  return null;
}

/**
 * ロット番号 = 指示書番号。未採番（lot_number = null）の割当明細へ同番号を
 * 書き込む（統合ロットでは複数明細が同じ番号を共有する。既に別ロットを持つ
 * 明細は動かさない — 分割手配の 2 本目以降）。
 */
async function assignLotNumbersTx(
  tx: Prisma.TransactionClient,
  orderLineIds: string[],
  workOrderNumber: number,
): Promise<void> {
  if (orderLineIds.length === 0) return;
  await tx.orderLine.updateMany({
    where: { id: { in: orderLineIds }, lotNumber: null },
    data: { lotNumber: workOrderNumber },
  });
}

/**
 * 共通の工程 create 行 → work_order_steps 行（workHours → planned_work_hours、
 * 検査表はネスト作成で工程に紐付ける）。
 */
function toWorkOrderStepCreates(creates: OrderedStepCreate[]) {
  return creates.map(({ workHours, inspectionTemplateIds, ...s }) => ({
    ...s,
    plannedWorkHours: workHours,
    inspectionTemplates: {
      create: inspectionTemplateIds.map((id) => ({
        inspectionTemplateId: id,
      })),
    },
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
 * ビルダー表示用の明細割当状況（受注数量・手配済・残・引当済在庫）。
 * 検証はサーバー側（create/update の validateAllocations）が最終判定する。
 */
export interface LineAllocStatus {
  orderLineId: string;
  lineQuantity: number;
  /** 他の指示書（キャンセル除く）の割当合計。 */
  otherAllocated: number;
  /** まだ割り当てられる数量（受注数量 − 手配済）。 */
  remaining: number;
  /** この明細へ引当済みの製品在庫（FROM_STOCK の参考値）。 */
  reservedStock: number;
}

// ── 作成 / 更新 / コピー / キャンセル ────────────────────────────────────────

export async function createWorkOrder(
  payload: WorkOrderInput,
): Promise<ActionResult<{ workOrderNumber: number; docNumber: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("work_order", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = workOrderInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const built = await validateAndOrderSteps(v.steps, v.type);
    if (!built.ok) return actionError(built.error);
    const target = await resolveWorkOrderTarget(v, tr);
    if (typeof target === "string") return actionError(target);
    const storageError = await validateStorageLocation(v.storageLocationId, tr);
    if (storageError) return actionError(storageError);
    const { productId } = target;
    const designError = await validateDesignFile(v.designFileId, productId, tr);
    if (designError) return actionError(designError);
    const actor = await getCurrentActorId();
    const workOrderNumber = await nextSerialNumber("WORK_ORDER");
    const docKey = await allocateDocumentKey("WORK_ORDER_DOC");
    const docNumber = formatDocNumber("WOR", docKey);
    const materialId = v.type === "MANUFACTURE" ? v.materialId : null;

    const routeVersionId = await prisma.$transaction(async (tx) => {
      // 工程構成 → ルートバージョン解決（変更があれば新バージョンを自動保存）
      const resolvedRouteVersionId = await resolveRouteVersionTx(
        tx,
        v.type === "FROM_STOCK" ? null : v.route,
        built.creates,
        actor,
        productId,
        tr("production.workOrderActions.routeChangeNoteOnCreate", {
          number: workOrderNumber,
        }),
      );
      const created = await tx.workOrder.create({
        data: {
          workOrderNumber,
          yearMonth: docKey.yearMonth,
          seq: docKey.seq,
          productId,
          type: v.type,
          plannedQuantity: v.plannedQuantity,
          materialId,
          storageLocationId: v.storageLocationId,
          designFileId: v.designFileId ?? null,
          routeVersionId: resolvedRouteVersionId,
          status: "DRAFT",
          approvalStatus: "NONE",
          notes: v.notes.trim() || null,
          createdBy: actor,
          history: toHistoryJson([entry("CREATE", actor)]),
          orderLineLinks: {
            create: v.allocations.map((a, i) => ({
              orderLineId: a.orderLineId,
              quantity: a.quantity,
              sortOrder: i,
            })),
          },
          steps: { create: toWorkOrderStepCreates(built.creates) },
        },
        select: {
          id: true,
          steps: { select: { id: true, processStepId: true } },
        },
      });
      // 作成時の作業計画（工程 × 担当者 × 計画日）。工程 id は作成結果から
      // 引き直す — 選択に無い工程の計画は黙って捨てる（UI 側で作れない形）。
      if (v.plans.length > 0) {
        const stepIdByProcess = new Map(
          created.steps.map((s) => [s.processStepId, s.id]),
        );
        const rows = v.plans.flatMap((p) => {
          const stepId = stepIdByProcess.get(p.processStepId);
          if (!stepId) return [];
          return [
            {
              stepId,
              userId: p.userId,
              plannedDate: new Date(`${p.date}T00:00:00+09:00`),
              createdBy: actor,
            },
          ];
        });
        if (rows.length > 0) {
          await tx.workOrderStepPlan.createMany({ data: rows });
        }
      }
      // ロット番号 = 指示書番号。未採番の割当明細に同番号を採用する
      // （統合ロットでは複数明細が同じロット番号を共有する）。
      await assignLotNumbersTx(
        tx,
        v.allocations.map((a) => a.orderLineId),
        workOrderNumber,
      );
      return resolvedRouteVersionId;
    });

    await recordAudit({
      action: "CREATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: {
        docNumber,
        allocations: v.allocations,
        productId,
        type: v.type,
        plannedQuantity: v.plannedQuantity,
        materialId,
        storageLocationId: v.storageLocationId,
        routeVersionId,
        stepCount: built.creates.length,
        inspectionTemplateCount: built.creates.reduce(
          (n, c) => n + c.inspectionTemplateIds.length,
          0,
        ),
        planCount: v.plans.length,
      },
    });
    revalidate(workOrderNumber, docNumber);
    if (v.route != null) {
      revalidatePath(`/master/products/${productId}`);
    }
    return actionOk({ workOrderNumber, docNumber });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("production.workOrderActions.createFailed"), tr),
    );
  }
}

export async function updateWorkOrder(
  workOrderNumber: number,
  payload: WorkOrderInput,
): Promise<ActionResult<{ workOrderNumber: number; docNumber: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("work_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await workOrderInScope(authz.access, authz.userId, workOrderNumber))) {
    return actionError(tr("common.scopeDenied"));
  }
  const parsed = workOrderInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const prior = await prisma.workOrder.findUnique({
      where: { workOrderNumber },
      include: {
        orderLineLinks: {
          select: { orderLineId: true, quantity: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (!prior)
      return actionError(tr("production.workOrderActions.workOrderNotFound"));
    if (prior.status !== "DRAFT") {
      return actionError(tr("production.workOrderActions.draftOnlyCanEdit"));
    }
    const built = await validateAndOrderSteps(v.steps, v.type);
    if (!built.ok) return actionError(built.error);
    const target = await resolveWorkOrderTarget(v, tr, workOrderNumber);
    if (typeof target === "string") return actionError(target);
    const storageError = await validateStorageLocation(v.storageLocationId, tr);
    if (storageError) return actionError(storageError);
    const { productId } = target;
    const designError = await validateDesignFile(v.designFileId, productId, tr);
    if (designError) return actionError(designError);
    const actor = await getCurrentActorId();
    const materialId = v.type === "MANUFACTURE" ? v.materialId : null;

    const routeVersionId = await prisma.$transaction(async (tx) => {
      const resolvedRouteVersionId = await resolveRouteVersionTx(
        tx,
        v.type === "FROM_STOCK" ? null : v.route,
        built.creates,
        actor,
        productId,
        tr("production.workOrderActions.routeChangeNoteOnUpdate", {
          number: workOrderNumber,
        }),
      );
      // 工程の作り直し — 工程単位の検査表割当は FK CASCADE で一緒に消える
      await tx.workOrderStep.deleteMany({ where: { workOrderId: prior.id } });
      await tx.workOrderOrderLine.deleteMany({
        where: { workOrderId: prior.id },
      });
      await tx.workOrder.update({
        where: { id: prior.id },
        data: {
          productId,
          type: v.type,
          plannedQuantity: v.plannedQuantity,
          materialId,
          storageLocationId: v.storageLocationId,
          designFileId: v.designFileId ?? null,
          routeVersionId: resolvedRouteVersionId,
          notes: v.notes.trim() || null,
          history: toHistoryJson(
            appendHistory(prior.history, entry("UPDATE", actor)),
          ),
          orderLineLinks: {
            create: v.allocations.map((a, i) => ({
              orderLineId: a.orderLineId,
              quantity: a.quantity,
              sortOrder: i,
            })),
          },
          steps: { create: toWorkOrderStepCreates(built.creates) },
        },
      });
      await assignLotNumbersTx(
        tx,
        v.allocations.map((a) => a.orderLineId),
        workOrderNumber,
      );
      return resolvedRouteVersionId;
    });

    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      before: {
        allocations: prior.orderLineLinks,
        type: prior.type,
        plannedQuantity: prior.plannedQuantity,
        materialId: prior.materialId,
        storageLocationId: prior.storageLocationId,
        routeVersionId: prior.routeVersionId,
      },
      after: {
        allocations: v.allocations,
        type: v.type,
        plannedQuantity: v.plannedQuantity,
        materialId,
        storageLocationId: v.storageLocationId,
        routeVersionId,
        stepCount: built.creates.length,
      },
    });
    const docNumber = formatDocNumber("WOR", {
      yearMonth: prior.yearMonth,
      seq: prior.seq,
    });
    revalidate(workOrderNumber, docNumber);
    if (v.route != null) {
      revalidatePath(`/master/products/${productId}`);
    }
    return actionOk({ workOrderNumber, docNumber });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("production.workOrderActions.updateFailed"), tr),
    );
  }
}

/**
 * コピー作成 — 工程・検査表を引き継いだ DRAFT を対象注文明細に作る。
 * source_work_order_id にコピー元を記録する（バージョン警告用）。
 * 対象注文明細が未指定のときは在庫向けの独立指示書としてコピーする
 * （製品はコピー元を引き継ぐ。在庫分 FROM_STOCK は注文明細必須）。
 */
// ── 指示書→指示書リンク（数量受け渡し。例: リブ母材 WO → 製品 WO） ──────────

const woLinkInput = z.object({
  sourceWorkOrderNumber: z.number().int().positive(),
  targetWorkOrderNumber: z.number().int().positive(),
  // null = source 完了時の完成数全量
  quantity: z.number().int().min(1).nullable(),
  notes: z.string().max(500).optional(),
});

export type WorkOrderLinkInput = z.infer<typeof woLinkInput>;

/** 先行指示書リンクの追加（不変条件は lib/work-order-links-core.ts）。 */
export async function addWorkOrderLinkAction(
  input: WorkOrderLinkInput,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("work_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = woLinkInput.safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const result = await addWoLink(v);
    if (!result.ok)
      return actionError(
        result.error ?? tr("production.stepPlanActualPanel.couldNotAdd"),
      );
    revalidate(v.targetWorkOrderNumber);
    revalidate(v.sourceWorkOrderNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("production.workOrderActions.addLinkFailed"),
        tr,
      ),
    );
  }
}

/** 先行指示書リンクの解除。 */
export async function removeWorkOrderLinkAction(
  linkId: string,
  workOrderNumber: number,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("work_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!linkId)
    return actionError(tr("production.workOrderActions.invalidTarget"));
  try {
    const result = await removeWoLink(linkId);
    if (!result.ok)
      return actionError(
        result.error ?? tr("production.workOrderActions.removeFailedFallback"),
      );
    revalidate(workOrderNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("production.workOrderActions.removeLinkFailed"),
        tr,
      ),
    );
  }
}

export async function copyWorkOrder(
  sourceWorkOrderNumber: number,
  targetOrderLineId: string,
): Promise<ActionResult<{ workOrderNumber: number; docNumber: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("work_order", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  if (
    !(await workOrderInScope(authz.access, authz.userId, sourceWorkOrderNumber))
  ) {
    return actionError(tr("common.scopeDenied"));
  }
  try {
    const source = await prisma.workOrder.findUnique({
      where: { workOrderNumber: sourceWorkOrderNumber },
      include: {
        steps: {
          orderBy: { sortOrder: "asc" },
          include: { inspectionTemplates: true },
        },
      },
    });
    if (!source)
      return actionError(tr("production.workOrderActions.copySourceNotFound"));
    if (!targetOrderLineId && source.type === "FROM_STOCK") {
      return actionError(
        tr("production.workOrderActions.stockOrderRequiresOrderLine"),
      );
    }
    // コピー先: 注文明細指定 = その明細の製品 + 割当（受注残の範囲で予定数量
    // まで充当）/ 未指定 = 在庫向け（製品引継ぎ・割当なし）
    let productId = source.productId;
    let allocations: AllocationInput[] = [];
    if (targetOrderLineId) {
      const lines = await loadLineAllocInfos([targetOrderLineId]);
      const line = lines[0];
      if (!line)
        return actionError(tr("production.workOrderActions.orderLineNotFound"));
      const remaining = remainingAllocatable(line);
      if (remaining <= 0) {
        return actionError(
          tr("production.workOrderActions.orderLineFullyAllocated", {
            number: line.number,
          }),
        );
      }
      allocations = [
        {
          orderLineId: targetOrderLineId,
          quantity: Math.min(source.plannedQuantity, remaining),
        },
      ];
      const error = validateAllocations(
        {
          type: source.type,
          plannedQuantity:
            source.type === "FROM_STOCK"
              ? allocations[0].quantity
              : source.plannedQuantity,
          allocations,
          lines,
        },
        tr,
      );
      if (error) return actionError(error);
      if (line.productId == null) {
        return actionError(
          tr("production.workOrderActions.orderLineProductUnresolved"),
        );
      }
      productId = line.productId;
    }
    const actor = await getCurrentActorId();
    const workOrderNumber = await nextSerialNumber("WORK_ORDER");
    const docKey = await allocateDocumentKey("WORK_ORDER_DOC");
    const docNumber = formatDocNumber("WOR", docKey);
    // 在庫分のコピーは割当 = 予定数量の不変条件を保つため、受注残まで縮める
    const plannedQuantity =
      source.type === "FROM_STOCK" && allocations.length > 0
        ? allocations[0].quantity
        : source.plannedQuantity;

    await prisma.$transaction(async (tx) => {
      await tx.workOrder.create({
        data: {
          workOrderNumber,
          yearMonth: docKey.yearMonth,
          seq: docKey.seq,
          orderLineLinks: {
            create: allocations.map((a, i) => ({
              orderLineId: a.orderLineId,
              quantity: a.quantity,
              sortOrder: i,
            })),
          },
          productId,
          type: source.type,
          plannedQuantity,
          materialId: source.materialId,
          storageLocationId: source.storageLocationId,
          status: "DRAFT",
          approvalStatus: "NONE",
          sourceWorkOrderId: source.id,
          routeVersionId: source.routeVersionId,
          notes: source.notes,
          createdBy: actor,
          history: toHistoryJson([
            entry(
              "COPY",
              actor,
              tr("production.workOrderActions.copiedFromNote", {
                number: sourceWorkOrderNumber,
              }),
            ),
          ]),
          steps: {
            create: source.steps.map((s) => ({
              processStepId: s.processStepId,
              sortOrder: s.sortOrder,
              executionLocation: s.executionLocation,
              plantId: s.plantId,
              supplierBpId: s.supplierBpId,
              plannedWorkHours: s.plannedWorkHours,
              // ロット入力の上書きは複写する（lot_text は実績なので複写しない）
              lotInputMode: s.lotInputMode,
              inspectionTemplates: {
                create: s.inspectionTemplates.map((t) => ({
                  inspectionTemplateId: t.inspectionTemplateId,
                })),
              },
            })),
          },
        },
      });
      await assignLotNumbersTx(
        tx,
        allocations.map((a) => a.orderLineId),
        workOrderNumber,
      );
    });

    await recordAudit({
      action: "CREATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: {
        docNumber,
        allocations,
        sourceWorkOrderNumber,
        type: source.type,
        plannedQuantity,
        stepCount: source.steps.length,
      },
    });
    revalidate(workOrderNumber, docNumber);
    revalidate(sourceWorkOrderNumber);
    return actionOk({ workOrderNumber, docNumber });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("production.workOrderActions.copyFailed"), tr),
    );
  }
}

/** キャンセル — DRAFT / PENDING_APPROVAL のみ。注文明細ロックも解除する。 */
export async function cancelWorkOrder(
  workOrderNumber: number,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("work_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await workOrderInScope(authz.access, authz.userId, workOrderNumber))) {
    return actionError(tr("common.scopeDenied"));
  }
  try {
    const prior = await prisma.workOrder.findUnique({
      where: { workOrderNumber },
      include: { orderLineLinks: { select: { orderLineId: true } } },
    });
    if (!prior)
      return actionError(tr("production.workOrderActions.workOrderNotFound"));
    if (prior.status !== "DRAFT" && prior.status !== "PENDING_APPROVAL") {
      return actionError(
        tr("production.workOrderActions.draftOrPendingOnlyCanCancel"),
      );
    }
    const actor = await getCurrentActorId();
    const linkedLineIds = prior.orderLineLinks.map((l) => l.orderLineId);
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
      ...(linkedLineIds.length > 0
        ? [
            prisma.orderLine.updateMany({
              where: { id: { in: linkedLineIds } },
              data: { isLocked: false },
            }),
          ]
        : []),
      // 承認依頼中のキャンセル: 未処理の承認依頼行を取り下げる（記録なしの
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
    return actionError(
      prismaErrorMessage(e, tr("production.workOrderActions.cancelFailed"), tr),
    );
  }
}

// ── 承認フロー（段数は承認設定 MS0B が決める — lib/approvals） ──────────────

/** 承認依頼 — DRAFT → PENDING_APPROVAL / PENDING。注文明細をロックする。 */
export async function requestApproval(
  workOrderNumber: number,
): Promise<ActionResult> {
  const tr = await getTranslations();
  // 依頼者は起票側の操作 — "approve" ではなく "work_order":UPDATE（判断メモ）。
  const authz = await checkPermission("work_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await workOrderInScope(authz.access, authz.userId, workOrderNumber))) {
    return actionError(tr("common.scopeDenied"));
  }
  try {
    const prior = await prisma.workOrder.findUnique({
      where: { workOrderNumber },
      include: { orderLineLinks: { select: { orderLineId: true } } },
    });
    if (!prior)
      return actionError(tr("production.workOrderActions.workOrderNotFound"));
    if (prior.status !== "DRAFT") {
      return actionError(
        tr("production.workOrderActions.draftOnlyCanRequestApproval"),
      );
    }
    // フローが無いと依頼を出しても誰も承認できないので、状態を変える前に確かめる
    const flowError = await assertFlowConfigured("work_orders");
    if (flowError) return actionError(flowError);
    const actor = await getCurrentActorId();
    const now = new Date();
    const linkedLineIds = prior.orderLineLinks.map((l) => l.orderLineId);
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
      ...(linkedLineIds.length > 0
        ? [
            prisma.orderLine.updateMany({
              where: { id: { in: linkedLineIds } },
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
      return actionError(
        started.error ??
          tr("production.workOrderActions.requestApprovalFailed"),
      );
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
    return actionError(
      prismaErrorMessage(
        e,
        tr("production.workOrderActions.requestApprovalFailed"),
        tr,
      ),
    );
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
  const tr = await getTranslations();
  // 権限チェックは追加ゲート — 実体の承認可否（本人/代理）は
  // actOnCurrentStep のグループ所属判定が引き続き行う。
  const authz = await checkApprovalDocAccess("work_order");
  if (!authz.ok) return actionError(authz.error);
  if (!(await workOrderInScope(authz.access, authz.userId, workOrderNumber))) {
    return actionError(tr("common.scopeDenied"));
  }
  try {
    const prior = await prisma.workOrder.findUnique({
      where: { workOrderNumber },
      include: {
        orderLineLinks: {
          select: {
            orderLineId: true,
            orderLine: { select: { status: true } },
          },
        },
      },
    });
    if (!prior)
      return actionError(tr("production.workOrderActions.workOrderNotFound"));
    if (prior.approvalStatus !== "PENDING") {
      return actionError(tr("production.workOrderActions.notPendingApproval"));
    }
    // 承認権限（本人 or 代理）を検証しつつ承認記録を書き、段を進める。
    const acted = await actOnCurrentStep({
      targetType: "work_orders",
      targetId: String(workOrderNumber),
      action: "APPROVED",
    });
    if (!acted.ok)
      return actionError(
        acted.error ??
          tr("production.workOrderActions.approvePermissionDeniedFallback"),
      );

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
                  : tr(
                      "production.workOrderActions.stepRemainingApproversNote",
                      {
                        remaining: acted.remaining,
                      },
                    ),
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
            ? tr("production.workOrderActions.approvedNextStepNote")
            : tr("production.workOrderActions.approvedRemainingNote", {
                remaining: acted.remaining,
              }),
        },
      });
      revalidate(workOrderNumber);
      return actionOk({ remaining: acted.remaining, completed: false });
    }

    // ── 最終承認 — ここから先が指示書を動かす副作用 ──
    const now = new Date();
    const linkedLineIds = prior.orderLineLinks.map((l) => l.orderLineId);
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
      ...(linkedLineIds.length > 0
        ? [
            prisma.orderLine.updateMany({
              where: { id: { in: linkedLineIds } },
              data: { isLocked: false },
            }),
            // 出荷が先行している明細は戻さない（PARTIAL_SHIPPED/SHIPPED 維持）
            prisma.orderLine.updateMany({
              where: {
                id: { in: linkedLineIds },
                status: { in: ["DRAFT", "CONFIRMED"] },
              },
              data: { status: "IN_PRODUCTION" },
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
            notes: tr("production.workOrderActions.materialReserveNote", {
              number: workOrderNumber,
            }),
          });
          await tx.inventoryReservation.create({
            data: {
              inventoryType: "MATERIAL",
              inventoryId: invId,
              workOrderId: prior.id,
              // 割当が 1 明細だけなら明細にも紐付ける（統合ロットは指示書のみ）
              orderLineId: linkedLineIds.length === 1 ? linkedLineIds[0] : null,
              quantity: prior.plannedQuantity,
              status: "RESERVED",
              reservedAt: new Date(),
            },
          });
        });
      } catch (err) {
        console.error(
          tr("production.workOrderActions.materialReserveFailedLog"),
          err,
        );
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
    return actionError(prismaErrorMessage(e, tr("common.couldNotApprove"), tr));
  }
}

/** 差し戻し — PENDING → REJECTED（指示書は DRAFT へ戻す）。 */
export async function rejectWorkOrder(
  workOrderNumber: number,
  reason: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkApprovalDocAccess("work_order");
  if (!authz.ok) return actionError(authz.error);
  const trimmed = reason.trim();
  if (!trimmed) return actionError(tr("common.enterAReasonForSendingIt"));
  if (!(await workOrderInScope(authz.access, authz.userId, workOrderNumber))) {
    return actionError(tr("common.scopeDenied"));
  }
  try {
    const prior = await prisma.workOrder.findUnique({
      where: { workOrderNumber },
      include: { orderLineLinks: { select: { orderLineId: true } } },
    });
    if (!prior)
      return actionError(tr("production.workOrderActions.workOrderNotFound"));
    if (prior.approvalStatus !== "PENDING") {
      return actionError(tr("production.workOrderActions.notPendingApproval"));
    }
    // 現在承認依頼中の段に対して差し戻しを記録する。差し戻しは段数に依らず
    // 1 件でフローを止める。権限（本人 or 代理）の検証は actOnCurrentStep が行う。
    const acted = await actOnCurrentStep({
      targetType: "work_orders",
      targetId: String(workOrderNumber),
      action: "REJECTED",
      comment: trimmed,
    });
    if (!acted.ok) {
      return actionError(
        acted.error ??
          tr("production.workOrderActions.rejectPermissionDeniedFallback"),
      );
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
      ...(prior.orderLineLinks.length > 0
        ? [
            prisma.orderLine.updateMany({
              where: {
                id: { in: prior.orderLineLinks.map((l) => l.orderLineId) },
              },
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
    return actionError(
      prismaErrorMessage(e, tr("common.couldNotSendItBack"), tr),
    );
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

/**
 * 注文明細 → 対象製品の工程ルート一覧（ビルダーのルート選択用）。
 * 明細の受注元（注文請書ヘッダの顧客）も返す — 顧客一致ルートの優先選択と
 * 新規ルート保存時の対象顧客の既定値に使う。
 */
export async function getProductRoutesForOrderLine(
  orderLineId: string,
): Promise<{
  productId: number;
  customerBpId: string | null;
  customerName: string | null;
  routes: RouteView[];
} | null> {
  if (!orderLineId) return null;
  const so = await prisma.orderLine.findUnique({
    where: { id: orderLineId },
    select: {
      productId: true,
      acceptance: {
        select: {
          customerBpId: true,
          customerBp: { select: { name: true } },
        },
      },
    },
  });
  // 確定前の明細（製品未特定）は指示書の対象にならない。
  if (!so || so.productId == null) return null;
  const productId = so.productId;
  const routes = await listProductRoutes(productId);
  return {
    productId,
    customerBpId: so.acceptance.customerBpId,
    customerName: so.acceptance.customerBp
      ? localized(so.acceptance.customerBp.name as LocalizedText | null)
      : null,
    routes: routes.filter((r) => r.isActive),
  };
}

/** 製品直接指定（在庫向け指示書）の工程ルート一覧。 */
export async function getProductRoutesForProduct(productId: number): Promise<{
  productId: number;
  customerBpId: string | null;
  customerName: string | null;
  routes: RouteView[];
} | null> {
  if (!Number.isInteger(productId) || productId <= 0) return null;
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) return null;
  const routes = await listProductRoutes(productId);
  return {
    productId,
    customerBpId: null,
    customerName: null,
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
 * 明細の割当状況（受注数量・手配済・残・引当済在庫）。ビルダーの割当行の
 * 既定値・インライン表示用。検証はサーバー側（create/update）が最終判定する。
 */
export async function getLineAllocStatus(
  orderLineId: string,
  excludeWorkOrderNumber?: number,
): Promise<LineAllocStatus | null> {
  if (!orderLineId) return null;
  const [lines, reservedAgg] = await Promise.all([
    loadLineAllocInfos([orderLineId], excludeWorkOrderNumber),
    prisma.inventoryReservation.aggregate({
      where: {
        orderLineId,
        inventoryType: "PRODUCT",
        status: { in: ["RESERVED", "CONFIRMED"] },
      },
      _sum: { quantity: true },
    }),
  ]);
  const line = lines[0];
  if (!line) return null;
  return {
    orderLineId,
    lineQuantity: line.lineQuantity,
    otherAllocated: line.otherAllocated,
    remaining: remainingAllocatable(line),
    reservedStock: Number(reservedAgg._sum.quantity ?? 0),
  };
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
  const tr = await getTranslations();
  const authz = await checkApprovalDocAccess("work_order");
  if (!authz.ok) return actionError(authz.error);
  const change = await prisma.workOrderFlowChange.findUnique({
    where: { id: flowChangeId },
    select: {
      status: true,
      workOrder: { select: { workOrderNumber: true } },
    },
  });
  if (!change)
    return actionError(tr("production.workOrderActions.flowChangeNotFound"));
  if (change.status !== "PENDING") {
    return actionError(tr("production.workOrderActions.flowChangeNotPending"));
  }
  if (
    !(await workOrderInScope(
      authz.access,
      authz.userId,
      change.workOrder.workOrderNumber,
    ))
  ) {
    return actionError(tr("common.scopeDenied"));
  }
  try {
    const acted = await actOnCurrentStep({
      targetType: "work_order_flow_changes",
      targetId: flowChangeId,
      action: "APPROVED",
    });
    if (!acted.ok)
      return actionError(
        acted.error ??
          tr("production.workOrderActions.approvePermissionDeniedFallback"),
      );

    // まだ途中の段 — 工程は触らない。
    if (!acted.flowCompleted) {
      revalidate(change.workOrder.workOrderNumber);
      return actionOk({ completed: false, applied: false });
    }

    // 最終承認 — ここで初めて工程へ当てる（承認依頼中の間に前提が変わって
    // いれば通常の検証で弾かれ、FAILED として残る）。
    const applied = await applyApprovedFlowChange(flowChangeId);
    revalidate(change.workOrder.workOrderNumber);
    if (!applied.ok) {
      return actionError(
        applied.errors?.join(" / ") ??
          tr("production.workOrderActions.flowChangeApplyFailedFallback"),
      );
    }
    return actionOk({ completed: true, applied: true });
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotApprove"), tr));
  }
}

/**
 * 「差し戻されたが適用済み」の工程フロー変更を確認済みにする（事後承認 POST
 * 専用 — 人が工程を手で直したことの記録。赤アラートを閉じる）。
 */
export async function acknowledgeFlowChangeAction(
  flowChangeId: string,
  workOrderNumber: number,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("work_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!flowChangeId)
    return actionError(tr("production.workOrderActions.invalidTarget"));
  try {
    const done = await acknowledgeFlowChange(flowChangeId);
    if (!done)
      return actionError(
        tr("production.workOrderActions.flowChangeNotFoundMaybeAck"),
      );
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: {
        note: tr("production.workOrderActions.flowChangeAcknowledgedNote"),
      },
    });
    revalidate(workOrderNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("production.workOrderActions.acknowledgeFailed"),
        tr,
      ),
    );
  }
}

/** 工程フロー変更を差し戻す（工程は変わらないまま閉じる）。 */
export async function rejectFlowChange(
  flowChangeId: string,
  reason: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkApprovalDocAccess("work_order");
  if (!authz.ok) return actionError(authz.error);
  if (!reason.trim()) return actionError(tr("common.enterAReasonForSendingIt"));
  const change = await prisma.workOrderFlowChange.findUnique({
    where: { id: flowChangeId },
    select: {
      status: true,
      workOrder: { select: { workOrderNumber: true } },
    },
  });
  if (!change)
    return actionError(tr("production.workOrderActions.flowChangeNotFound"));
  if (change.status !== "PENDING") {
    return actionError(tr("production.workOrderActions.flowChangeNotPending"));
  }
  if (
    !(await workOrderInScope(
      authz.access,
      authz.userId,
      change.workOrder.workOrderNumber,
    ))
  ) {
    return actionError(tr("common.scopeDenied"));
  }
  try {
    const acted = await actOnCurrentStep({
      targetType: "work_order_flow_changes",
      targetId: flowChangeId,
      action: "REJECTED",
      comment: reason,
    });
    if (!acted.ok)
      return actionError(
        acted.error ??
          tr("production.workOrderActions.rejectPermissionDeniedFallback"),
      );
    await closeFlowChange(flowChangeId, "REJECTED");
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(change.workOrder.workOrderNumber),
      after: {
        note: tr("production.workOrderActions.flowChangeRejectedNote", {
          reason,
        }),
      },
    });
    revalidate(change.workOrder.workOrderNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("common.couldNotSendItBack"), tr),
    );
  }
}

/**
 * 使用する図面の版を固定する / 固定を解除する。
 *
 * **任意の操作。** 固定しなければ、表示のたびに製品の最新図面（受注元が
 * 一致する系列 → 無ければ汎用）を引く。固定すると、あとから改訂されても
 * 現場が見る図面は変わらない。
 *
 * 固定された版は編集・削除できなくなる（lib/design-files-core
 * canEditDesignFile）— その図面で物を作ったという記録なので、あとから
 * 中身が変わると「何を見て作ったか」が追えなくなる。
 */
export async function setWorkOrderDesignFile(
  workOrderNumber: number,
  designFileId: string | null,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("work_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const wo = await prisma.workOrder.findUnique({
      where: { workOrderNumber },
      select: { id: true, productId: true, yearMonth: true, seq: true },
    });
    if (!wo)
      return actionError(tr("production.workOrderActions.workOrderNotFound"));

    if (designFileId) {
      // 別の製品の図面を貼れないようにする（画面では選べないが、
      // 呼び出しは画面からしか来ないとは限らない）。
      const df = await prisma.designFile.findUnique({
        where: { id: designFileId },
        select: { productId: true, version: true },
      });
      if (!df)
        return actionError(
          tr("production.workOrderActions.designFileNotFound"),
        );
      if (df.productId !== wo.productId) {
        return actionError(
          tr("production.workOrderActions.designFileWrongProduct"),
        );
      }
    }

    await prisma.workOrder.update({
      where: { id: wo.id },
      data: { designFileId },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: {
        note: designFileId
          ? tr("production.workOrderActions.designFilePinnedNote")
          : tr("production.workOrderActions.designFileUnpinnedNote"),
        designFileId,
      },
    });
    revalidate(workOrderNumber, formatDocNumber("WOR", wo));
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("production.workOrderActions.setDesignFileFailed"),
        tr,
      ),
    );
  }
}

/**
 * 製品の設計図の版一覧（指示書ビルダーの「使用する図面」）。
 *
 * 版は (製品 × 受注元) ごとの系列なので、**その指示書の顧客で自動解決した
 * ときに何が使われるか**も一緒に返す。固定しない（null）を選んだときに
 * 何が出るのか判らないと、固定するかどうかを決められない。
 */
export async function getDesignVersionsForProduct(
  productId: number,
  customerBpId: string | null,
): Promise<{
  options: { value: string; label: string }[];
  /** 固定しない場合に使われる版の説明（無ければ null）。 */
  autoLabel: string | null;
}> {
  const tr = await getTranslations();
  const authz = await checkPermission("work_order", "READ");
  if (!authz.ok || !Number.isInteger(productId) || productId <= 0) {
    return { options: [], autoLabel: null };
  }
  const rows = await prisma.designFile.findMany({
    where: { productId, role: { in: ["PREVIEW", "BLUEPRINT"] } },
    select: {
      id: true,
      version: true,
      isLatest: true,
      role: true,
      customerBpId: true,
      designRequestId: true,
      file: { select: { filename: true } },
      customerBp: { select: { name: true } },
    },
    orderBy: [{ version: "desc" }, { role: "asc" }],
    take: 200,
  });

  const seriesName = (r: (typeof rows)[number]) =>
    r.customerBpId == null
      ? tr("common.generic")
      : localized(r.customerBp?.name as LocalizedText | null) ||
        tr("common.orderingCustomer");

  // 自動解決の結果（詳細画面と同じ規則を通す）。
  const series = resolveSeriesCustomer(
    rows.map((r) => ({
      id: r.id,
      version: r.version,
      isLatest: r.isLatest,
      role: r.role as DesignFileRole,
      customerBpId: r.customerBpId,
      designRequestId: r.designRequestId,
    })),
    customerBpId,
  );
  const auto =
    series === undefined
      ? null
      : (rows.find((r) => (r.customerBpId ?? null) === series && r.isLatest) ??
        null);

  return {
    // 固定できるのは「図面データ」だけにしない — プレビューを指したい場面も
    // あるので両方出し、どちらか判るようにラベルへ役割を書く。
    options: rows.map((r) => ({
      value: r.id,
      label: `${seriesName(r)} / ${
        r.isLatest
          ? tr("master.productDesignFiles.latestVersionCaption", {
              version: r.version,
            })
          : `v${r.version}`
      } ${r.file.filename}`,
    })),
    autoLabel: auto
      ? `${seriesName(auto)} / ${tr(
          "master.productDesignFiles.latestVersionCaption",
          {
            version: auto.version,
          },
        )}${auto.file.filename}`
      : null,
  };
}
