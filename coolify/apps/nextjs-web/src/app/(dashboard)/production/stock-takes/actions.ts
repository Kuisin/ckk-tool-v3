"use server";

/**
 * Server Actions — 棚卸 (app.stock_takes, PD08)。
 *
 * - 採番: allocateDocumentKey("STOCK_TAKE") → STK-YYYYMM-NNNNN。
 * - 新規登録は 拠点（必須）+ 保管場所（任意・拠点に紐づく）を選び、その場で
 *   対象バケットを取り込む（snapshotStockTakeLines）。0 件なら作成ごと失敗させる
 *   （数える対象が無い棚卸を残さない）。
 * - 提出（submitStockTake）は承認設定 (MS0B) の「棚卸」フローの段数で分岐する:
 *   1 段以上あれば承認依頼、**0 段なら即確定**（他の書類と同じ「段が無ければ
 *   素通し」の規約 — work_order_flow_changes / order_acceptance_cancel と同じ）。
 * - 確定（差異ぶんの入出庫伝票 ADJUST を起こす）は lib/stock-take.ts
 *   confirmStockTakeTx が唯一の実装 — ここでは呼ぶだけで数え直さない。
 * - 差異・編集可否・提出可否・キャンセル可否の判定はすべて
 *   lib/stock-take-core.ts（純ロジック・試験あり）を通す。
 */

import { rowInScope } from "@ckk/authz-core";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  actOnCurrentStep,
  getApprovalFlow,
  startApprovalFlow,
} from "@/lib/approvals";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import {
  checkApprovalDocAccess,
  checkPermission,
  targetPlantsInScope,
} from "@/lib/authz";
import { prisma } from "@/lib/db";
import { parseDocKey } from "@/lib/doc-number";
import { allocateDocumentKey } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { confirmStockTakeTx, snapshotStockTakeLines } from "@/lib/stock-take";
import { canCancel, canEditCounts, canSubmit } from "@/lib/stock-take-core";

const BASE_PATH = "/production/stock-takes";
const APPROVALS_PATH = "/general/tasks";
const INVENTORY_PATH = "/production/inventory";
const MOVEMENTS_PATH = "/production/inventory/movements";
const TARGET_TYPE = "stock_takes" as const;

type Tr = Awaited<ReturnType<typeof getTranslations>>;

function revalidate(stockTakeNumber?: string) {
  revalidatePath(BASE_PATH);
  revalidatePath(APPROVALS_PATH);
  // 確定は在庫台帳と入出庫伝票を動かす — 他の在庫アクションと同じく常に両方 revalidate する。
  revalidatePath(INVENTORY_PATH);
  revalidatePath(MOVEMENTS_PATH);
  if (stockTakeNumber) revalidatePath(`${BASE_PATH}/${stockTakeNumber}`);
}

function keyOf(stockTakeNumber: string) {
  return parseDocKey(stockTakeNumber, "STK");
}

/** GUARD: 例外で $transaction を巻き戻しつつユーザー向け文言を運ぶ。 */
function guardError(message: string): never {
  throw new Error(`GUARD:${message}`);
}

function unwrapGuard(e: unknown, tr: Tr, fallback: string): string {
  if (e instanceof Error && e.message.startsWith("GUARD:")) {
    return e.message.slice("GUARD:".length);
  }
  return prismaErrorMessage(e, fallback, tr);
}

// ── 入力スキーマ ─────────────────────────────────────────────────────────────

function createInputSchema(tr: Tr) {
  return z.object({
    plantId: z
      .string()
      .min(1, tr("production.stockTakes.actions.selectAPlant")),
    storageLocationId: z.string().nullable(),
    notes: z.string(),
  });
}

export type StockTakeCreateInput = z.infer<
  ReturnType<typeof createInputSchema>
>;

function countLineInputSchema() {
  return z.object({
    id: z.string().min(1),
    countedQuantity: z.number().nonnegative().nullable(),
    notes: z.string().nullable(),
  });
}

export type StockTakeCountLineInput = z.infer<
  ReturnType<typeof countLineInputSchema>
>;

// ── 新規登録 ─────────────────────────────────────────────────────────────────

/** 新規登録 — 対象バケットをその場で取り込む（1 tx。0 件なら作成ごと失敗）。 */
export async function createStockTake(
  payload: StockTakeCreateInput,
): Promise<ActionResult<{ stockTakeNumber: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("inventory", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = createInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  const plantId = Number(v.plantId);
  if (!Number.isInteger(plantId)) {
    return actionError(tr("production.stockTakes.actions.selectAPlant"));
  }
  if (!targetPlantsInScope(authz.access, authz.userId, [plantId])) {
    return actionError(tr("common.scopeDenied"));
  }
  const storageLocationId = v.storageLocationId
    ? Number(v.storageLocationId)
    : null;

  try {
    const actor = await getCurrentActorId();
    // 採番は tx の外（全書類共通の作法）。
    const key = await allocateDocumentKey("STOCK_TAKE");
    let lineCount = 0;
    await prisma.$transaction(async (tx) => {
      const row = await tx.stockTake.create({
        data: {
          yearMonth: key.yearMonth,
          seq: key.seq,
          plantId,
          storageLocationId,
          status: "DRAFT",
          approvalStatus: "NONE",
          notes: v.notes.trim() || null,
          createdBy: actor,
        },
        select: { id: true },
      });
      lineCount = await snapshotStockTakeLines(
        tx,
        row.id,
        plantId,
        storageLocationId,
      );
      if (lineCount === 0) {
        guardError(tr("production.stockTakes.actions.noLinesToCount"));
      }
    });

    const stockTakeNumber = `STK-${key.yearMonth}-${String(key.seq).padStart(5, "0")}`;
    await recordAudit({
      action: "CREATE",
      tableName: "stock_takes",
      recordId: stockTakeNumber,
      after: { plantId, storageLocationId, lineCount },
    });
    revalidate(stockTakeNumber);
    return actionOk({ stockTakeNumber });
  } catch (e) {
    return actionError(
      unwrapGuard(e, tr, tr("production.stockTakes.actions.createFailed")),
    );
  }
}

// ── 数量の記入 ───────────────────────────────────────────────────────────────

/** 数量の記入・保存 — canEditCounts の間だけ（承認依頼中・確定後・キャンセル後は不可）。 */
export async function saveStockTakeCounts(
  stockTakeNumber: string,
  lines: StockTakeCountLineInput[],
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("inventory", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const key = keyOf(stockTakeNumber);
  if (!key) return actionError(tr("common.targetRecordNotFound"));
  const parsed = z.array(countLineInputSchema()).safeParse(lines);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  try {
    const prior = await prisma.stockTake.findUnique({
      where: { yearMonth_seq: key },
      select: {
        id: true,
        plantId: true,
        status: true,
        approvalStatus: true,
        lines: { select: { id: true } },
      },
    });
    if (!prior) return actionError(tr("common.targetRecordNotFound"));
    if (
      !rowInScope(authz.access, { plantIds: [prior.plantId] }, authz.userId)
    ) {
      return actionError(tr("common.scopeDenied"));
    }
    if (
      !canEditCounts({
        status: prior.status,
        approvalStatus: prior.approvalStatus,
      })
    ) {
      return actionError(tr("production.stockTakes.actions.notEditableNow"));
    }
    const validIds = new Set(prior.lines.map((l) => l.id));
    const updates = parsed.data.filter((l) => validIds.has(l.id));

    await prisma.$transaction(async (tx) => {
      for (const line of updates) {
        // updateMany（id 単独では一意だが、stockTakeId も条件に含めて他の
        // 棚卸の行を誤って触らないようにする）。
        await tx.stockTakeLine.updateMany({
          where: { id: line.id, stockTakeId: prior.id },
          data: {
            countedQuantity: line.countedQuantity,
            notes: line.notes?.trim() || null,
          },
        });
      }
      // 最初の保存で 下書き → 記入 へ進める（以後の保存は COUNTING のまま）。
      if (prior.status === "DRAFT") {
        await tx.stockTake.updateMany({
          where: { id: prior.id, status: "DRAFT" },
          data: { status: "COUNTING" },
        });
      }
    });

    await recordAudit({
      action: "UPDATE",
      tableName: "stock_takes",
      recordId: stockTakeNumber,
      after: { note: tr("production.stockTakes.actions.countsSaved") },
    });
    revalidate(stockTakeNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      unwrapGuard(e, tr, tr("production.stockTakes.actions.saveCountsFailed")),
    );
  }
}

// ── 提出（承認依頼 or 段が無ければ即確定） ───────────────────────────────────

/**
 * 記入を確定して提出する。承認設定 (MS0B) の「棚卸」フローに 1 段以上あれば
 * 承認依頼へ、0 段なら**このまま確定**（差異ぶんの調整を即座に計上する）。
 */
export async function submitStockTake(
  stockTakeNumber: string,
): Promise<ActionResult<{ confirmed: boolean }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("inventory", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const key = keyOf(stockTakeNumber);
  if (!key) return actionError(tr("common.targetRecordNotFound"));
  try {
    const prior = await prisma.stockTake.findUnique({
      where: { yearMonth_seq: key },
      select: {
        id: true,
        plantId: true,
        status: true,
        approvalStatus: true,
        lines: { select: { bookQuantity: true, countedQuantity: true } },
      },
    });
    if (!prior) return actionError(tr("common.targetRecordNotFound"));
    if (
      !rowInScope(authz.access, { plantIds: [prior.plantId] }, authz.userId)
    ) {
      return actionError(tr("common.scopeDenied"));
    }
    const lineInputs = prior.lines.map((l) => ({
      bookQuantity: Number(l.bookQuantity),
      countedQuantity:
        l.countedQuantity != null ? Number(l.countedQuantity) : null,
    }));
    if (
      !canSubmit(
        { status: prior.status, approvalStatus: prior.approvalStatus },
        lineInputs,
      )
    ) {
      return actionError(tr("production.stockTakes.actions.cannotSubmitNow"));
    }

    const flow = await getApprovalFlow(TARGET_TYPE);
    const actor = await getCurrentActorId();

    if (flow.length > 0) {
      // 1 段目の承認依頼を先に作る（作れなければ状態を動かさない）。
      const started = await startApprovalFlow({
        targetType: TARGET_TYPE,
        targetId: stockTakeNumber,
      });
      if (!started.ok) {
        return actionError(started.error ?? tr("common.approvalRequestFailed"));
      }
      const flipped = await prisma.stockTake.updateMany({
        where: {
          id: prior.id,
          status: prior.status,
          approvalStatus: prior.approvalStatus,
        },
        data: {
          status: "COUNTING",
          approvalStatus: "PENDING",
          countedAt: new Date(),
        },
      });
      if (flipped.count === 0) {
        return actionError(tr("production.stockTakes.actions.stateChanged"));
      }
      await recordAudit({
        action: "UPDATE",
        tableName: "stock_takes",
        recordId: stockTakeNumber,
        before: { status: prior.status, approvalStatus: prior.approvalStatus },
        after: { status: "COUNTING", approvalStatus: "PENDING" },
      });
      revalidate(stockTakeNumber);
      return actionOk({ confirmed: false });
    }

    // 0 段 = 素通し。採番は tx の外で先に行う（全書類共通の作法）。
    const movementKey = await allocateDocumentKey("INVENTORY_MOVEMENT");
    const result = await prisma.$transaction(async (tx) => {
      await tx.stockTake.update({
        where: { id: prior.id },
        data: { countedAt: new Date() },
      });
      return confirmStockTakeTx(tx, prior.id, movementKey, actor);
    });

    await recordAudit({
      action: "UPDATE",
      tableName: "stock_takes",
      recordId: stockTakeNumber,
      before: { status: prior.status },
      after: {
        status: "CONFIRMED",
        posted: result.posted,
        movementId: result.movementId,
      },
    });
    revalidate(stockTakeNumber);
    return actionOk({ confirmed: true });
  } catch (e) {
    return actionError(
      unwrapGuard(e, tr, tr("production.stockTakes.actions.submitFailed")),
    );
  }
}

// ── 承認 / 差し戻し ──────────────────────────────────────────────────────────

/** 承認 — 全段通過（flowCompleted）で初めて確定を当てる。 */
export async function approveStockTake(
  stockTakeNumber: string,
): Promise<ActionResult<{ completed: boolean }>> {
  const tr = await getTranslations();
  const authz = await checkApprovalDocAccess("inventory");
  if (!authz.ok) return actionError(authz.error);
  const key = keyOf(stockTakeNumber);
  if (!key) return actionError(tr("common.targetRecordNotFound"));
  try {
    const prior = await prisma.stockTake.findUnique({
      where: { yearMonth_seq: key },
      select: { id: true, plantId: true, status: true, approvalStatus: true },
    });
    if (!prior) return actionError(tr("common.targetRecordNotFound"));
    if (
      !rowInScope(authz.access, { plantIds: [prior.plantId] }, authz.userId)
    ) {
      return actionError(tr("common.scopeDenied"));
    }
    if (prior.approvalStatus !== "PENDING") {
      return actionError(
        tr("production.stockTakes.actions.notPendingApproval"),
      );
    }
    const acted = await actOnCurrentStep({
      targetType: TARGET_TYPE,
      targetId: stockTakeNumber,
      action: "APPROVED",
    });
    if (!acted.ok) {
      return actionError(acted.error ?? tr("common.noApprovalPermission"));
    }
    if (!acted.flowCompleted) {
      await recordAudit({
        action: "UPDATE",
        tableName: "stock_takes",
        recordId: stockTakeNumber,
        after: {
          note: acted.stepClosed
            ? tr("common.approvalNextStep")
            : tr("common.approvalRemainingMembers", { count: acted.remaining }),
        },
      });
      revalidate(stockTakeNumber);
      return actionOk({ completed: false });
    }

    // 最終承認 — ここで初めて確定を当てる。
    const actor = await getCurrentActorId();
    const movementKey = await allocateDocumentKey("INVENTORY_MOVEMENT");
    const result = await prisma.$transaction(async (tx) => {
      await tx.stockTake.update({
        where: { id: prior.id },
        data: { approvalStatus: "APPROVED" },
      });
      return confirmStockTakeTx(tx, prior.id, movementKey, actor);
    });

    await recordAudit({
      action: "UPDATE",
      tableName: "stock_takes",
      recordId: stockTakeNumber,
      before: { status: prior.status, approvalStatus: "PENDING" },
      after: {
        status: "CONFIRMED",
        approvalStatus: "APPROVED",
        posted: result.posted,
        movementId: result.movementId,
      },
    });
    revalidate(stockTakeNumber);
    return actionOk({ completed: true });
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotApprove"), tr));
  }
}

/** 差し戻し — 段を閉じて理由を残す。記入へ戻り、直して再提出できる。 */
export async function rejectStockTake(
  stockTakeNumber: string,
  reason: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkApprovalDocAccess("inventory");
  if (!authz.ok) return actionError(authz.error);
  const trimmed = reason.trim();
  if (!trimmed) return actionError(tr("common.enterAReasonForSendingIt"));
  const key = keyOf(stockTakeNumber);
  if (!key) return actionError(tr("common.targetRecordNotFound"));
  try {
    const prior = await prisma.stockTake.findUnique({
      where: { yearMonth_seq: key },
      select: { id: true, plantId: true, status: true, approvalStatus: true },
    });
    if (!prior) return actionError(tr("common.targetRecordNotFound"));
    if (
      !rowInScope(authz.access, { plantIds: [prior.plantId] }, authz.userId)
    ) {
      return actionError(tr("common.scopeDenied"));
    }
    if (prior.approvalStatus !== "PENDING") {
      return actionError(
        tr("production.stockTakes.actions.notPendingApproval"),
      );
    }
    const acted = await actOnCurrentStep({
      targetType: TARGET_TYPE,
      targetId: stockTakeNumber,
      action: "REJECTED",
      comment: trimmed,
    });
    if (!acted.ok) {
      return actionError(acted.error ?? tr("common.noSendBackPermission"));
    }
    const actor = await getCurrentActorId();
    await prisma.stockTake.update({
      where: { id: prior.id },
      data: {
        approvalStatus: "REJECTED",
        rejectedAt: new Date(),
        rejectedBy: actor,
        rejectReason: trimmed,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "stock_takes",
      recordId: stockTakeNumber,
      before: { approvalStatus: "PENDING" },
      after: { approvalStatus: "REJECTED", rejectReason: trimmed },
    });
    revalidate(stockTakeNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("common.couldNotSendItBack"), tr),
    );
  }
}

// ── キャンセル ───────────────────────────────────────────────────────────────

/** キャンセル — 下書き・記入中のみ（確定後は逆仕訳の棚卸を起こすため不可）。 */
export async function cancelStockTake(
  stockTakeNumber: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("inventory", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const key = keyOf(stockTakeNumber);
  if (!key) return actionError(tr("common.targetRecordNotFound"));
  try {
    const prior = await prisma.stockTake.findUnique({
      where: { yearMonth_seq: key },
      select: { id: true, plantId: true, status: true, approvalStatus: true },
    });
    if (!prior) return actionError(tr("common.targetRecordNotFound"));
    if (
      !rowInScope(authz.access, { plantIds: [prior.plantId] }, authz.userId)
    ) {
      return actionError(tr("common.scopeDenied"));
    }
    if (
      !canCancel({ status: prior.status, approvalStatus: prior.approvalStatus })
    ) {
      return actionError(tr("production.stockTakes.actions.cannotCancelNow"));
    }
    const actor = await getCurrentActorId();
    await prisma.$transaction(async (tx) => {
      const flipped = await tx.stockTake.updateMany({
        where: { id: prior.id, status: prior.status },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledBy: actor,
        },
      });
      if (flipped.count === 0) {
        guardError(tr("production.stockTakes.actions.stateChanged"));
      }
      // 承認依頼中だった場合は保留中の依頼行を取り下げる（PD03/CM01 に残さない）。
      if (prior.approvalStatus === "PENDING") {
        await tx.approvalRequest.deleteMany({
          where: {
            targetType: TARGET_TYPE,
            targetId: stockTakeNumber,
            status: "PENDING",
          },
        });
      }
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "stock_takes",
      recordId: stockTakeNumber,
      before: { status: prior.status },
      after: { status: "CANCELLED" },
    });
    revalidate(stockTakeNumber);
    return actionOk();
  } catch (e) {
    return actionError(
      unwrapGuard(e, tr, tr("production.stockTakes.actions.cancelFailed")),
    );
  }
}
