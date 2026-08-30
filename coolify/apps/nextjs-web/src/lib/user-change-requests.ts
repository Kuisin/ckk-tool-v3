import "server-only";

/**
 * user-change-requests.ts — ユーザー変更依頼（方式 B）の適用と決裁。server-only.
 *
 * ■ 「適用」は列を書き換えるのではなく、通常の変更処理を通す
 * 申請から承認までの間に前提は動く。既に停止されている、拠点が消えている、
 * 対象が最後の管理者になっている——そういうときに列を直接上書きすると、
 * 古い前提のまま当ててしまう。だから適用も canSuspend / canRestore / 拠点の
 * 実在確認を最初から通し、通らなければ **適用せず apply_error に理由を残す**。
 * work_order_flow_changes が同じ問題を同じやり方で解いている。
 *
 * ■ 直接実行と依頼が同じ関数を呼ぶ
 * 管理者は素通しで applyX() を直接呼び、それ以外は依頼を出して承認時に同じ
 * applyX() が呼ばれる。2 つの経路で挙動が割れないように、変更の本体はここ 1 箇所。
 */

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { checkPermission, sessionUserId } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import {
  suspendPayloadSchema,
  USER_CHANGE_LABEL,
  type UserChangeKind,
  updatePlantsPayloadSchema,
  validatePayload,
} from "@/lib/user-change-core";
import {
  canRestore,
  canSuspend,
  resolveDisabledUntil,
} from "@/lib/user-suspension-core";
import { getAdminCoverage } from "@/lib/users-admin";

const BASE_PATH = "/settings/users";
const PRIV_PATH = "/settings/privileged-access";

/** 変更の権限コード。方式 B なので昇格（時限付与）は使わない。 */
export const USER_ADMIN_CODE = "user_admin";

export interface ApplyResult {
  ok: boolean;
  error?: string;
}

// ─── 適用の本体（直接実行・承認後の適用の両方がここを通る）─────────────────

async function applySuspend(
  actorId: string,
  targetUserId: string,
  payload: unknown,
): Promise<ApplyResult> {
  const parsed = suspendPayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "依頼内容が不正です" };
  const v = parsed.data;

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, username: true, isActive: true, disabledUntil: true },
  });
  if (!target) return { ok: false, error: "対象のユーザーが見つかりません" };

  // 申請時ではなく **適用時** の状況で判定する（間に状況が変わっている）。
  const coverage = await getAdminCoverage(target.id);
  const decision = canSuspend(
    {
      id: target.id,
      username: target.username,
      isActive: target.isActive,
      disabledUntil: target.disabledUntil,
    },
    { actorId, ...coverage },
  );
  if (!decision.ok) {
    return { ok: false, error: decision.message ?? "停止できません" };
  }

  const until = resolveDisabledUntil(
    v.kind,
    v.until ? new Date(v.until) : null,
    new Date(),
  );
  if (!until.ok) return { ok: false, error: until.message };

  await prisma.user.update({
    where: { id: target.id },
    data: {
      isActive: false,
      disabledUntil: until.value,
      disabledReason: v.disabledReason?.length ? v.disabledReason : null,
      disabledAt: new Date(),
      disabledById: actorId,
    },
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "users",
    recordId: target.id,
    before: { username: target.username, isActive: true },
    after: {
      username: target.username,
      isActive: false,
      disabledUntil: until.value?.toISOString() ?? null,
      disabledReason: v.disabledReason ?? null,
    },
  });
  return { ok: true };
}

async function applyRestore(
  _actorId: string,
  targetUserId: string,
): Promise<ApplyResult> {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, username: true, isActive: true, disabledUntil: true },
  });
  if (!target) return { ok: false, error: "対象のユーザーが見つかりません" };

  const decision = canRestore({
    id: target.id,
    username: target.username,
    isActive: target.isActive,
    disabledUntil: target.disabledUntil,
  });
  if (!decision.ok) {
    return { ok: false, error: decision.message ?? "復帰できません" };
  }

  await prisma.user.update({
    where: { id: target.id },
    data: {
      isActive: true,
      disabledUntil: null,
      disabledReason: null,
      disabledAt: null,
      disabledById: null,
    },
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "users",
    recordId: target.id,
    before: { username: target.username, isActive: false },
    after: { username: target.username, isActive: true },
  });
  return { ok: true };
}

async function applyUpdatePlants(
  actorId: string,
  targetUserId: string,
  payload: unknown,
): Promise<ApplyResult> {
  const parsed = updatePlantsPayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "依頼内容が不正です" };

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!user) return { ok: false, error: "対象のユーザーが見つかりません" };

  const requested = [...new Set(parsed.data.plantIds)];
  // 申請から承認までの間に拠点が消えていることがある。ここで実在を見て、
  // 消えていれば適用せずに失敗として残す（黙って外さない）。
  const plants = await prisma.plant.findMany({
    where: { id: { in: requested } },
    select: { id: true },
  });
  if (plants.length !== requested.length) {
    const missing = requested.filter((id) => !plants.some((p) => p.id === id));
    return {
      ok: false,
      error: `存在しない拠点が含まれています（#${missing.join(", #")}）`,
    };
  }

  const current = await prisma.userPlant.findMany({
    where: { userId: targetUserId },
    select: { plantId: true },
  });
  const currentIds = current.map((r) => r.plantId);
  const currentSet = new Set(currentIds);
  const requestedSet = new Set(requested);
  const toCreate = requested.filter((id) => !currentSet.has(id));
  const toDelete = currentIds.filter((id) => !requestedSet.has(id));
  if (toCreate.length === 0 && toDelete.length === 0) return { ok: true };

  await prisma.$transaction([
    ...(toDelete.length
      ? [
          prisma.userPlant.deleteMany({
            where: { userId: targetUserId, plantId: { in: toDelete } },
          }),
        ]
      : []),
    ...(toCreate.length
      ? [
          prisma.userPlant.createMany({
            data: toCreate.map((plantId) => ({
              userId: targetUserId,
              plantId,
              assignedBy: actorId,
            })),
          }),
        ]
      : []),
  ]);

  await recordAudit({
    action: "UPDATE",
    tableName: "user_plants",
    recordId: targetUserId,
    before: { plantIds: currentIds.sort((a, b) => a - b) },
    after: { plantIds: [...requested].sort((a, b) => a - b) },
  });
  return { ok: true };
}

/** kind → 適用。直接実行と承認後の適用が共有する唯一の入口。 */
export async function applyUserChange(
  kind: UserChangeKind,
  actorId: string,
  targetUserId: string,
  payload: unknown,
): Promise<ApplyResult> {
  switch (kind) {
    case "SUSPEND":
      return applySuspend(actorId, targetUserId, payload);
    case "RESTORE":
      return applyRestore(actorId, targetUserId);
    case "UPDATE_PLANTS":
      return applyUpdatePlants(actorId, targetUserId, payload);
  }
}

// ─── 依頼の作成・決裁 ───────────────────────────────────────────────────────

/**
 * 変更依頼を出す。
 *
 * 自分自身への依頼は DB の CHECK でも禁止しているが、ここで先に弾いて
 * 読める理由を返す（制約違反のメッセージを利用者に見せないため）。
 */
export async function createUserChangeRequest(input: {
  kind: UserChangeKind;
  targetUserId: string;
  payload: unknown;
  reason: string;
}): Promise<ActionResult<{ id: string }>> {
  const authz = await checkPermission(USER_ADMIN_CODE, "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const actorId = await sessionUserId();
  if (!actorId) return actionError("操作者を特定できません");

  if (actorId === input.targetUserId) {
    return actionError("自分自身への変更は依頼できません");
  }
  if (!input.reason.trim()) return actionError("理由を入力してください");

  const invalid = validatePayload(input.kind, input.payload);
  if (invalid) return actionError(invalid);

  const target = await prisma.user.findUnique({
    where: { id: input.targetUserId },
    select: { id: true, username: true },
  });
  if (!target) return actionError("対象のユーザーが見つかりません");

  try {
    const row = await prisma.userChangeRequest.create({
      data: {
        kind: input.kind,
        targetUserId: input.targetUserId,
        payload: input.payload as object,
        reason: input.reason.trim(),
        requestedBy: actorId,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "user_change_requests",
      recordId: row.id,
      after: {
        kind: input.kind,
        targetUser: target.username,
        reason: input.reason.trim(),
      },
    });
    revalidatePath(PRIV_PATH);
    revalidatePath(`${BASE_PATH}/${input.targetUserId}`);
    return actionOk({ id: row.id });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return actionError(
        `この利用者への「${USER_CHANGE_LABEL[input.kind]}」は既に承認依頼中です`,
      );
    }
    return actionError(prismaErrorMessage(e, "変更依頼の作成に失敗しました"));
  }
}

/**
 * 承認して**適用する**。
 *
 * 適用に失敗しても依頼は APPROVED のまま apply_error を持たせる — 「承認は
 * されたが当てられなかった」は差し戻しとは別の事実で、画面もそう出す。
 * ここで REJECTED に倒すと、承認者が却下したように見えてしまう。
 */
export async function approveUserChangeRequest(
  id: string,
  comment?: string,
): Promise<ActionResult<{ applied: boolean; error?: string }>> {
  const authz = await checkPermission(USER_ADMIN_CODE, "APPROVE");
  if (!authz.ok) return actionError(authz.error);
  const actorId = await sessionUserId();
  if (!actorId) return actionError("操作者を特定できません");

  const req = await prisma.userChangeRequest.findUnique({ where: { id } });
  if (!req) return actionError("対象の依頼が見つかりません");
  if (req.status !== "PENDING") return actionError("この依頼は決裁済みです");
  // 申請と承認は別の人でなければならない（これがこの機能の本体）。
  if (req.requestedBy === actorId) {
    return actionError("自分が出した依頼は承認できません");
  }

  const applied = await applyUserChange(
    req.kind,
    actorId,
    req.targetUserId,
    req.payload,
  );

  await prisma.userChangeRequest.update({
    where: { id },
    data: {
      status: "APPROVED",
      decidedBy: actorId,
      decidedAt: new Date(),
      decisionComment: comment?.trim() || null,
      appliedAt: applied.ok ? new Date() : null,
      applyError: applied.ok ? null : (applied.error ?? "適用に失敗しました"),
    },
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "user_change_requests",
    recordId: id,
    before: { status: "PENDING" },
    after: {
      status: "APPROVED",
      applied: applied.ok,
      applyError: applied.ok ? null : applied.error,
    },
  });
  revalidatePath(PRIV_PATH);
  revalidatePath(BASE_PATH);
  revalidatePath(`${BASE_PATH}/${req.targetUserId}`);
  return actionOk({ applied: applied.ok, error: applied.error });
}

export async function rejectUserChangeRequest(
  id: string,
  reason: string,
): Promise<ActionResult> {
  const authz = await checkPermission(USER_ADMIN_CODE, "APPROVE");
  if (!authz.ok) return actionError(authz.error);
  const actorId = await sessionUserId();
  if (!actorId) return actionError("操作者を特定できません");
  if (!reason.trim()) return actionError("差し戻しの理由を入力してください");

  const req = await prisma.userChangeRequest.findUnique({ where: { id } });
  if (!req) return actionError("対象の依頼が見つかりません");
  if (req.status !== "PENDING") return actionError("この依頼は決裁済みです");
  if (req.requestedBy === actorId) {
    return actionError("自分が出した依頼は決裁できません");
  }

  await prisma.userChangeRequest.update({
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
    tableName: "user_change_requests",
    recordId: id,
    before: { status: "PENDING" },
    after: { status: "REJECTED", reason: reason.trim() },
  });
  revalidatePath(PRIV_PATH);
  return actionOk();
}

/** 申請者が取り下げる。決裁前のみ。 */
export async function cancelUserChangeRequest(
  id: string,
): Promise<ActionResult> {
  const actorId = await sessionUserId();
  if (!actorId) return actionError("操作者を特定できません");

  const req = await prisma.userChangeRequest.findUnique({ where: { id } });
  if (!req) return actionError("対象の依頼が見つかりません");
  if (req.requestedBy !== actorId) {
    return actionError("自分が出した依頼だけ取り下げられます");
  }
  if (req.status !== "PENDING") return actionError("この依頼は決裁済みです");

  await prisma.userChangeRequest.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "user_change_requests",
    recordId: id,
    before: { status: "PENDING" },
    after: { status: "CANCELLED" },
  });
  revalidatePath(PRIV_PATH);
  return actionOk();
}
