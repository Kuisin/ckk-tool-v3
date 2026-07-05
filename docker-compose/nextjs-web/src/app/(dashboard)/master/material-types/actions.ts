"use server";

/**
 * Server Actions — 材種マスタ (MS04).
 *
 * Writes go through the shared Prisma client (shared DB `ckk`, schema
 * `master`). Each action revalidates the list + detail paths so the
 * force-dynamic pages re-render fresh data.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, prisma } from "@/lib/db";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  localizedInputOrNull,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/master/material-types";

const materialTypeInput = z.object({
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string().optional(),
  descriptionJa: z.string().optional(),
  descriptionEn: z.string().optional(),
  isActive: z.boolean(),
});

const materialTypeCreateInput = materialTypeInput.extend({
  code: z
    .string()
    .regex(
      /^[A-Z][0-9]{2}[A-Z][0-9]{4}$/,
      "形式は [A-Z][0-9]{2}[A-Z][0-9]{4} で入力してください",
    ),
});

export type MaterialTypeInput = z.infer<typeof materialTypeInput>;
export type MaterialTypeCreateInput = z.infer<typeof materialTypeCreateInput>;

function revalidate(id?: string) {
  revalidatePath(BASE_PATH);
  if (id) revalidatePath(`${BASE_PATH}/${id}`);
}

export async function createMaterialType(
  input: MaterialTypeCreateInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = materialTypeCreateInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const created = await prisma.materialType.create({
      data: {
        id: v.code,
        name: localizedInput(v.nameJa, v.nameEn),
        description:
          localizedInputOrNull(v.descriptionJa, v.descriptionEn) ?? undefined,
        isActive: v.isActive,
      },
    });
    revalidate(created.id);
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "材種の作成に失敗しました"));
  }
}

export async function updateMaterialType(
  id: string,
  input: MaterialTypeInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = materialTypeInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    await prisma.materialType.update({
      where: { id },
      data: {
        name: localizedInput(v.nameJa, v.nameEn),
        description:
          localizedInputOrNull(v.descriptionJa, v.descriptionEn) ??
          Prisma.DbNull,
        isActive: v.isActive,
      },
    });
    revalidate(id);
    return actionOk({ id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "材種の更新に失敗しました"));
  }
}

export async function setMaterialTypesActive(
  ids: string[],
  isActive: boolean,
): Promise<ActionResult> {
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    await prisma.materialType.updateMany({
      where: { id: { in: ids } },
      data: { isActive },
    });
    revalidate();
    for (const id of ids) revalidatePath(`${BASE_PATH}/${id}`);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "状態の更新に失敗しました"));
  }
}

export async function deleteMaterialTypes(
  ids: string[],
): Promise<ActionResult> {
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    // Guard: refuse when any material still references one of the types.
    const used = await prisma.material.count({
      where: { materialTypeId: { in: ids } },
    });
    if (used > 0) {
      return actionError(
        "この材種に紐づく素材が存在するため削除できません。無効化を検討してください。",
      );
    }
    await prisma.materialType.deleteMany({ where: { id: { in: ids } } });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "材種の削除に失敗しました"));
  }
}
