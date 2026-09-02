"use server";

/**
 * Server Actions — 材種マスタ (MS05).
 *
 * Writes go through the shared Prisma client (shared DB `ckk`, schema
 * `master`). Each action revalidates the list + detail paths so the
 * force-dynamic pages re-render fresh data.
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
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

function materialTypeInputSchema(
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
  return z.object({
    nameJa: z.string().min(1, tr("common.nameJaRequired")),
    nameTranslations: z.record(z.string(), z.string()).optional(),
    descriptionJa: z.string().optional(),
    descriptionEn: z.string().optional(),
    isActive: z.boolean(),
  });
}

// 新規は構成コードから組み立て、種類（4桁連番）は自動採番する。
function materialTypeCreateInputSchema(
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
  return materialTypeInputSchema(tr).extend({
    manufacturerCode: z
      .string()
      .regex(/^[A-Z]$/, tr("master.materialTypeForm.selectAManufacturer2")),
    gradeCode: z
      .string()
      .regex(
        /^[0-9]{2}$/,
        tr("master.materialTypeForm.selectAManufacturerGrade"),
      ),
    shapeCode: z
      .string()
      .regex(/^[A-Z]$/, tr("master.materialTypeForm.selectAShape2")),
  });
}

export type MaterialTypeInput = z.infer<
  ReturnType<typeof materialTypeInputSchema>
>;
export type MaterialTypeCreateInput = z.infer<
  ReturnType<typeof materialTypeCreateInputSchema>
>;

function revalidate(id?: number) {
  revalidatePath(BASE_PATH);
  if (id != null) revalidatePath(`${BASE_PATH}/${id}`);
}

export async function createMaterialType(
  input: MaterialTypeCreateInput,
): Promise<ActionResult<{ id: number; code: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = materialTypeCreateInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
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
      return actionError(
        tr("master.materialTypeActions.gradeNotFoundForManufacturer"),
      );
    }
    if (!shape || !shape.isActive) {
      return actionError(tr("master.materialTypeActions.invalidShape"));
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
                name: localizedInput(v.nameJa, undefined, v.nameTranslations),
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
        prismaErrorMessage(
          lastError,
          tr("master.materialTypeActions.numberingConflict"),
          tr,
        ),
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
    return actionError(
      prismaErrorMessage(e, tr("master.materialTypeActions.createFailed"), tr),
    );
  }
}

export async function updateMaterialType(
  id: number,
  input: MaterialTypeInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = materialTypeInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
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
        name: localizedInput(v.nameJa, undefined, v.nameTranslations),
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
    return actionError(
      prismaErrorMessage(e, tr("master.materialTypeActions.updateFailed"), tr),
    );
  }
}

export async function setMaterialTypesActive(
  ids: number[],
  isActive: boolean,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError(tr("common.targetNotSelected"));
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
    return actionError(
      prismaErrorMessage(e, tr("common.statusUpdateFailed"), tr),
    );
  }
}

export async function deleteMaterialTypes(
  ids: number[],
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError(tr("common.targetNotSelected"));
  try {
    // Guard: refuse when any material still references one of the types.
    const used = await prisma.material.count({
      where: { materialTypeId: { in: ids } },
    });
    if (used > 0) {
      return actionError(tr("master.materialTypeActions.cannotDeleteInUse"));
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
    return actionError(
      prismaErrorMessage(e, tr("master.materialTypeActions.deleteFailed"), tr),
    );
  }
}

// ─── 既定単価マトリクス (material_type_prices) ─────────────────────────────
// 材種 × 直径 × 黒皮/研磨 → 単価 (¥/1000mm)。価格試算のフォールバック材料単価。

function priceRowInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    diameterCode: z
      .string()
      .regex(
        /^[0-9]{3}$/,
        tr("master.materialTypeActions.invalidDiameterCode"),
      ),
    surfaceFinishCode: z
      .string()
      .regex(
        /^[A-Z]$/,
        tr("master.materialTypeActions.invalidSurfaceFinishCode"),
      ),
    unitPrice: z
      .number()
      .min(0, tr("master.materialTypeActions.unitPriceMustBeZeroOrMore")),
  });
}

export type MaterialTypePriceRow = z.infer<
  ReturnType<typeof priceRowInputSchema>
>;

/**
 * 材種の既定単価マトリクスを丸ごと置換する（削除 → 一括作成）。
 * 各行は (直径 × 黒皮/研磨) で一意。unit_price は ¥/1000mm。
 */
export async function saveMaterialTypePrices(
  materialTypeId: number,
  rows: MaterialTypePriceRow[],
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = z.array(priceRowInputSchema(tr)).safeParse(rows);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  // (直径 × 黒皮/研磨) の重複を弾く。
  const seen = new Set<string>();
  for (const r of parsed.data) {
    const k = `${r.diameterCode}|${r.surfaceFinishCode}`;
    if (seen.has(k)) {
      return actionError(
        tr("master.materialTypeActions.duplicateDiameterFinishRow"),
      );
    }
    seen.add(k);
  }
  try {
    await prisma.$transaction([
      prisma.materialTypePrice.deleteMany({ where: { materialTypeId } }),
      prisma.materialTypePrice.createMany({
        data: parsed.data.map((r) => ({
          materialTypeId,
          diameterCode: r.diameterCode,
          surfaceFinishCode: r.surfaceFinishCode,
          unitPrice: new Prisma.Decimal(r.unitPrice),
        })),
      }),
    ]);
    await recordAudit({
      action: "UPDATE",
      tableName: "material_type_prices",
      recordId: String(materialTypeId),
      after: { rows: parsed.data.length },
    });
    revalidate(materialTypeId);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.materialTypeActions.savePricesFailed"),
        tr,
      ),
    );
  }
}
