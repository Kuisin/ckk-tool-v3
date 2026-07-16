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
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { Prisma, prisma } from "@/lib/db";
import { composeMaterialTypeCode, formatKindSerial } from "@/lib/material-code";
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

// 新規は構成コードから組み立て、種類（4桁連番）は自動採番する。
const materialTypeCreateInput = materialTypeInput.extend({
  manufacturerCode: z.string().regex(/^[A-Z]$/, "メーカーを選択してください"),
  gradeCode: z.string().regex(/^[0-9]{2}$/, "メーカー材種を選択してください"),
  shapeCode: z.string().regex(/^[A-Z]$/, "形状を選択してください"),
});

export type MaterialTypeInput = z.infer<typeof materialTypeInput>;
export type MaterialTypeCreateInput = z.infer<typeof materialTypeCreateInput>;

function revalidate(id?: number) {
  revalidatePath(BASE_PATH);
  if (id != null) revalidatePath(`${BASE_PATH}/${id}`);
}

export async function createMaterialType(
  input: MaterialTypeCreateInput,
): Promise<ActionResult<{ id: number; code: string }>> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = materialTypeCreateInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const [grade, shape] = await Promise.all([
      prisma.materialManufacturerGrade.findUnique({
        where: {
          manufacturerCode_code: {
            manufacturerCode: v.manufacturerCode,
            code: v.gradeCode,
          },
        },
        include: { manufacturer: true },
      }),
      prisma.materialShape.findUnique({ where: { code: v.shapeCode } }),
    ]);
    if (!grade || !grade.isActive || !grade.manufacturer.isActive) {
      return actionError("メーカー材種がこのメーカーに存在しません");
    }
    if (!shape || !shape.isActive) {
      return actionError("形状が不正です");
    }

    // 種類 = メーカー×材種×形状内の 4桁連番。numbering_sequences は使わず
    // MAX+1 をトランザクション内で採番し、複合 unique 衝突（P2002）時のみ
    // リトライする（外部インポートと自己修復的に共存できる）。
    let created: { id: number; code: string } | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      try {
        created = await prisma.$transaction(async (tx) => {
          const max = await tx.materialType.aggregate({
            where: {
              manufacturerCode: v.manufacturerCode,
              gradeCode: v.gradeCode,
              shapeCode: v.shapeCode,
            },
            _max: { kindCode: true },
          });
          const next = (Number(max._max.kindCode) || 0) + 1;
          const kindCode = formatKindSerial(next);
          const code = composeMaterialTypeCode(
            v.manufacturerCode,
            v.gradeCode,
            v.shapeCode,
            kindCode,
          );
          return tx.materialType
            .create({
              data: {
                code,
                manufacturerCode: v.manufacturerCode,
                gradeCode: v.gradeCode,
                shapeCode: v.shapeCode,
                kindCode,
                name: localizedInput(v.nameJa, v.nameEn),
                description:
                  localizedInputOrNull(v.descriptionJa, v.descriptionEn) ??
                  undefined,
                isActive: v.isActive,
              },
              select: { id: true, code: true },
            })
            .then((r) => ({ id: r.id, code: r.code ?? "" }));
        });
      } catch (e) {
        lastError = e;
        const code =
          typeof e === "object" && e !== null && "code" in e
            ? String((e as { code: unknown }).code)
            : undefined;
        if (code !== "P2002") throw e;
      }
    }
    if (!created) {
      return actionError(
        prismaErrorMessage(lastError, "採番が競合しました。再度お試しください"),
      );
    }
    await recordAudit({
      action: "CREATE",
      tableName: "material_types",
      recordId: String(created.id),
      after: {
        code: created.code,
        manufacturerCode: v.manufacturerCode,
        gradeCode: v.gradeCode,
        shapeCode: v.shapeCode,
        nameJa: v.nameJa,
        descriptionJa: v.descriptionJa?.trim() || null,
        isActive: v.isActive,
      },
    });
    revalidate(created.id);
    return actionOk({ id: created.id, code: created.code ?? "" });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "材種の作成に失敗しました"));
  }
}

export async function updateMaterialType(
  id: number,
  input: MaterialTypeInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = materialTypeInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const prior = await prisma.materialType.findUnique({
      where: { id },
      select: { isActive: true },
    });
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
    await recordAudit({
      action: "UPDATE",
      tableName: "material_types",
      recordId: String(id),
      before: prior ? { isActive: prior.isActive } : undefined,
      after: {
        nameJa: v.nameJa,
        descriptionJa: v.descriptionJa?.trim() || null,
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
  ids: number[],
  isActive: boolean,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    await prisma.materialType.updateMany({
      where: { id: { in: ids } },
      data: { isActive },
    });
    for (const id of ids) {
      await recordAudit({
        action: "UPDATE",
        tableName: "material_types",
        recordId: String(id),
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

export async function deleteMaterialTypes(
  ids: number[],
): Promise<ActionResult> {
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
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
    for (const id of ids) {
      await recordAudit({
        action: "DELETE",
        tableName: "material_types",
        recordId: String(id),
      });
    }
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "材種の削除に失敗しました"));
  }
}
