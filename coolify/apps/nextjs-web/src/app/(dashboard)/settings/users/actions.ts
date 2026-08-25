"use server";

/**
 * Server Actions — ユーザー管理（SY01）の所属拠点（user_plants）更新。
 *
 * user_plants は PLANT/REGION スコープ解決の基盤（@ckk/authz-core
 * loadScopeContext）。編集は system:ADMIN のみ。差分適用
 * （追加行は assignedBy = 操作者、削除行は物理削除）。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission, sessionUserId } from "@/lib/authz";
import {
  BOOTSTRAP_ADMIN_USERNAME,
  bootstrapAdminState,
} from "@/lib/bootstrap-admin-core";
import { prisma } from "@/lib/db";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import {
  canRestore,
  canSuspend,
  resolveDisabledUntil,
} from "@/lib/user-suspension-core";
import { getAdminCoverage, getBootstrapAdminSnapshot } from "@/lib/users-admin";

const BASE_PATH = "/settings/users";

const input = z.object({
  userId: z.string().uuid("ユーザー ID が不正です"),
  plantIds: z.array(z.number().int().positive()),
});

export async function updateUserPlants(
  userId: string,
  plantIds: number[],
): Promise<ActionResult> {
  const authz = await checkPermission("system", "ADMIN");
  if (!authz.ok) return actionError(authz.error);
  const parsed = input.safeParse({ userId, plantIds });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const user = await prisma.user.findUnique({
      where: { id: v.userId },
      select: { id: true },
    });
    if (!user) return actionError("対象のユーザーが見つかりません");

    const requested = [...new Set(v.plantIds)];
    const plants = await prisma.plant.findMany({
      where: { id: { in: requested } },
      select: { id: true },
    });
    if (plants.length !== requested.length) {
      return actionError("存在しない拠点が含まれています");
    }

    const current = await prisma.userPlant.findMany({
      where: { userId: v.userId },
      select: { plantId: true },
    });
    const currentIds = current.map((r) => r.plantId);
    const currentSet = new Set(currentIds);
    const requestedSet = new Set(requested);
    const toCreate = requested.filter((id) => !currentSet.has(id));
    const toDelete = currentIds.filter((id) => !requestedSet.has(id));
    if (toCreate.length === 0 && toDelete.length === 0) return actionOk();

    await prisma.$transaction([
      ...(toDelete.length
        ? [
            prisma.userPlant.deleteMany({
              where: { userId: v.userId, plantId: { in: toDelete } },
            }),
          ]
        : []),
      ...(toCreate.length
        ? [
            prisma.userPlant.createMany({
              data: toCreate.map((plantId) => ({
                userId: v.userId,
                plantId,
                assignedBy: authz.userId,
              })),
            }),
          ]
        : []),
    ]);

    await recordAudit({
      action: "UPDATE",
      tableName: "user_plants",
      recordId: v.userId,
      before: { plantIds: currentIds.sort((a, b) => a - b) },
      after: { plantIds: [...requested].sort((a, b) => a - b) },
    });
    revalidatePath(BASE_PATH);
    revalidatePath(`${BASE_PATH}/${v.userId}`);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "所属拠点の更新に失敗しました"));
  }
}

/**
 * 初期管理者（ローカル `admin`）を無効化する。
 *
 * 立ち上げ用の踏み台なので、実運用の管理者ができたら畳むのが正しい終わり方。
 * ただし **最後の管理者を消させない** — ロールを付与する画面が無いので、
 * 管理者が居ない DB は psql でしか復旧できない。
 *
 * 可否の判定は bootstrapAdminState（純関数）に集約してあり、画面のボタンの活性も
 * 同じ関数の結果を見る。ここで読み直して再判定するのは画面を信用しないため —
 * Server Action を直接叩かれても同じ結論になるようにしておく。
 */
export async function disableBootstrapAdmin(): Promise<ActionResult> {
  const authz = await checkPermission("system", "ADMIN");
  if (!authz.ok) return actionError(authz.error);

  try {
    const snap = await getBootstrapAdminSnapshot();
    if (!snap) return actionError("初期管理者アカウントが見つかりません");

    const state = bootstrapAdminState({
      username: BOOTSTRAP_ADMIN_USERNAME,
      isActive: snap.isActive,
      passwordChangeRequired: snap.passwordChangeRequired,
      otherActiveAdminCount: snap.otherActiveAdminCount,
    });
    if (!state.canDisable) {
      return actionError(state.message ?? "この操作はいま実行できません");
    }

    await prisma.user.update({
      where: { id: snap.id },
      data: { isActive: false },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "users",
      recordId: snap.id,
      before: { username: BOOTSTRAP_ADMIN_USERNAME, isActive: true },
      after: { username: BOOTSTRAP_ADMIN_USERNAME, isActive: false },
    });
    revalidatePath(BASE_PATH);
    revalidatePath(`${BASE_PATH}/${snap.id}`);
    return actionOk(undefined);
  } catch (e) {
    return actionError(prismaErrorMessage(e, "無効化に失敗しました"));
  }
}

const suspendInput = z.object({
  userId: z.string().uuid("ユーザー ID が不正です"),
  kind: z.enum(["temporary", "permanent"]),
  /** 一時停止の解除予定（ISO）。恒久なら null。 */
  until: z.string().datetime({ offset: true }).nullable(),
  reason: z.string().trim().max(500, "理由は 500 文字までです").optional(),
});

/**
 * ユーザーを利用停止にする（一時 / 恒久）。
 *
 * 停止の実体は `is_active = false` — 権限ビューも認証も既にこれを見ているので、
 * ゲートを増やさない。`disabled_until` は「いつ戻すか」だけを持ち、期限が来たら
 * pg_cron（sql/user-suspension-cron.sql）が戻す。
 *
 * ガードは user-suspension-core の純関数に集約（画面のボタン活性と同じ関数）。
 * ここで DB から読み直して再判定するのは、画面を信用しないため。
 */
export async function suspendUser(input: {
  userId: string;
  kind: "temporary" | "permanent";
  until: string | null;
  reason?: string;
}): Promise<ActionResult> {
  const authz = await checkPermission("system", "ADMIN");
  if (!authz.ok) return actionError(authz.error);
  const parsed = suspendInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;

  const actorId = await sessionUserId();
  if (!actorId) return actionError("操作者を特定できません");

  try {
    const target = await prisma.user.findUnique({
      where: { id: v.userId },
      select: { id: true, username: true, isActive: true, disabledUntil: true },
    });
    if (!target) return actionError("対象のユーザーが見つかりません");

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
    if (!decision.ok) return actionError(decision.message ?? "停止できません");

    const until = resolveDisabledUntil(
      v.kind,
      v.until ? new Date(v.until) : null,
      new Date(),
    );
    if (!until.ok) return actionError(until.message);

    await prisma.user.update({
      where: { id: target.id },
      data: {
        isActive: false,
        disabledUntil: until.value,
        disabledReason: v.reason?.length ? v.reason : null,
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
        disabledReason: v.reason ?? null,
      },
    });
    revalidatePath(BASE_PATH);
    revalidatePath(`${BASE_PATH}/${target.id}`);
    return actionOk(undefined);
  } catch (e) {
    return actionError(prismaErrorMessage(e, "停止に失敗しました"));
  }
}

/** 停止中のユーザーを手動で復帰させる（期限を待たずに戻す場合も含む）。 */
export async function restoreUser(userId: string): Promise<ActionResult> {
  const authz = await checkPermission("system", "ADMIN");
  if (!authz.ok) return actionError(authz.error);
  const parsed = z.string().uuid().safeParse(userId);
  if (!parsed.success) return actionError("ユーザー ID が不正です");

  try {
    const target = await prisma.user.findUnique({
      where: { id: parsed.data },
      select: { id: true, username: true, isActive: true, disabledUntil: true },
    });
    if (!target) return actionError("対象のユーザーが見つかりません");

    const decision = canRestore({
      id: target.id,
      username: target.username,
      isActive: target.isActive,
      disabledUntil: target.disabledUntil,
    });
    if (!decision.ok) return actionError(decision.message ?? "復帰できません");

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
    revalidatePath(BASE_PATH);
    revalidatePath(`${BASE_PATH}/${target.id}`);
    return actionOk(undefined);
  } catch (e) {
    return actionError(prismaErrorMessage(e, "復帰に失敗しました"));
  }
}
