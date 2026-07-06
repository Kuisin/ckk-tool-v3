"use server";

/**
 * Server Actions — 素材マスタ (MS05).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/master/materials";

const MATERIAL_CODE_RE = /^[A-Z][0-9]{2}[A-Z][0-9]{4}-[A-C][0-9]{3}-[0-9]{3}$/;

const materialInput = z.object({
  materialTypeId: z.string().min(1, "材種を選択してください"),
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string().optional(),
  unit: z.string().min(1, "単位を選択してください"),
  form: z.enum(["POLISHED", "STANDARD_LENGTH", "SEMI_FINISHED", "OTHER"]),
  isActive: z.boolean(),
  notes: z.string().optional(),
});

const materialCreateInput = materialInput.extend({
  code: z
    .string()
    .regex(
      MATERIAL_CODE_RE,
      "形式は [材種]-[A-C][0-9]{3}-[0-9]{3} で入力してください",
    ),
});

export type MaterialInput = z.infer<typeof materialInput>;
export type MaterialCreateInput = z.infer<typeof materialCreateInput>;

function revalidate(id?: string) {
  revalidatePath(BASE_PATH);
  if (id) revalidatePath(`${BASE_PATH}/${id}`);
}

export async function createMaterial(
  input: MaterialCreateInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = materialCreateInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const created = await prisma.material.create({
      data: {
        id: v.code,
        materialTypeId: v.materialTypeId,
        name: localizedInput(v.nameJa, v.nameEn),
        unit: v.unit,
        materialForm: v.form,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "materials",
      recordId: created.id,
      after: {
        materialTypeId: v.materialTypeId,
        nameJa: v.nameJa,
        unit: v.unit,
        form: v.form,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
    });
    revalidate(created.id);
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "素材の作成に失敗しました"));
  }
}

export async function updateMaterial(
  id: string,
  input: MaterialInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = materialInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const prior = await prisma.material.findUnique({
      where: { id },
      select: {
        materialTypeId: true,
        unit: true,
        materialForm: true,
        isActive: true,
        notes: true,
      },
    });
    await prisma.material.update({
      where: { id },
      data: {
        materialTypeId: v.materialTypeId,
        name: localizedInput(v.nameJa, v.nameEn),
        unit: v.unit,
        materialForm: v.form,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "materials",
      recordId: id,
      before: prior
        ? {
            materialTypeId: prior.materialTypeId,
            unit: prior.unit,
            form: prior.materialForm,
            isActive: prior.isActive,
            notes: prior.notes,
          }
        : undefined,
      after: {
        materialTypeId: v.materialTypeId,
        nameJa: v.nameJa,
        unit: v.unit,
        form: v.form,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
    });
    revalidate(id);
    return actionOk({ id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "素材の更新に失敗しました"));
  }
}

export async function setMaterialsActive(
  ids: string[],
  isActive: boolean,
): Promise<ActionResult> {
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    await prisma.material.updateMany({
      where: { id: { in: ids } },
      data: { isActive },
    });
    for (const id of ids) {
      await recordAudit({
        action: "UPDATE",
        tableName: "materials",
        recordId: id,
        after: { isActive },
      });
    }
    revalidate();
    for (const id of ids) revalidatePath(`${BASE_PATH}/${id}`);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "状態の更新に失敗しました"));
  }
}

export async function deleteMaterials(ids: string[]): Promise<ActionResult> {
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    // Guard: refuse when a product still references one of the materials.
    // (Other referencing tables surface as P2003 via prismaErrorMessage.)
    const products = await prisma.product.count({
      where: { materialId: { in: ids } },
    });
    if (products > 0) {
      return actionError(
        "この素材を使用する製品が存在するため削除できません。無効化を検討してください。",
      );
    }
    await prisma.material.deleteMany({ where: { id: { in: ids } } });
    for (const id of ids) {
      await recordAudit({
        action: "DELETE",
        tableName: "materials",
        recordId: id,
      });
    }
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "素材の削除に失敗しました"));
  }
}
