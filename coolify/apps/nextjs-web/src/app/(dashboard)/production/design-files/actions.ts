"use server";

/**
 * Server Actions — 製品の設計図の版 (MS24 関連タブ)。
 *
 * 版を **作る**のは Route Handler (/api/design-files/upload) の仕事
 * （Server Action のボディは 1MB で頭打ちになり、図面は普通に超える）。
 * ここはファイルを伴わない操作 — メモの編集と削除だけ。
 *
 * 可否の判定は lib/design-files-core が唯一の定義元で、**画面と同じ関数を
 * サーバー側でも通す**（UI のガードを飾りにしない）。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  canDeleteDesignFile,
  canEditDesignFile,
  describeLock,
} from "@/lib/design-files-core";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { deleteObject } from "@/lib/storage";

const BASE_PATH = "/master/products";

const notesInput = z.object({
  id: z.string().uuid(),
  notes: z.string().max(2000).nullable(),
});

/** 版の現在の状態 + 使用中か（可否判定に要るものだけ）。 */
async function loadRow(id: string) {
  return prisma.designFile.findUnique({
    where: { id },
    select: {
      id: true,
      productId: true,
      version: true,
      designRequestId: true,
      file: { select: { id: true, storageKey: true } },
      _count: { select: { workOrders: true } },
    },
  });
}

export async function updateDesignFileNotes(
  input: z.input<typeof notesInput>,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("design_file", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = notesInput.safeParse(input);
  if (!parsed.success) return actionError(tr("common.invalidInput"));

  try {
    const row = await loadRow(parsed.data.id);
    if (!row) return actionError(tr("production.designFileActions.notFound"));
    const state = {
      usedByWorkOrder: row._count.workOrders > 0,
      designRequestId: row.designRequestId,
    };
    if (!canEditDesignFile(state)) {
      return actionError(
        describeLock(state) ?? tr("production.designFileActions.cannotEdit"),
      );
    }
    await prisma.designFile.update({
      where: { id: row.id },
      data: { notes: parsed.data.notes?.trim() || null },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "design_files",
      recordId: row.id,
      after: {
        note: tr("production.designFileActions.memoUpdatedAudit", {
          version: row.version,
        }),
      },
    });
    if (row.productId != null) revalidatePath(`${BASE_PATH}/${row.productId}`);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotUpdate"), tr));
  }
}

/**
 * 版のファイルを 1 枚消す。
 *
 * 消せるのは**手動で足した版**だけで、依頼から出来た版は残す（完了した
 * 設計依頼の成果物そのもので、消すと依頼側が成果物を失う）。指示書が
 * 指している版も消せない。
 *
 * 最後の 1 枚を消しても版そのものは畳まない — is_latest の付け替えは
 * 「新しい版を作る」ときだけの操作にしておく方が、状態の動く場所が減る。
 */
export async function deleteDesignFile(id: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("design_file", "DELETE");
  if (!authz.ok) return actionError(authz.error);

  try {
    const row = await loadRow(id);
    if (!row) return actionError(tr("production.designFileActions.notFound"));
    const state = {
      usedByWorkOrder: row._count.workOrders > 0,
      designRequestId: row.designRequestId,
    };
    if (!canDeleteDesignFile(state)) {
      return actionError(
        describeLock(state) ?? tr("production.designFileActions.cannotDelete"),
      );
    }
    // 改訂依頼が「元図面」に指している版は消せない（参照が切れる）。
    const referenced = await prisma.designRequest.count({
      where: { baseDesignFileId: row.id },
    });
    if (referenced > 0) {
      return actionError(
        tr("production.designFileActions.referencedByRevisionRequest"),
      );
    }

    const storageKey = row.file.storageKey;
    await prisma.$transaction(async (tx) => {
      await tx.designFile.delete({ where: { id: row.id } });
      await tx.file.delete({ where: { id: row.file.id } });
    });
    // storage は best-effort（消し損ねてもデータの筋は通っている）。
    await deleteObject(storageKey);

    await recordAudit({
      action: "DELETE",
      tableName: "design_files",
      recordId: row.id,
      before: {
        note: tr("production.designFileActions.deletedAudit", {
          version: row.version,
        }),
      },
    });
    if (row.productId != null) revalidatePath(`${BASE_PATH}/${row.productId}`);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotDelete"), tr));
  }
}
