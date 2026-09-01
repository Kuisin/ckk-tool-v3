"use server";

/**
 * Server Actions — 特権アクセス（SY0G）。
 *
 * 方式 A（時限昇格）の申請と決裁。方式 B（ユーザー変更依頼）の決裁は
 * lib/user-change-requests.ts が持ち、ここからは再輸出するだけ
 * （画面は 1 つでも、変更の適用処理はユーザー管理側に置いておきたいため）。
 *
 * 決裁の 2 大原則、どちらもここで守る:
 *   ① 申請者 ≠ 承認者（DB では表現できないのでアプリ側で必ず見る）
 *   ② 承認できるのは <code>:APPROVE を持つ人だけ
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission, sessionUserId } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { validateRequestWindow } from "@/lib/privileged-access-core";
import {
  ELEVATION_CODES,
  findOperation,
  operationLabel,
} from "@/lib/privileged-operations";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

import {
  approveUserChangeRequest as approveUserChange,
  cancelUserChangeRequest as cancelUserChange,
  rejectUserChangeRequest as rejectUserChange,
} from "@/lib/user-change-requests";

const BASE_PATH = "/settings/privileged-access";

// 方式 B（ユーザー変更依頼）の決裁。実装は lib/user-change-requests.ts —
// 変更の適用処理はユーザー管理側に置いておきたいので、ここは薄い入口だけ。
// **再輸出ではなく関数で包む**: "use server" ファイルは async 関数しか export
// できない（scripts/check-use-server-exports.sh が CI で見ている）。
export async function approveUserChangeRequest(id: string, comment?: string) {
  return approveUserChange(id, comment);
}

export async function rejectUserChangeRequest(id: string, reason: string) {
  return rejectUserChange(id, reason);
}

export async function cancelUserChangeRequest(id: string) {
  return cancelUserChange(id);
}

function requestSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    code: z.enum(ELEVATION_CODES),
    operations: z
      .array(z.string().min(1))
      .min(1, tr("settings.privileged.selectAtLeastOneOperation")),
    reason: z.string().trim().min(1, tr("common.enterAReason2")).max(1000),
    windowStartsAt: z
      .string()
      .min(1, tr("settings.privilegedAccessActions.specifyStartDateTime")),
    windowEndsAt: z
      .string()
      .min(1, tr("settings.privilegedAccessActions.specifyEndDateTime")),
    durationMinutes: z.number().int(),
  });
}

export type PrivilegedRequestInput = z.infer<ReturnType<typeof requestSchema>>;

/**
 * 時限昇格を申請する。
 *
 * 選ばれた操作が **すべて** そのコードのもので、かつ申請者がそれぞれを申請できる
 * ことを確認する。1 つでも権限が無ければ申請ごと拒否する — 一部だけ黙って
 * 落とすと、承認された内容と申請したつもりの内容がずれる。
 */
export async function requestPrivilegedAccess(
  input: PrivilegedRequestInput,
): Promise<ActionResult<{ id: string }>> {
  const tr = await getTranslations();
  const parsed = requestSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;

  const userId = await sessionUserId();
  if (!userId) return actionError(tr("common.loginRequired"));

  const ops = [...new Set(v.operations)];
  for (const key of ops) {
    const op = findOperation(key);
    if (!op)
      return actionError(
        tr("settings.privilegedAccessActions.unknownOperation", { key }),
      );
    if (op.code !== v.code) {
      return actionError(
        tr("settings.privilegedAccessActions.mixedPermissionsInOneRequest", {
          label: op.label.ja,
        }),
      );
    }
    const authz = await checkPermission(op.code, op.action);
    if (!authz.ok) {
      return actionError(
        tr("settings.privilegedAccessActions.operationCannotBeRequested", {
          label: op.label.ja,
        }),
      );
    }
  }

  // 窓と有効時間の検証。DB の CHECK と同じ条件を、読める日本語で先に返す。
  const invalid = validateRequestWindow(
    {
      windowStartsAt: v.windowStartsAt,
      windowEndsAt: v.windowEndsAt,
      durationMinutes: v.durationMinutes,
    },
    new Date(),
  );
  if (invalid) return actionError(invalid);

  try {
    const row = await prisma.privilegedAccessRequest.create({
      data: {
        code: v.code,
        reason: v.reason,
        windowStartsAt: new Date(v.windowStartsAt),
        windowEndsAt: new Date(v.windowEndsAt),
        durationMinutes: v.durationMinutes,
        requestedBy: userId,
        operations: { create: ops.map((operation) => ({ operation })) },
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "privileged_access_requests",
      recordId: row.id,
      after: {
        code: v.code,
        operations: ops,
        reason: v.reason,
        windowStartsAt: v.windowStartsAt,
        windowEndsAt: v.windowEndsAt,
        durationMinutes: v.durationMinutes,
      },
    });
    revalidatePath(BASE_PATH);
    return actionOk({ id: row.id });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return actionError(
        tr("settings.privilegedAccessActions.alreadyPendingApproval"),
      );
    }
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.privilegedAccessActions.createRequestFailed"),
        tr,
      ),
    );
  }
}

const approveSchema = z.object({
  id: z.string().uuid(),
  grantedOperations: z.array(z.string().min(1)),
  comment: z.string().max(1000).optional(),
});

/**
 * 承認する。承認者は要求された操作の**一部だけ**を許可できる
 * （grantedOperations ⊆ 要求された操作）。
 *
 * 1 つも許可しないのは却下と同じ意味になるので拒否する — 「承認されたのに
 * 何もできない」付与を残すと、申請者は理由を探して時間を使う。
 */
export async function approvePrivilegedAccess(
  input: z.infer<typeof approveSchema>,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  const actorId = await sessionUserId();
  if (!actorId)
    return actionError(tr("settings.privilegedAccessActions.actorUnresolved"));

  const req = await prisma.privilegedAccessRequest.findUnique({
    where: { id: v.id },
    include: { operations: { select: { operation: true } } },
  });
  if (!req)
    return actionError(tr("settings.privilegedAccessActions.requestNotFound"));
  if (req.status !== "PENDING")
    return actionError(tr("settings.privilegedAccessActions.alreadyDecided"));

  const authz = await checkPermission(req.code, "APPROVE");
  if (!authz.ok) {
    return actionError(
      tr("settings.privilegedAccessActions.approvePermissionDenied", {
        code: req.code,
      }),
    );
  }
  if (req.requestedBy === actorId) {
    return actionError(
      tr("settings.privilegedAccessActions.cannotApproveOwnRequest"),
    );
  }

  const requested = new Set(req.operations.map((o) => o.operation));
  const granted = [...new Set(v.grantedOperations)];
  const stray = granted.find((k) => !requested.has(k));
  if (stray) {
    return actionError(
      tr("settings.privilegedAccessActions.operationNotInRequest", {
        label: operationLabel(stray),
      }),
    );
  }
  if (granted.length === 0) {
    return actionError(
      tr("settings.privilegedAccessActions.selectAtLeastOneOperationToGrant"),
    );
  }

  await prisma.$transaction([
    prisma.privilegedAccessRequestOperation.updateMany({
      where: { requestId: v.id },
      data: { granted: false },
    }),
    prisma.privilegedAccessRequestOperation.updateMany({
      where: { requestId: v.id, operation: { in: granted } },
      data: { granted: true },
    }),
    prisma.privilegedAccessRequest.update({
      where: { id: v.id },
      data: {
        status: "APPROVED",
        decidedBy: actorId,
        decidedAt: new Date(),
        decisionComment: v.comment?.trim() || null,
      },
    }),
  ]);

  await recordAudit({
    action: "UPDATE",
    tableName: "privileged_access_requests",
    recordId: v.id,
    before: { status: "PENDING", requested: [...requested] },
    after: { status: "APPROVED", granted },
  });
  revalidatePath(BASE_PATH);
  return actionOk();
}

export async function rejectPrivilegedAccess(
  id: string,
  reason: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const actorId = await sessionUserId();
  if (!actorId)
    return actionError(tr("settings.privilegedAccessActions.actorUnresolved"));
  if (!reason.trim())
    return actionError(tr("general.documentActions.rejectReasonRequired"));

  const req = await prisma.privilegedAccessRequest.findUnique({
    where: { id },
  });
  if (!req)
    return actionError(tr("settings.privilegedAccessActions.requestNotFound"));
  if (req.status !== "PENDING")
    return actionError(tr("settings.privilegedAccessActions.alreadyDecided"));

  const authz = await checkPermission(req.code, "APPROVE");
  if (!authz.ok)
    return actionError(
      tr("settings.privilegedAccessActions.decidePermissionDenied"),
    );
  if (req.requestedBy === actorId) {
    return actionError(
      tr("settings.privilegedAccessActions.cannotDecideOwnRequest"),
    );
  }

  await prisma.privilegedAccessRequest.update({
    where: { id },
    data: {
      status: "REJECTED",
      decidedBy: actorId,
      decidedAt: new Date(),
      decisionComment: reason.trim(),
    },
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "privileged_access_requests",
    recordId: id,
    before: { status: "PENDING" },
    after: { status: "REJECTED", reason: reason.trim() },
  });
  revalidatePath(BASE_PATH);
  return actionOk();
}

/**
 * 有効な付与を打ち切る。承認者が「やっぱり止める」を即座にできるようにする。
 * 期限切れを待たせない — 打ち切りの必要があるときはたいてい急いでいる。
 */
export async function revokePrivilegedAccess(
  id: string,
  reason: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const actorId = await sessionUserId();
  if (!actorId)
    return actionError(tr("settings.privilegedAccessActions.actorUnresolved"));
  if (!reason.trim())
    return actionError(
      tr("settings.privilegedAccessActions.revokeReasonRequired"),
    );

  const req = await prisma.privilegedAccessRequest.findUnique({
    where: { id },
  });
  if (!req)
    return actionError(tr("settings.privilegedAccessActions.requestNotFound"));
  if (req.status !== "APPROVED") {
    return actionError(
      tr("settings.privilegedAccessActions.onlyActiveGrantsCanBeRevoked"),
    );
  }
  const authz = await checkPermission(req.code, "APPROVE");
  if (!authz.ok)
    return actionError(
      tr("settings.privilegedAccessActions.revokePermissionDenied"),
    );

  await prisma.privilegedAccessRequest.update({
    where: { id },
    data: {
      status: "REVOKED",
      revokedBy: actorId,
      revokedAt: new Date(),
      revokeReason: reason.trim(),
    },
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "privileged_access_requests",
    recordId: id,
    before: { status: "APPROVED" },
    after: { status: "REVOKED", reason: reason.trim() },
  });
  revalidatePath(BASE_PATH);
  return actionOk();
}

/** 申請者が取り下げる。決裁前のみ。 */
export async function cancelPrivilegedAccess(
  id: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const actorId = await sessionUserId();
  if (!actorId)
    return actionError(tr("settings.privilegedAccessActions.actorUnresolved"));

  const req = await prisma.privilegedAccessRequest.findUnique({
    where: { id },
  });
  if (!req)
    return actionError(tr("settings.privilegedAccessActions.requestNotFound"));
  if (req.requestedBy !== actorId) {
    return actionError(
      tr("settings.privilegedAccessActions.canOnlyCancelOwnRequest"),
    );
  }
  if (req.status !== "PENDING")
    return actionError(tr("settings.privilegedAccessActions.alreadyDecided"));

  await prisma.privilegedAccessRequest.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "privileged_access_requests",
    recordId: id,
    before: { status: "PENDING" },
    after: { status: "CANCELLED" },
  });
  revalidatePath(BASE_PATH);
  return actionOk();
}
