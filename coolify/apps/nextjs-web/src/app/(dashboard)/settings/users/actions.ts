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
import { checkPermission } from "@/lib/authz";
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
import { getBootstrapAdminSnapshot } from "@/lib/users-admin";

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
