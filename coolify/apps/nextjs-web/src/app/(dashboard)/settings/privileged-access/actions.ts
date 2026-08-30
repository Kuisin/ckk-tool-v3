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

const requestSchema = z.object({
  code: z.enum(ELEVATION_CODES),
  operations: z
    .array(z.string().min(1))
    .min(1, "操作を 1 つ以上選んでください"),
  reason: z.string().trim().min(1, "理由を入力してください").max(1000),
  windowStartsAt: z.string().min(1, "開始日時を指定してください"),
  windowEndsAt: z.string().min(1, "終了日時を指定してください"),
  durationMinutes: z.number().int(),
});

export type PrivilegedRequestInput = z.infer<typeof requestSchema>;

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
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;

  const userId = await sessionUserId();
  if (!userId) return actionError("ログインが必要です");

  const ops = [...new Set(v.operations)];
  for (const key of ops) {
    const op = findOperation(key);
    if (!op) return actionError(`未知の操作が含まれています（${key}）`);
    if (op.code !== v.code) {
      return actionError(
        `1 件の申請に複数の権限を混ぜられません（${op.label.ja}）`,
      );
    }
    const authz = await checkPermission(op.code, op.action);
    if (!authz.ok) {
      return actionError(`この操作は申請できません（${op.label.ja}）`);
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
        "この権限の申請は既に承認依頼中です（決裁されてから次を出してください）",
      );
    }
    return actionError(prismaErrorMessage(e, "申請の作成に失敗しました"));
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
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  const actorId = await sessionUserId();
  if (!actorId) return actionError("操作者を特定できません");

  const req = await prisma.privilegedAccessRequest.findUnique({
    where: { id: v.id },
    include: { operations: { select: { operation: true } } },
  });
  if (!req) return actionError("対象の申請が見つかりません");
  if (req.status !== "PENDING") return actionError("この申請は決裁済みです");

  const authz = await checkPermission(req.code, "APPROVE");
  if (!authz.ok) {
    return actionError(`この申請を承認する権限がありません（${req.code}）`);
  }
  if (req.requestedBy === actorId) {
    return actionError("自分が出した申請は承認できません");
  }

  const requested = new Set(req.operations.map((o) => o.operation));
  const granted = [...new Set(v.grantedOperations)];
  const stray = granted.find((k) => !requested.has(k));
  if (stray) {
    return actionError(
      `申請に含まれていない操作は許可できません（${operationLabel(stray)}）`,
    );
  }
  if (granted.length === 0) {
    return actionError(
      "許可する操作を 1 つ以上選んでください（すべて外す場合は差し戻してください）",
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
  const actorId = await sessionUserId();
  if (!actorId) return actionError("操作者を特定できません");
  if (!reason.trim()) return actionError("差し戻しの理由を入力してください");

  const req = await prisma.privilegedAccessRequest.findUnique({
    where: { id },
  });
  if (!req) return actionError("対象の申請が見つかりません");
  if (req.status !== "PENDING") return actionError("この申請は決裁済みです");

  const authz = await checkPermission(req.code, "APPROVE");
  if (!authz.ok) return actionError("この申請を決裁する権限がありません");
  if (req.requestedBy === actorId) {
    return actionError("自分が出した申請は決裁できません");
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
  const actorId = await sessionUserId();
  if (!actorId) return actionError("操作者を特定できません");
  if (!reason.trim()) return actionError("取り消しの理由を入力してください");

  const req = await prisma.privilegedAccessRequest.findUnique({
    where: { id },
  });
  if (!req) return actionError("対象の申請が見つかりません");
  if (req.status !== "APPROVED") {
    return actionError("有効な付与だけ取り消せます");
  }
  const authz = await checkPermission(req.code, "APPROVE");
  if (!authz.ok) return actionError("この付与を取り消す権限がありません");

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
  const actorId = await sessionUserId();
  if (!actorId) return actionError("操作者を特定できません");

  const req = await prisma.privilegedAccessRequest.findUnique({
    where: { id },
  });
  if (!req) return actionError("対象の申請が見つかりません");
  if (req.requestedBy !== actorId) {
    return actionError("自分が出した申請だけ取り下げられます");
  }
  if (req.status !== "PENDING") return actionError("この申請は決裁済みです");

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
