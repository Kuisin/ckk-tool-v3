"use server";

/**
 * Server Actions — 素材発注書 (app.material_purchase_orders, PU03)。
 *
 * - 採番: nextDocumentNumber("PURCHASE") → PO-YYYYMM-NNNNN（文字列保存、月次リセット）。
 * - 金額はサーバー側で計算（amount = quantity × unitPrice、totalAmount = Σamount）。
 * - 承認フロー DRAFT→REQUESTED→APPROVED→ORDERED→COMPLETED（+CANCELLED）は
 *   指示書の承認と同型の row-workflow: 遷移列（at/by）+ history Json + audit。
 *   加えて承認依頼・記録を approval_requests / approval_records へ正規化する
 *   （§6 本実装 — PD03 横断表示・代理対応）。承認可否は actOnApprovalRequest
 *   内で判定（第一承認グループの本人メンバー or 有効期間内の代理）。
 * - ORDERED になった明細は lib/atp.ts が「入荷予定」として自動的に読む
 *   （追加の連携処理は不要）。
 * - COMPLETED 時は明細ごとに MaterialReceipt を全量入荷で作成し、
 *   onMaterialReceipt で素材在庫へ入庫する。
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
import { prisma } from "@/lib/db";
import { onMaterialReceipt } from "@/lib/inventory";
import { nextDocumentNumber } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/purchase/purchase-orders";
const RECEIPTS_PATH = "/purchase/material-receipts";
const APPROVALS_PATH = "/production/approvals";

function revalidate(poNumber?: string) {
  revalidatePath(BASE_PATH);
  // 承認依頼は承認管理 (PD03) にも横断表示される。
  revalidatePath(APPROVALS_PATH);
  if (poNumber) {
    revalidatePath(`${BASE_PATH}/${poNumber}`);
    revalidatePath(`${BASE_PATH}/${poNumber}/edit`);
  }
}

// ── 入力スキーマ ─────────────────────────────────────────────────────────────

const itemInput = z.object({
  materialId: z.string().min(1, "素材を選択してください"),
  factoryId: z.string().nullable(),
  quantity: z.number().positive("数量は0より大きい値"),
  unit: z.string().min(1, "単位を入力してください"),
  unitPrice: z.number().min(0, "単価は0以上"),
  expectedAt: z.string().nullable(),
  notes: z.string().nullable(),
});

const purchaseOrderInput = z.object({
  supplierBpId: z.string().min(1, "仕入先を選択してください"),
  purchaseDate: z.string().nullable(),
  notes: z.string(),
  items: z.array(itemInput).min(1, "明細を1件以上追加してください"),
});

export type PurchaseOrderInput = z.infer<typeof purchaseOrderInput>;

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

/** 明細入力 → create データ（金額はサーバー側で計算）。 */
function buildItemCreates(items: PurchaseOrderInput["items"]) {
  return items.map((it, i) => ({
    materialId: Number(it.materialId),
    factoryId: it.factoryId ? Number(it.factoryId) : null,
    quantity: it.quantity,
    unit: it.unit,
    unitPrice: it.unitPrice,
    amount: it.quantity * it.unitPrice,
    expectedAt: it.expectedAt ? new Date(it.expectedAt) : null,
    notes: it.notes?.trim() || null,
    sortOrder: i,
  }));
}

// ── 作成 / 更新 ──────────────────────────────────────────────────────────────

export async function createPurchaseOrder(
  payload: PurchaseOrderInput,
): Promise<ActionResult<{ poNumber: string }>> {
  const parsed = purchaseOrderInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const actor = await getCurrentActorId();
    const poNumber = await nextDocumentNumber("PURCHASE");
    const creates = buildItemCreates(v.items);
    const totalAmount = creates.reduce((sum, it) => sum + it.amount, 0);

    await prisma.$transaction(async (tx) => {
      await tx.materialPurchaseOrder.create({
        data: {
          poNumber,
          supplierBpId: v.supplierBpId,
          status: "DRAFT",
          totalAmount,
          purchaseDate: v.purchaseDate ? new Date(v.purchaseDate) : null,
          notes: v.notes.trim() || null,
          createdBy: actor,
          history: toHistoryJson([entry("CREATE", actor)]),
          items: { create: creates },
        },
      });
    });

    await recordAudit({
      action: "CREATE",
      tableName: "material_purchase_orders",
      recordId: poNumber,
      after: {
        supplierBpId: v.supplierBpId,
        status: "DRAFT",
        totalAmount,
        purchaseDate: v.purchaseDate,
        itemCount: creates.length,
      },
    });
    revalidate(poNumber);
    return actionOk({ poNumber });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "素材発注書の作成に失敗しました"));
  }
}

/** 更新 — DRAFT のみ。明細は $transaction で全置換する。 */
export async function updatePurchaseOrder(
  poNumber: string,
  payload: PurchaseOrderInput,
): Promise<ActionResult<{ poNumber: string }>> {
  const parsed = purchaseOrderInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const prior = await prisma.materialPurchaseOrder.findUnique({
      where: { poNumber },
    });
    if (!prior) return actionError("対象の素材発注書が見つかりません");
    if (prior.status !== "DRAFT") {
      return actionError("作成中の素材発注書のみ編集できます");
    }
    const actor = await getCurrentActorId();
    const creates = buildItemCreates(v.items);
    const totalAmount = creates.reduce((sum, it) => sum + it.amount, 0);

    await prisma.$transaction(async (tx) => {
      await tx.materialPurchaseOrderItem.deleteMany({
        where: { purchaseOrderId: prior.id },
      });
      await tx.materialPurchaseOrder.update({
        where: { id: prior.id },
        data: {
          supplierBpId: v.supplierBpId,
          totalAmount,
          purchaseDate: v.purchaseDate ? new Date(v.purchaseDate) : null,
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
      tableName: "material_purchase_orders",
      recordId: poNumber,
      before: {
        supplierBpId: prior.supplierBpId,
        totalAmount: Number(prior.totalAmount),
        purchaseDate: prior.purchaseDate?.toISOString().slice(0, 10) ?? null,
        notes: prior.notes,
      },
      after: {
        supplierBpId: v.supplierBpId,
        totalAmount,
        purchaseDate: v.purchaseDate,
        notes: v.notes.trim() || null,
        itemCount: creates.length,
      },
    });
    revalidate(poNumber);
    return actionOk({ poNumber });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "素材発注書の更新に失敗しました"));
  }
}

// ── 状態遷移（承認フロー） ────────────────────────────────────────────────────

/** 承認依頼 — DRAFT → REQUESTED。 */
export async function requestPurchaseApproval(
  poNumber: string,
): Promise<ActionResult> {
  try {
    const prior = await prisma.materialPurchaseOrder.findUnique({
      where: { poNumber },
    });
    if (!prior) return actionError("対象の素材発注書が見つかりません");
    if (prior.status !== "DRAFT") {
      return actionError("作成中の素材発注書のみ承認依頼できます");
    }
    const actor = await getCurrentActorId();
    await prisma.materialPurchaseOrder.update({
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
    // 正規化された承認依頼行（PD03 横断表示・承認記録の紐付け先）。
    await createApprovalRequest({
      targetType: "material_purchase_orders",
      targetId: poNumber,
      step: "FIRST",
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "material_purchase_orders",
      recordId: poNumber,
      before: { status: prior.status },
      after: { status: "REQUESTED" },
    });
    revalidate(poNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "承認依頼に失敗しました"));
  }
}

/** 承認 — REQUESTED → APPROVED。第一承認グループのメンバーのみ。 */
export async function approvePurchaseOrder(
  poNumber: string,
): Promise<ActionResult> {
  try {
    const prior = await prisma.materialPurchaseOrder.findUnique({
      where: { poNumber },
    });
    if (!prior) return actionError("対象の素材発注書が見つかりません");
    if (prior.status !== "REQUESTED") {
      return actionError("承認依頼中の素材発注書ではありません");
    }
    // 承認権限（本人 or 代理）を検証しつつ承認記録を書き、依頼を確定する。
    const acted = await actOnApprovalRequest({
      targetType: "material_purchase_orders",
      targetId: poNumber,
      step: "FIRST",
      groupType: "FIRST",
      action: "APPROVED",
    });
    if (!acted.ok) return actionError(acted.error ?? "承認の権限がありません");
    const actor = await getCurrentActorId();
    await prisma.materialPurchaseOrder.update({
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
      tableName: "material_purchase_orders",
      recordId: poNumber,
      before: { status: "REQUESTED" },
      after: { status: "APPROVED" },
    });
    revalidate(poNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "承認に失敗しました"));
  }
}

/** 差し戻し — REQUESTED → DRAFT（理由必須）。承認グループのメンバーのみ。 */
export async function rejectPurchaseOrder(
  poNumber: string,
  reason: string,
): Promise<ActionResult> {
  const trimmed = reason.trim();
  if (!trimmed) return actionError("差し戻し理由を入力してください");
  try {
    const prior = await prisma.materialPurchaseOrder.findUnique({
      where: { poNumber },
    });
    if (!prior) return actionError("対象の素材発注書が見つかりません");
    if (prior.status !== "REQUESTED") {
      return actionError("承認依頼中の素材発注書ではありません");
    }
    // 差し戻しを承認記録として書き、依頼を確定する（権限検証込み）。
    const acted = await actOnApprovalRequest({
      targetType: "material_purchase_orders",
      targetId: poNumber,
      step: "FIRST",
      groupType: "FIRST",
      action: "REJECTED",
      comment: trimmed,
    });
    if (!acted.ok) {
      return actionError(acted.error ?? "差し戻しの権限がありません");
    }
    const actor = await getCurrentActorId();
    await prisma.materialPurchaseOrder.update({
      where: { id: prior.id },
      data: {
        status: "DRAFT",
        requestedAt: null,
        requestedBy: null,
        history: toHistoryJson(
          appendHistory(prior.history, entry("REJECT", actor, trimmed)),
        ),
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "material_purchase_orders",
      recordId: poNumber,
      before: { status: "REQUESTED" },
      after: { status: "DRAFT", rejectReason: trimmed },
    });
    revalidate(poNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "差し戻しに失敗しました"));
  }
}

/**
 * 発注 — APPROVED → ORDERED。
 * ORDERED の明細は素材 ATP（lib/atp.ts）が入荷予定として読む。
 */
export async function orderPurchaseOrder(
  poNumber: string,
): Promise<ActionResult> {
  try {
    const prior = await prisma.materialPurchaseOrder.findUnique({
      where: { poNumber },
    });
    if (!prior) return actionError("対象の素材発注書が見つかりません");
    if (prior.status !== "APPROVED") {
      return actionError("承認済の素材発注書のみ発注できます");
    }
    const actor = await getCurrentActorId();
    const now = new Date();
    await prisma.materialPurchaseOrder.update({
      where: { id: prior.id },
      data: {
        status: "ORDERED",
        orderedAt: now,
        orderedBy: actor,
        // 発注日が未設定なら発注実行日を採用する。
        ...(prior.purchaseDate ? {} : { purchaseDate: now }),
        history: toHistoryJson(
          appendHistory(prior.history, entry("ORDER", actor)),
        ),
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "material_purchase_orders",
      recordId: poNumber,
      before: { status: "APPROVED" },
      after: { status: "ORDERED" },
    });
    revalidate(poNumber);
    // ATP（素材在庫の入荷予定）が変わるため在庫ページも再検証する。
    revalidatePath("/production/inventory/materials");
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "発注に失敗しました"));
  }
}

/**
 * 入荷完了 — ORDERED → COMPLETED。
 * 明細ごとに MaterialReceipt を「全量入荷」で作成し、onMaterialReceipt で
 * 素材在庫へ入庫する。明細単位の分納（部分入荷）はスコープ外 — 分納が必要な
 * 場合は素材入荷 (PU01) の直接登録で補う。
 */
export async function completePurchaseOrder(
  poNumber: string,
): Promise<ActionResult> {
  try {
    const prior = await prisma.materialPurchaseOrder.findUnique({
      where: { poNumber },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    if (!prior) return actionError("対象の素材発注書が見つかりません");
    if (prior.status !== "ORDERED") {
      return actionError("発注済の素材発注書のみ入荷完了にできます");
    }
    const actor = await getCurrentActorId();
    const now = new Date();
    // 入荷日は日付のみ（@db.Date）。
    const receivedAt = new Date(now.toISOString().slice(0, 10));

    // PO の完了 + 入荷レコード作成を同一 tx で行い、在庫入庫
    // （onMaterialReceipt は内部で自前の tx を張る）は commit 後に流す。
    const receiptIds = await prisma.$transaction(async (tx) => {
      await tx.materialPurchaseOrder.update({
        where: { id: prior.id },
        data: {
          status: "COMPLETED",
          completedAt: now,
          completedBy: actor,
          history: toHistoryJson(
            appendHistory(prior.history, entry("COMPLETE", actor)),
          ),
        },
      });
      const ids: string[] = [];
      for (const it of prior.items) {
        const receipt = await tx.materialReceipt.create({
          data: {
            materialId: it.materialId,
            supplierBpId: prior.supplierBpId,
            purchaseOrderItemId: it.id,
            factoryId: it.factoryId,
            quantity: it.quantity,
            unit: it.unit,
            receivedAt,
            notes: `素材発注書 ${poNumber} の入荷`,
            createdBy: actor,
          },
          select: { id: true },
        });
        ids.push(receipt.id);
      }
      return ids;
    });

    // 素材在庫への入庫（入荷工場別）。
    for (const id of receiptIds) {
      await onMaterialReceipt(id);
      await recordAudit({
        action: "CREATE",
        tableName: "material_receipts",
        recordId: id,
        after: { poNumber, source: "purchase_order_complete" },
      });
    }

    await recordAudit({
      action: "UPDATE",
      tableName: "material_purchase_orders",
      recordId: poNumber,
      before: { status: "ORDERED" },
      after: { status: "COMPLETED", receiptCount: receiptIds.length },
    });
    revalidate(poNumber);
    revalidatePath(RECEIPTS_PATH);
    revalidatePath("/production/inventory/materials");
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "入荷完了に失敗しました"));
  }
}

/** キャンセル — 発注前（DRAFT / REQUESTED / APPROVED）のみ（理由必須）。 */
export async function cancelPurchaseOrder(
  poNumber: string,
  reason: string,
): Promise<ActionResult> {
  const trimmed = reason.trim();
  if (!trimmed) return actionError("キャンセル理由を入力してください");
  try {
    const prior = await prisma.materialPurchaseOrder.findUnique({
      where: { poNumber },
    });
    if (!prior) return actionError("対象の素材発注書が見つかりません");
    if (
      prior.status !== "DRAFT" &&
      prior.status !== "REQUESTED" &&
      prior.status !== "APPROVED"
    ) {
      return actionError("発注前の素材発注書のみキャンセルできます");
    }
    const actor = await getCurrentActorId();
    await prisma.$transaction([
      prisma.materialPurchaseOrder.update({
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
          targetType: "material_purchase_orders",
          targetId: poNumber,
          status: "PENDING",
        },
      }),
    ]);
    await recordAudit({
      action: "UPDATE",
      tableName: "material_purchase_orders",
      recordId: poNumber,
      before: { status: prior.status },
      after: { status: "CANCELLED", cancelReason: trimmed },
    });
    revalidate(poNumber);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "キャンセルに失敗しました"));
  }
}
