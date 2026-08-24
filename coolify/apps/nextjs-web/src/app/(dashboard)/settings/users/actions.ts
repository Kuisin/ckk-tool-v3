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
import { prisma } from "@/lib/db";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

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
