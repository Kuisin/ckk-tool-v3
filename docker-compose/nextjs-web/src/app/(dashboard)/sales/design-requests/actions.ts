"use server";

/**
 * Server Actions — 設計依頼書 (app.design_requests, SA04).
 *
 * 作成時に nextDocumentNumber("DESIGN") で依頼番号 DSG-YYYYMM-NNNNN を採番し
 * request_number に保存する（URL id も依頼番号）。
 * トリガ（見積時/受注時）と参照元（見積書/注文請書）は作成後変更不可。
 * 状態遷移: 着手 PENDING → IN_PROGRESS / 完了 IN_PROGRESS → COMPLETED
 * （completedAt 記録）/ 差し戻し COMPLETED → IN_PROGRESS（completedAt クリア）。
 * 遷移・更新は status を where に含めた updateMany で原子的にガードする。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { parseDocKey } from "@/lib/doc-number";
import { nextDocumentNumber } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/sales/design-requests";

const triggerEnum = z.enum(["QUOTE", "SALES_ORDER"]);

const createInput = z.object({
  trigger: triggerEnum,
  /** 見積時: 見積書番号 QOT-YYYYMM-NNNNN（任意）。 */
  quoteNumber: z.string().nullable(),
  /** 受注時: 注文請書 uuid（任意）。 */
  salesOrderId: z.string().nullable(),
  productId: z.string().nullable(),
  description: z.string().nullable(),
});

const updateInput = z.object({
  productId: z.string().nullable(),
  description: z.string().nullable(),
});

export type DesignRequestCreateInput = z.infer<typeof createInput>;
export type DesignRequestUpdateInput = z.infer<typeof updateInput>;

function revalidate(number?: string) {
  revalidatePath(BASE_PATH);
  if (number) {
    revalidatePath(`${BASE_PATH}/${number}`);
    revalidatePath(`${BASE_PATH}/${number}/edit`);
  }
}

const trimOrNull = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t || null;
};

/** 作成 — 採番して PENDING で登録。作成後は詳細ページへ遷移する。 */
export async function createDesignRequest(
  payload: DesignRequestCreateInput,
): Promise<ActionResult<{ number: string }>> {
  const parsed = createInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;

  // 参照元はトリガに対応する側のみ採用する（もう一方は常に null）。
  const quoteNumber = v.trigger === "QUOTE" ? trimOrNull(v.quoteNumber) : null;
  const quoteKey = quoteNumber ? parseDocKey(quoteNumber, "QOT") : null;
  if (quoteNumber && !quoteKey) {
    return actionError("見積書番号が不正です");
  }
  const salesOrderId =
    v.trigger === "SALES_ORDER" ? trimOrNull(v.salesOrderId) : null;

  const authz = await checkPermission("design_request", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const requestNumber = await nextDocumentNumber("DESIGN");
    await prisma.designRequest.create({
      data: {
        requestNumber,
        trigger: v.trigger,
        quoteYearMonth: quoteKey?.yearMonth ?? null,
        quoteSeq: quoteKey?.seq ?? null,
        salesOrderId,
        productId: v.productId ? Number(v.productId) : null,
        description: trimOrNull(v.description),
        status: "PENDING",
      },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "design_requests",
      recordId: requestNumber,
      after: {
        trigger: v.trigger,
        quoteNumber,
        salesOrderId,
        productId: v.productId ? Number(v.productId) : null,
        description: trimOrNull(v.description),
        status: "PENDING",
      },
    });
    revalidate();
    return actionOk({ number: requestNumber });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "設計依頼書の作成に失敗しました"));
  }
}

/** 更新 — 未着手・進行中のみ（製品・依頼内容。トリガ・参照元は変更不可）。 */
export async function updateDesignRequest(
  number: string,
  payload: DesignRequestUpdateInput,
): Promise<ActionResult<{ number: string }>> {
  const parsed = updateInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const authz = await checkPermission("design_request", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const v = parsed.data;
  try {
    const prior = await prisma.designRequest.findUnique({
      where: { requestNumber: number },
      select: { productId: true, description: true },
    });
    // status を where に含めた updateMany で原子的にガードする。
    const updated = await prisma.designRequest.updateMany({
      where: {
        requestNumber: number,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      data: {
        productId: v.productId ? Number(v.productId) : null,
        description: trimOrNull(v.description),
      },
    });
    if (updated.count === 0) {
      return actionError("未着手・進行中の設計依頼書のみ編集できます");
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "design_requests",
      recordId: number,
      before: prior
        ? { productId: prior.productId, description: prior.description }
        : undefined,
      after: {
        productId: v.productId ? Number(v.productId) : null,
        description: trimOrNull(v.description),
      },
    });
    revalidate(number);
    return actionOk({ number });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "設計依頼書の更新に失敗しました"));
  }
}

/** 着手 (PENDING → IN_PROGRESS)。 */
export async function startDesign(number: string): Promise<ActionResult> {
  const authz = await checkPermission("design_request", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const updated = await prisma.designRequest.updateMany({
      where: { requestNumber: number, status: "PENDING" },
      data: { status: "IN_PROGRESS" },
    });
    if (updated.count === 0) {
      return actionError("未着手の設計依頼書のみ着手できます");
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "design_requests",
      recordId: number,
      before: { status: "PENDING" },
      after: { status: "IN_PROGRESS" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "着手に失敗しました"));
  }
}

/** 完了 (IN_PROGRESS → COMPLETED)。completedAt を記録する。 */
export async function completeDesign(number: string): Promise<ActionResult> {
  const authz = await checkPermission("design_request", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    // 完了には設計ファイルの添付が必須（監査 P2-3 — dead-end 解消）
    const { listAttachments } = await import("@/lib/attachments");
    const attachments = await listAttachments("design_requests", number);
    if (attachments.length === 0) {
      return actionError("設計ファイルを添付してから完了してください");
    }
    const latest = attachments[0]; // listAttachments は新しい順

    const request = await prisma.designRequest.findUnique({
      where: { requestNumber: number },
      select: { id: true, productId: true },
    });
    if (!request) return actionError("対象の設計依頼書が見つかりません");

    const updated = await prisma.designRequest.updateMany({
      where: { requestNumber: number, status: "IN_PROGRESS" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    if (updated.count === 0) {
      return actionError("進行中の設計依頼書のみ完了できます");
    }

    // design_files へバージョン登録し、製品マスタの最新設計を更新
    const { getCurrentActorId } = await import("@/lib/audit");
    const actor = await getCurrentActorId();
    await prisma.$transaction(async (tx) => {
      const prev = await tx.designFile.aggregate({
        _max: { version: true },
        where: { designRequestId: request.id },
      });
      const version = (prev._max.version ?? 0) + 1;
      await tx.designFile.updateMany({
        where: { designRequestId: request.id, isLatest: true },
        data: { isLatest: false },
      });
      // 製品との紐付けは design_files.product_id + is_latest（製品側の
      // 最新設計は designFiles(isLatest) で参照する — カラム二重化しない）
      if (request.productId != null) {
        await tx.designFile.updateMany({
          where: { productId: request.productId, isLatest: true },
          data: { isLatest: false },
        });
      }
      await tx.designFile.create({
        data: {
          designRequestId: request.id,
          productId: request.productId,
          fileId: latest.fileId,
          version,
          isLatest: true,
          createdBy: actor,
        },
      });
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "design_requests",
      recordId: number,
      before: { status: "IN_PROGRESS" },
      after: {
        status: "COMPLETED",
        note: `設計ファイル登録（${latest.filename}）${request.productId != null ? " + 製品の最新設計を更新" : ""}`,
      },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "完了に失敗しました"));
  }
}

/** 差し戻し (COMPLETED → IN_PROGRESS)。completedAt をクリアする。 */
export async function reopenDesign(number: string): Promise<ActionResult> {
  const authz = await checkPermission("design_request", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const updated = await prisma.designRequest.updateMany({
      where: { requestNumber: number, status: "COMPLETED" },
      data: { status: "IN_PROGRESS", completedAt: null },
    });
    if (updated.count === 0) {
      return actionError("完了済みの設計依頼書のみ差し戻しできます");
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "design_requests",
      recordId: number,
      before: { status: "COMPLETED" },
      after: { status: "IN_PROGRESS" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "差し戻しに失敗しました"));
  }
}
