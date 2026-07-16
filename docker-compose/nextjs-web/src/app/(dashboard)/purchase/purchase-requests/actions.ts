"use server";

/**
 * Server Actions — 購買依頼 (app.purchase_requests, PU04)。
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

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  actOnApprovalRequest,
  appendHistory,
  createApprovalRequest,
  type HistoryEntry,
} from "@/lib/approvals";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
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
const APPROVALS_PATH = "/production/approvals";

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

const itemInput = z.object({
  materialId: z.string().min(1, "素材を選択してください"),
  factoryId: z.string().nullable(),
  quantity: z.number().positive("数量は0より大きい値"),
  unit: z.string().min(1, "単位を入力してください"),
  desiredAt: z.string().nullable(),
  notes: z.string().nullable(),
});

const purchaseRequestInput = z.object({
  purpose: z.string(),
  notes: z.string(),
  items: z.array(itemInput).min(1, "明細を1件以上追加してください"),
});

export type PurchaseRequestInput = z.infer<typeof purchaseRequestInput>;

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
    factoryId: it.factoryId ? Number(it.factoryId) : null,
    quantity: it.quantity,
    unit: it.unit,
    desiredAt: it.desiredAt ? new Date(it.desiredAt) : null,
    notes: it.notes?.trim() || null,
    sortOrder: i,
  }));
}

// ── 作成 / 更新 ──────────────────────────────────────────────────────────────

export async function createPurchaseRequest(
  payload: PurchaseRequestInput,
): Promise<ActionResult<{ requestNumber: string }>> {
  const authz = await checkPermission("purchase_order", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = purchaseRequestInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
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
    return actionError(prismaErrorMessage(e, "購買依頼の作成に失敗しました"));
  }
}

/** 更新 — DRAFT / REJECTED のみ。明細は $transaction で全置換する。 */
export async function updatePurchaseRequest(
  requestNumber: string,
  payload: PurchaseRequestInput,
): Promise<ActionResult<{ requestNumber: string }>> {
  const authz = await checkPermission("purchase_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = purchaseRequestInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const prior = await prisma.purchaseRequest.findUnique({
      where: { requestNumber },
    });
    if (!prior) return actionError("対象の購買依頼が見つかりません");
    if (prior.status !== "DRAFT" && prior.status !== "REJECTED") {
      return actionError("下書き・差し戻しの購買依頼のみ編集できます");
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
    return actionError(prismaErrorMessage(e, "購買依頼の更新に失敗しました"));
  }
}

// ── 状態遷移（承認フロー） ────────────────────────────────────────────────────

/** 承認依頼 — DRAFT / REJECTED → REQUESTED。 */
export async function requestPurchaseRequestApproval(
  requestNumber: string,
): Promise<ActionResult> {
  const authz = await checkPermission("purchase_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.purchaseRequest.findUnique({
      where: { requestNumber },
    });
    if (!prior) return actionError("対象の購買依頼が見つかりません");
    if (prior.status !== "DRAFT" && prior.status !== "REJECTED") {
      return actionError("下書き・差し戻しの購買依頼のみ承認依頼できます");
    }
    const actor = await getCurrentActorId();
    await prisma.purchaseRequest.update({
      where: { id: prior.id },
      data: {
        status: "REQUESTED",
        requestedAt: new Date(),
        requestedBy: actor,
        history: toHistoryJson(
          appendHistory(prior.history, entry("REQUEST_APPROVAL", actor)),
        ),
      },
    });
    // 正規化された承認依頼行（PD03 横断表示・承認記録の紐付け先 +
    // 第一承認グループへの自動通知）。
    await createApprovalRequest({
      targetType: "purchase_requests",
      targetId: requestNumber,
      step: "FIRST",
    });
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
    return actionError(prismaErrorMessage(e, "承認依頼に失敗しました"));
  }
}

/** 承認 — REQUESTED → APPROVED。第一承認グループのメンバーのみ。 */
export async function approvePurchaseRequest(
  requestNumber: string,
): Promise<ActionResult> {
  // 権限コード上の APPROVE に加え、承認グループ所属（本人 or 代理）は
  // 引き続き actOnApprovalRequest 内で検証する。
  const authz = await checkPermission("purchase_order", "APPROVE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.purchaseRequest.findUnique({
      where: { requestNumber },
    });
    if (!prior) return actionError("対象の購買依頼が見つかりません");
    if (prior.status !== "REQUESTED") {
      return actionError("承認依頼中の購買依頼ではありません");
    }
    // 承認権限（本人 or 代理）を検証しつつ承認記録を書き、依頼を確定する。
    const acted = await actOnApprovalRequest({
      targetType: "purchase_requests",
      targetId: requestNumber,
      step: "FIRST",
      groupType: "FIRST",
      action: "APPROVED",
    });
    if (!acted.ok) return actionError(acted.error ?? "承認の権限がありません");
    const actor = await getCurrentActorId();
    await prisma.purchaseRequest.update({
      where: { id: prior.id },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedBy: actor,
        history: toHistoryJson(
          appendHistory(prior.history, entry("APPROVE", actor)),
        ),
      },
    });
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
    return actionError(prismaErrorMessage(e, "承認に失敗しました"));
  }
}

/** 差し戻し — REQUESTED → REJECTED（理由必須）。承認グループのメンバーのみ。 */
export async function rejectPurchaseRequest(
  requestNumber: string,
  reason: string,
): Promise<ActionResult> {
  // 権限コード上の APPROVE に加え、承認グループ所属（本人 or 代理）は
  // 引き続き actOnApprovalRequest 内で検証する。
  const authz = await checkPermission("purchase_order", "APPROVE");
  if (!authz.ok) return actionError(authz.error);
  const trimmed = reason.trim();
  if (!trimmed) return actionError("差し戻し理由を入力してください");
  try {
    const prior = await prisma.purchaseRequest.findUnique({
      where: { requestNumber },
    });
    if (!prior) return actionError("対象の購買依頼が見つかりません");
    if (prior.status !== "REQUESTED") {
      return actionError("承認依頼中の購買依頼ではありません");
    }
    // 差し戻しを承認記録として書き、依頼を確定する（権限検証込み）。
    const acted = await actOnApprovalRequest({
      targetType: "purchase_requests",
      targetId: requestNumber,
      step: "FIRST",
      groupType: "FIRST",
      action: "REJECTED",
      comment: trimmed,
    });
    if (!acted.ok) {
      return actionError(acted.error ?? "差し戻しの権限がありません");
    }
    const actor = await getCurrentActorId();
    await prisma.purchaseRequest.update({
      where: { id: prior.id },
      data: {
        status: "REJECTED",
        history: toHistoryJson(
          appendHistory(prior.history, entry("REJECT", actor, trimmed)),
        ),
      },
    });
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
    return actionError(prismaErrorMessage(e, "差し戻しに失敗しました"));
  }
}

/** キャンセル — 変換前（DRAFT / REQUESTED / APPROVED / REJECTED）のみ（理由必須）。 */
export async function cancelPurchaseRequest(
  requestNumber: string,
  reason: string,
): Promise<ActionResult> {
  const authz = await checkPermission("purchase_order", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const trimmed = reason.trim();
  if (!trimmed) return actionError("キャンセル理由を入力してください");
  try {
    const prior = await prisma.purchaseRequest.findUnique({
      where: { requestNumber },
    });
    if (!prior) return actionError("対象の購買依頼が見つかりません");
    if (
      prior.status !== "DRAFT" &&
      prior.status !== "REQUESTED" &&
      prior.status !== "APPROVED" &&
      prior.status !== "REJECTED"
    ) {
      return actionError("発注書へ変換前の購買依頼のみキャンセルできます");
    }
    const actor = await getCurrentActorId();
    await prisma.$transaction([
      prisma.purchaseRequest.update({
        where: { id: prior.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledBy: actor,
          cancelReason: trimmed,
          history: toHistoryJson(
            appendHistory(prior.history, entry("CANCEL", actor, trimmed)),
          ),
        },
      }),
      // 承認依頼中のキャンセル: 未処理の承認依頼行を取り下げる（記録なしの
      // PENDING 行のみ — PD03 の横断一覧に残さない）。
      prisma.approvalRequest.deleteMany({
        where: {
          targetType: "purchase_requests",
          targetId: requestNumber,
          status: "PENDING",
        },
      }),
    ]);
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
    return actionError(prismaErrorMessage(e, "キャンセルに失敗しました"));
  }
}

// ── 発注書へ変換 ─────────────────────────────────────────────────────────────

/**
 * 発注書へ変換 — APPROVED のみ。1 tx で素材発注書（DRAFT）を生成し、
 * 依頼を ORDERED にして purchase_order_id で紐付ける。
 * 仕入先は変換時に指定（依頼は仕入先を持たない）。単価は 0 で複写し、
 * 金額・発注承認は発注書（PU03）側で確定する。
 */
export async function convertToPurchaseOrder(
  requestNumber: string,
  supplierBpId: string,
): Promise<ActionResult<{ poNumber: string }>> {
  const authz = await checkPermission("purchase_order", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  if (!supplierBpId) return actionError("仕入先を選択してください");
  try {
    const prior = await prisma.purchaseRequest.findUnique({
      where: { requestNumber },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    if (!prior) return actionError("対象の購買依頼が見つかりません");
    if (prior.status !== "APPROVED") {
      return actionError("承認済の購買依頼のみ発注書へ変換できます");
    }
    if (prior.items.length === 0) {
      return actionError("明細のない購買依頼は変換できません");
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
          notes: `購買依頼 ${requestNumber} から作成`,
          createdBy: actor,
          history: toHistoryJson([
            entry("CREATE", actor, `購買依頼 ${requestNumber} から変換`),
          ]),
          items: {
            create: prior.items.map((it, i) => ({
              materialId: it.materialId,
              factoryId: it.factoryId,
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
      await tx.purchaseRequest.update({
        where: { id: prior.id },
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
    return actionError(prismaErrorMessage(e, "発注書への変換に失敗しました"));
  }
}
