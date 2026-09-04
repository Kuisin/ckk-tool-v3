"use server";

/**
 * Server Actions — 購買依頼 (app.purchase_requests, PU01)。
 *
 * - 採番: nextDocumentNumber("PURCHASE_REQUEST") → PRQ-YYYYMM-NNNNN
 *   （文字列保存、月次リセット）。
 * - 単価・金額は持たない（発注書へ変換した後、発注側で確定する）。
 * - 承認フロー DRAFT→REQUESTED→APPROVED→ORDERED（+REJECTED / CANCELLED）は
 *   素材発注書と同型の row-workflow: 遷移列（at/by）+ history Json + audit。
 *   承認依頼・記録は approval_requests / approval_records へ正規化する
 *   （targetType "purchase_requests" — PD03 横断表示・代理対応）。
 * - REJECTED は DRAFT と同様に編集・再依頼できる（発注書と異なり独立状態）。
 * - convertToPurchaseOrder: APPROVED の依頼から素材発注書（DRAFT）を 1 tx で
 *   生成する。仕入先は変換時に指定、単価は 0 で複写（発注側で入力）。
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
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import {
  checkApprovalDocAccess,
  checkPermission,
  targetPlantsInScope,
} from "@/lib/authz";
import { prisma } from "@/lib/db";
import { nextDocumentNumber } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/purchase/purchase-requests";
const PO_PATH = "/purchase/purchase-orders";
const APPROVALS_PATH = "/general/tasks";

type Tr = Awaited<ReturnType<typeof getTranslations>>;

function revalidate(requestNumber?: string) {
  revalidatePath(BASE_PATH);
  // 承認依頼は承認管理 (PD03) にも横断表示される。
  revalidatePath(APPROVALS_PATH);
  if (requestNumber) {
    revalidatePath(`${BASE_PATH}/${requestNumber}`);
    revalidatePath(`${BASE_PATH}/${requestNumber}/edit`);
  }
}

// ── 入力スキーマ ─────────────────────────────────────────────────────────────

function itemInputSchema(tr: Tr) {
  return z.object({
    materialId: z
      .string()
      .min(1, tr("purchase.purchaseOrderForm.selectMaterial")),
    plantId: z.string().nullable(),
    quantity: z
      .number()
      .positive(tr("purchase.purchaseRequestActions.quantityPositive")),
    unit: z.string().min(1, tr("purchase.purchaseRequestActions.unitRequired")),
    desiredAt: z.string().nullable(),
    notes: z.string().nullable(),
  });
}

function purchaseRequestInputSchema(tr: Tr) {
  return z.object({
    purpose: z.string(),
    notes: z.string(),
    items: z
      .array(itemInputSchema(tr))
      .min(1, tr("common.addAtLeastOneLineItem")),
  });
}

export type PurchaseRequestInput = z.infer<
  ReturnType<typeof purchaseRequestInputSchema>
>;

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

/** 明細入力 → create データ。 */
function buildItemCreates(items: PurchaseRequestInput["items"]) {
  return items.map((it, i) => ({
    materialId: Number(it.materialId),
    plantId: it.plantId ? Number(it.plantId) : null,
    quantity: it.quantity,
    unit: it.unit,
    desiredAt: it.desiredAt ? new Date(it.desiredAt) : null,
    notes: it.notes?.trim() || null,
    sortOrder: i,
  }));
}

/** スコープ判定に要る明細（入荷先拠点だけ）。prior の findUnique に足す。 */
const SCOPE_ITEMS = { items: { select: { plantId: true } } } as const;

/**
 * 対象の依頼がスコープ内か（PLANT = 明細の入荷先拠点 ∪ OWN = 起票者）。
 * 読み取り側（data.ts）と同じ規則 — 見えない行は触れない。
 */
function requestInScope(
  access: Access,
  userId: string,
  row: { createdBy: string | null; items: { plantId: number | null }[] },
): boolean {
  return rowInScope(
    access,
    { plantIds: row.items.map((it) => it.plantId), createdBy: row.createdBy },
    userId,
  );
}

/** 入力明細の入荷先拠点（作成・更新の門 targetPlantsInScope へ渡す）。 */
function payloadPlantIds(
  items: PurchaseRequestInput["items"],
): (number | null)[] {
  return items.map((it) => (it.plantId ? Number(it.plantId) : null));
}

// ── 作成 / 更新 ──────────────────────────────────────────────────────────────

export async function createPurchaseRequest(
  payload: PurchaseRequestInput,
): Promise<ActionResult<{ requestNumber: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("purchase_order", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = purchaseRequestInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  if (
    !targetPlantsInScope(authz.access, authz.userId, payloadPlantIds(v.items))
  ) {
    return actionError(tr("common.scopeDenied"));
  }
  try {
    const actor = await getCurrentActorId();
    const requestNumber = await nextDocumentNumber("PURCHASE_REQUEST");
    const creates = buildItemCreates(v.items);

    await prisma.purchaseRequest.create({
      data: {
        requestNumber,
        status: "DRAFT",
        purpose: v.purpose.trim() || null,
        notes: v.notes.trim() || null,
        createdBy: actor,
        history: toHistoryJson([entry("CREATE", actor)]),
        items: { create: creates },
      },
    });

    await recordAudit({
      action: "CREATE",
      tableName: "purchase_requests",
      recordId: requestNumber,
      after: {
        status: "DRAFT",
        purpose: v.purpose.trim() || null,
        itemCount: creates.length,
      },
    });
    revalidate(requestNumber);
    return actionOk({ requestNumber });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("purchase.purchaseRequestActions.createFailed"),
        tr,
      ),
    );
  }
}

/** 更新 — DRAFT / REJECTED のみ。明細は $transaction で全置換する。 */
export async function updatePurchaseRequest(
  requestNumber: string,
  payload: PurchaseRequestInput,
): Promise<ActionResult<{ requestNumber: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("purchase_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = purchaseRequestInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  if (
    !targetPlantsInScope(authz.access, authz.userId, payloadPlantIds(v.items))
  ) {
    return actionError(tr("common.scopeDenied"));
  }
  try {
    const prior = await prisma.purchaseRequest.findUnique({
      where: { requestNumber },
      include: SCOPE_ITEMS,
    });
    if (!prior)
      return actionError(
        tr("purchase.purchaseRequestActions.targetRequestNotFound"),
      );
    if (!requestInScope(authz.access, authz.userId, prior)) {
      return actionError(tr("common.scopeDenied"));
    }
    if (prior.status !== "DRAFT" && prior.status !== "REJECTED") {
      return actionError(
        tr("purchase.purchaseRequestActions.onlyDraftOrRejectedCanEdit"),
      );
    }
    const actor = await getCurrentActorId();
    const creates = buildItemCreates(v.items);

    await prisma.$transaction(async (tx) => {
      await tx.purchaseRequestItem.deleteMany({
        where: { requestId: prior.id },
      });
      await tx.purchaseRequest.update({
        where: { id: prior.id },
        data: {
          purpose: v.purpose.trim() || null,
          notes: v.notes.trim() || null,
          history: toHistoryJson(
            appendHistory(prior.history, entry("UPDATE", actor)),
          ),
          items: { create: creates },
        },
      });
    });

    await recordAudit({
      action: "UPDATE",
      tableName: "purchase_requests",
      recordId: requestNumber,
      before: { purpose: prior.purpose, notes: prior.notes },
      after: {
        purpose: v.purpose.trim() || null,
        notes: v.notes.trim() || null,
        itemCount: creates.length,
      },
    });
    revalidate(requestNumber);
    return actionOk({ requestNumber });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("purchase.purchaseRequestActions.updateFailed"),
        tr,
      ),
    );
  }
}

// ── 状態遷移（承認フロー） ────────────────────────────────────────────────────

/** 承認依頼 — DRAFT / REJECTED → REQUESTED。 */
export async function requestPurchaseRequestApproval(
  requestNumber: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("purchase_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.purchaseRequest.findUnique({
      where: { requestNumber },
      include: SCOPE_ITEMS,
    });
    if (!prior)
      return actionError(
        tr("purchase.purchaseRequestActions.targetRequestNotFound"),
      );
    if (!requestInScope(authz.access, authz.userId, prior)) {
      return actionError(tr("common.scopeDenied"));
    }
    if (prior.status !== "DRAFT" && prior.status !== "REJECTED") {
      return actionError(
        tr(
          "purchase.purchaseRequestActions.onlyDraftOrRejectedCanRequestApproval",
        ),
      );
    }
    const actor = await getCurrentActorId();
    // フローが無いと依頼を出しても誰も承認できないので、状態を変える前に確かめる
    const flowError = await assertFlowConfigured("purchase_requests");
    if (flowError) return actionError(flowError);
    // 1 段目の承認依頼を**先に**作る（PD03 横断表示・承認記録の紐付け先 +
    // その段の承認グループへの自動通知）。依頼が作れなければ状態は動かさない。
    const started = await startApprovalFlow({
      targetType: "purchase_requests",
      targetId: requestNumber,
    });
    if (!started.ok)
      return actionError(started.error ?? tr("common.approvalRequestFailed"));
    // 状態は「読んだときのまま」のときだけ動かす（同時操作で二重に進めない）。
    const flipped = await prisma.purchaseRequest.updateMany({
      where: { id: prior.id, status: prior.status },
      data: {
        status: "REQUESTED",
        requestedAt: new Date(),
        requestedBy: actor,
        history: toHistoryJson(
          appendHistory(prior.history, entry("REQUEST_APPROVAL", actor)),
        ),
      },
    });
    if (flipped.count === 0) {
      return actionError(tr("purchase.purchaseRequestActions.stateChanged"));
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "purchase_requests",
      recordId: requestNumber,
      before: { status: prior.status },
      after: { status: "REQUESTED" },
    });
    revalidate(requestNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("common.approvalRequestFailed"), tr),
    );
  }
}

/** 承認 — 現在の段に承認を記録し、全段通過で APPROVED。 */
export async function approvePurchaseRequest(
  requestNumber: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  // 権限コード上の APPROVE に加え、承認グループ所属（本人 or 代理）は
  // 引き続き actOnCurrentStep 内で検証する。
  const authz = await checkApprovalDocAccess("purchase_order");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.purchaseRequest.findUnique({
      where: { requestNumber },
      include: SCOPE_ITEMS,
    });
    if (!prior)
      return actionError(
        tr("purchase.purchaseRequestActions.targetRequestNotFound"),
      );
    if (!requestInScope(authz.access, authz.userId, prior)) {
      return actionError(tr("common.scopeDenied"));
    }
    if (prior.status !== "REQUESTED") {
      return actionError(
        tr("purchase.purchaseRequestActions.notPendingApproval"),
      );
    }
    // 承認権限（本人 or 代理）を検証しつつ承認記録を書き、依頼を確定する。
    const acted = await actOnCurrentStep({
      targetType: "purchase_requests",
      targetId: requestNumber,
      action: "APPROVED",
    });
    if (!acted.ok)
      return actionError(acted.error ?? tr("common.noApprovalPermission"));
    const actor = await getCurrentActorId();
    // 全段を通過して初めて APPROVED。途中の段は REQUESTED のまま進む。
    if (!acted.flowCompleted) {
      await recordAudit({
        action: "UPDATE",
        tableName: "purchase_requests",
        recordId: requestNumber,
        after: {
          note: acted.stepClosed
            ? tr("common.approvalNextStep")
            : tr("common.approvalRemainingMembers", {
                count: acted.remaining,
              }),
        },
      });
      revalidate(requestNumber);
      return actionOk();
    }
    const flipped = await prisma.purchaseRequest.updateMany({
      where: { id: prior.id, status: "REQUESTED" },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedBy: actor,
        history: toHistoryJson(
          appendHistory(prior.history, entry("APPROVE", actor)),
        ),
      },
    });
    if (flipped.count === 0) {
      return actionError(tr("purchase.purchaseRequestActions.stateChanged"));
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "purchase_requests",
      recordId: requestNumber,
      before: { status: "REQUESTED" },
      after: { status: "APPROVED" },
    });
    revalidate(requestNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotApprove"), tr));
  }
}

/** 差し戻し — REQUESTED → REJECTED（理由必須）。承認グループのメンバーのみ。 */
export async function rejectPurchaseRequest(
  requestNumber: string,
  reason: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  // 権限コード上の APPROVE に加え、承認グループ所属（本人 or 代理）は
  // 引き続き actOnCurrentStep 内で検証する。
  const authz = await checkApprovalDocAccess("purchase_order");
  if (!authz.ok) return actionError(authz.error);
  const trimmed = reason.trim();
  if (!trimmed) return actionError(tr("common.enterAReasonForSendingIt"));
  try {
    const prior = await prisma.purchaseRequest.findUnique({
      where: { requestNumber },
      include: SCOPE_ITEMS,
    });
    if (!prior)
      return actionError(
        tr("purchase.purchaseRequestActions.targetRequestNotFound"),
      );
    if (!requestInScope(authz.access, authz.userId, prior)) {
      return actionError(tr("common.scopeDenied"));
    }
    if (prior.status !== "REQUESTED") {
      return actionError(
        tr("purchase.purchaseRequestActions.notPendingApproval"),
      );
    }
    // 差し戻しを承認記録として書き、依頼を確定する（権限検証込み）。
    const acted = await actOnCurrentStep({
      targetType: "purchase_requests",
      targetId: requestNumber,
      action: "REJECTED",
      comment: trimmed,
    });
    if (!acted.ok) {
      return actionError(acted.error ?? tr("common.noSendBackPermission"));
    }
    const actor = await getCurrentActorId();
    const flipped = await prisma.purchaseRequest.updateMany({
      where: { id: prior.id, status: "REQUESTED" },
      data: {
        status: "REJECTED",
        history: toHistoryJson(
          appendHistory(prior.history, entry("REJECT", actor, trimmed)),
        ),
      },
    });
    if (flipped.count === 0) {
      return actionError(tr("purchase.purchaseRequestActions.stateChanged"));
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "purchase_requests",
      recordId: requestNumber,
      before: { status: "REQUESTED" },
      after: { status: "REJECTED", rejectReason: trimmed },
    });
    revalidate(requestNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("common.couldNotSendItBack"), tr),
    );
  }
}

/** キャンセル — 変換前（DRAFT / REQUESTED / APPROVED / REJECTED）のみ（理由必須）。 */
export async function cancelPurchaseRequest(
  requestNumber: string,
  reason: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("purchase_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const trimmed = reason.trim();
  if (!trimmed) return actionError(tr("common.enterAReasonForCancelling"));
  try {
    const prior = await prisma.purchaseRequest.findUnique({
      where: { requestNumber },
      include: SCOPE_ITEMS,
    });
    if (!prior)
      return actionError(
        tr("purchase.purchaseRequestActions.targetRequestNotFound"),
      );
    if (!requestInScope(authz.access, authz.userId, prior)) {
      return actionError(tr("common.scopeDenied"));
    }
    if (
      prior.status !== "DRAFT" &&
      prior.status !== "REQUESTED" &&
      prior.status !== "APPROVED" &&
      prior.status !== "REJECTED"
    ) {
      return actionError(
        tr("purchase.purchaseRequestActions.onlyPreConversionCanCancel"),
      );
    }
    const actor = await getCurrentActorId();
    await prisma.$transaction(async (tx) => {
      // 読んだときの状態から動いていなければキャンセル（同時操作で発注書へ
      // 変換済みになったものを取り消さない）。
      const flipped = await tx.purchaseRequest.updateMany({
        where: { id: prior.id, status: prior.status },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledBy: actor,
          cancelReason: trimmed,
          history: toHistoryJson(
            appendHistory(prior.history, entry("CANCEL", actor, trimmed)),
          ),
        },
      });
      if (flipped.count === 0) {
        throw new Error(
          `GUARD:${tr("purchase.purchaseRequestActions.stateChanged")}`,
        );
      }
      // 承認依頼中のキャンセル: 未処理の承認依頼行を取り下げる（記録なしの
      // PENDING 行のみ — PD03 の横断一覧に残さない）。
      await tx.approvalRequest.deleteMany({
        where: {
          targetType: "purchase_requests",
          targetId: requestNumber,
          status: "PENDING",
        },
      });
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "purchase_requests",
      recordId: requestNumber,
      before: { status: prior.status },
      after: { status: "CANCELLED", cancelReason: trimmed },
    });
    revalidate(requestNumber);
    return actionOk();
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("GUARD:")) {
      return actionError(e.message.slice("GUARD:".length));
    }
    return actionError(
      prismaErrorMessage(
        e,
        tr("purchase.purchaseRequestActions.cancelFailed"),
        tr,
      ),
    );
  }
}

// ── 発注書へ変換 ─────────────────────────────────────────────────────────────

/**
 * 発注書へ変換 — APPROVED のみ。1 tx で素材発注書（DRAFT）を生成し、
 * 依頼を ORDERED にして purchase_order_id で紐付ける。
 * 仕入先は変換時に指定（依頼は仕入先を持たない）。単価は 0 で複写し、
 * 金額・発注承認は発注書（PU02）側で確定する。
 */
export async function convertToPurchaseOrder(
  requestNumber: string,
  supplierBpId: string,
): Promise<ActionResult<{ poNumber: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("purchase_order", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  if (!supplierBpId)
    return actionError(tr("purchase.purchaseRequests.selectASupplier"));
  try {
    const prior = await prisma.purchaseRequest.findUnique({
      where: { requestNumber },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    if (!prior)
      return actionError(
        tr("purchase.purchaseRequestActions.targetRequestNotFound"),
      );
    if (!requestInScope(authz.access, authz.userId, prior)) {
      return actionError(tr("common.scopeDenied"));
    }
    if (prior.status !== "APPROVED") {
      return actionError(
        tr("purchase.purchaseRequestActions.onlyApprovedCanConvert"),
      );
    }
    if (prior.items.length === 0) {
      return actionError(
        tr("purchase.purchaseRequestActions.cannotConvertWithoutItems"),
      );
    }
    const actor = await getCurrentActorId();
    const poNumber = await nextDocumentNumber("PURCHASE");
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const po = await tx.materialPurchaseOrder.create({
        data: {
          poNumber,
          supplierBpId,
          status: "DRAFT",
          totalAmount: 0,
          notes: tr("purchase.purchaseRequestActions.createdFromRequest", {
            requestNumber,
          }),
          createdBy: actor,
          history: toHistoryJson([
            entry(
              "CREATE",
              actor,
              tr("purchase.purchaseRequestActions.convertedFromRequest", {
                requestNumber,
              }),
            ),
          ]),
          items: {
            create: prior.items.map((it, i) => ({
              materialId: it.materialId,
              plantId: it.plantId,
              quantity: it.quantity,
              unit: it.unit,
              unitPrice: 0,
              amount: 0,
              expectedAt: it.desiredAt,
              notes: it.notes,
              sortOrder: i,
            })),
          },
        },
        select: { id: true },
      });
      // 依頼が**まだ APPROVED のとき**だけ ORDERED へ。同時に 2 人が変換すると
      // 2 通目はここで 0 件になり、上で作った発注書ごと巻き戻る（発注書の
      // 二重生成を作らない）。
      const flipped = await tx.purchaseRequest.updateMany({
        where: { id: prior.id, status: "APPROVED" },
        data: {
          status: "ORDERED",
          orderedAt: now,
          orderedBy: actor,
          purchaseOrderId: po.id,
          history: toHistoryJson(
            appendHistory(prior.history, entry("CONVERT", actor, poNumber)),
          ),
        },
      });
      if (flipped.count !== 1) {
        throw new Error(
          `GUARD:${tr("purchase.purchaseRequestActions.stateChanged")}`,
        );
      }
    });

    await recordAudit({
      action: "CREATE",
      tableName: "material_purchase_orders",
      recordId: poNumber,
      after: {
        supplierBpId,
        status: "DRAFT",
        sourceRequest: requestNumber,
        itemCount: prior.items.length,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "purchase_requests",
      recordId: requestNumber,
      before: { status: "APPROVED" },
      after: { status: "ORDERED", poNumber },
    });
    revalidate(requestNumber);
    revalidatePath(PO_PATH);
    revalidatePath(`${PO_PATH}/${poNumber}`);
    return actionOk({ poNumber });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("GUARD:")) {
      return actionError(e.message.slice("GUARD:".length));
    }
    return actionError(
      prismaErrorMessage(
        e,
        tr("purchase.purchaseRequestActions.convertFailed"),
        tr,
      ),
    );
  }
}
