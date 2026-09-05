"use server";

/**
 * Server Actions — 素材マスタ (MS06).
 *
 * 内部 id は連番、素材コード（表示・変更不可）は構成（材種 × 黒皮研磨 × 径 ×
 * 全長）から自動で組み立てる (採番表 ver1.2 / _specs/tables.md)。径・全長の
 * 構成行（material_diameters / material_length_variants）は無ければ自動登録。
 * 種類（kind）は親材種の形状に属するものだけ許可。材種はレガシー未変換
 * （code なし）を親にできない。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { normalizeKeywords } from "@/lib/master-keywords";
import { countMasterReferences } from "@/lib/master-refs";
import {
  composeMaterialCode,
  diameterCodeFromMm,
  lengthCodeFromMm,
} from "@/lib/material-code";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/master/materials";

// 編集可能フィールド（識別＝コード構成は作成後不変）
function materialUpdateInputSchema(
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
  return z.object({
    nameJa: z.string().min(1, tr("common.nameJaRequired")),
    nameTranslations: z.record(z.string(), z.string()).optional(),
    unit: z.string().min(1, tr("master.materialForm.unitRequired")),
    manufacturerModel: z.string().optional(),
    nominalDiameterMm: z.number().min(0).nullable(),
    /** 検索・AI 突合用のキーワード（match_names）。保存時に整形する。 */
    matchNames: z.array(z.string()).default([]),
    isActive: z.boolean(),
    notes: z.string().optional(),
  });
}

function materialCreateInputSchema(
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
  return materialUpdateInputSchema(tr).extend({
    materialTypeId: z
      .number()
      .int()
      .min(1, tr("master.materialForm.materialTypeRequired")),
    surfaceFinishCode: z
      .string()
      .length(1, tr("master.materialForm.surfaceFinishRequired")),
    diameterMm: z
      .number()
      .min(0.1, tr("master.materialForm.diameterRange"))
      .max(99.9, tr("master.materialForm.diameterRange")),
    lengthMm: z
      .number()
      .min(1, tr("master.materialForm.lengthRange"))
      .max(999, tr("master.materialForm.lengthRange")),
    kindCode: z.string().length(2, tr("master.materialForm.kindRequired")),
  });
}

export type MaterialUpdateInput = z.infer<
  ReturnType<typeof materialUpdateInputSchema>
>;
export type MaterialCreateInput = z.infer<
  ReturnType<typeof materialCreateInputSchema>
>;

function revalidate(id?: number) {
  revalidatePath(BASE_PATH);
  if (id != null) revalidatePath(`${BASE_PATH}/${id}`);
}

export interface StructuredTypeInfo {
  /** 材種コード（構成コード） — 素材コードのプレビュー組立に使う。 */
  code: string;
  shapeCode: string;
  nameJa: string;
  kindOptions: { value: string; label: string }[];
}

/** 素材ビルダー用 — 選択した材種のコード・形状と、その形状の種類一覧。 */
export async function fetchStructuredMaterialType(
  materialTypeId: number,
): Promise<ActionResult<StructuredTypeInfo>> {
  const authz = await checkPermission("master", "READ");
  if (!authz.ok) return actionError(authz.error);
  const tr = await getTranslations();
  try {
    const t = await prisma.materialType.findUnique({
      where: { id: materialTypeId },
    });
    if (!t) {
      return actionError(tr("master.materialActions.materialTypeNotFound"));
    }
    if (!t.code || !t.shapeCode) {
      return actionError(
        tr("master.materialActions.legacyMaterialTypeCannotComposeCode"),
      );
    }
    const kinds = await prisma.materialKind.findMany({
      where: { shapeCode: t.shapeCode, isActive: true },
      orderBy: { code: "asc" },
    });
    return actionOk({
      code: t.code,
      shapeCode: t.shapeCode,
      nameJa: localized(t.name as LocalizedText | null),
      kindOptions: kinds.map((k) => ({
        value: k.code,
        label: `${k.code} — ${localized(k.name as LocalizedText | null)}`,
      })),
    });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.materialActions.materialTypeFetchFailed"),
        tr,
      ),
    );
  }
}

export async function createMaterial(
  input: MaterialCreateInput,
): Promise<ActionResult<{ id: number; code: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = materialCreateInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const [type, finish] = await Promise.all([
      prisma.materialType.findUnique({ where: { id: v.materialTypeId } }),
      prisma.materialSurfaceFinish.findUnique({
        where: { code: v.surfaceFinishCode },
      }),
    ]);
    if (!type || !type.code || !type.shapeCode) {
      return actionError(
        tr("master.materialActions.legacyMaterialTypeCannotCreateMaterial"),
      );
    }
    if (!finish || !finish.isActive) {
      return actionError(tr("master.materialActions.invalidSurfaceFinish"));
    }
    const kind = await prisma.materialKind.findUnique({
      where: {
        shapeCode_code: { shapeCode: type.shapeCode, code: v.kindCode },
      },
    });
    if (!kind || !kind.isActive) {
      return actionError(
        tr("master.materialActions.kindNotInMaterialTypeShape"),
      );
    }

    const diameterCode = diameterCodeFromMm(v.diameterMm);
    const lengthCode = lengthCodeFromMm(v.lengthMm);
    const code = composeMaterialCode(
      type.code,
      v.surfaceFinishCode,
      diameterCode,
      lengthCode,
    );

    const created = await prisma.$transaction(async (tx) => {
      // 径・全長の構成行は reuse-or-create（管理画面は閲覧・無効化・カスタム名用）。
      await tx.materialDiameter.upsert({
        where: { code: diameterCode },
        create: {
          code: diameterCode,
          diameterMm: v.diameterMm,
          displayName: { ja: `φ${v.diameterMm}`, en: `φ${v.diameterMm}` },
        },
        update: {},
      });
      await tx.materialLengthVariant.upsert({
        where: { code: lengthCode },
        create: {
          code: lengthCode,
          lengthMm: Math.round(v.lengthMm),
          displayName: {
            ja: `${Math.round(v.lengthMm)}mm`,
            en: `${Math.round(v.lengthMm)}mm`,
          },
        },
        update: {},
      });
      return tx.material.create({
        data: {
          code,
          materialTypeId: v.materialTypeId,
          surfaceFinishCode: v.surfaceFinishCode,
          diameterCode,
          lengthVariantCode: lengthCode,
          kindCode: v.kindCode,
          diameterMm: v.diameterMm,
          lengthMm: Math.round(v.lengthMm),
          manufacturerModel: v.manufacturerModel?.trim() || null,
          nominalDiameterMm: v.nominalDiameterMm,
          name: localizedInput(v.nameJa, undefined, v.nameTranslations),
          unit: v.unit,
          matchNames: normalizeKeywords(v.matchNames),
          isActive: v.isActive,
          notes: v.notes?.trim() || null,
        },
        select: { id: true, code: true },
      });
    });
    await recordAudit({
      action: "CREATE",
      tableName: "materials",
      recordId: String(created.id),
      after: {
        code,
        materialTypeId: v.materialTypeId,
        surfaceFinishCode: v.surfaceFinishCode,
        diameterMm: v.diameterMm,
        lengthMm: v.lengthMm,
        kindCode: v.kindCode,
        nameJa: v.nameJa,
        unit: v.unit,
        matchNames: normalizeKeywords(v.matchNames),
        isActive: v.isActive,
      },
    });
    revalidate(created.id);
    return actionOk({ id: created.id, code: created.code });
  } catch (e) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code: unknown }).code)
        : undefined;
    if (code === "P2002") {
      return actionError(tr("master.materialActions.duplicateComposition"));
    }
    return actionError(
      prismaErrorMessage(e, tr("master.materialActions.createFailed"), tr),
    );
  }
}

export async function updateMaterial(
  id: number,
  input: MaterialUpdateInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = materialUpdateInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const prior = await prisma.material.findUnique({
      where: { id },
      select: {
        unit: true,
        manufacturerModel: true,
        nominalDiameterMm: true,
        matchNames: true,
        isActive: true,
        notes: true,
      },
    });
    await prisma.material.update({
      where: { id },
      data: {
        name: localizedInput(v.nameJa, undefined, v.nameTranslations),
        unit: v.unit,
        manufacturerModel: v.manufacturerModel?.trim() || null,
        nominalDiameterMm: v.nominalDiameterMm,
        matchNames: normalizeKeywords(v.matchNames),
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "materials",
      recordId: String(id),
      before: prior
        ? {
            unit: prior.unit,
            manufacturerModel: prior.manufacturerModel,
            nominalDiameterMm: prior.nominalDiameterMm
              ? Number(prior.nominalDiameterMm)
              : null,
            matchNames: prior.matchNames,
            isActive: prior.isActive,
            notes: prior.notes,
          }
        : undefined,
      after: {
        nameJa: v.nameJa,
        unit: v.unit,
        manufacturerModel: v.manufacturerModel?.trim() || null,
        nominalDiameterMm: v.nominalDiameterMm,
        matchNames: normalizeKeywords(v.matchNames),
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
    });
    revalidate(id);
    return actionOk({ id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.materialActions.updateFailed"), tr),
    );
  }
}

export async function setMaterialsActive(
  ids: number[],
  isActive: boolean,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) {
    return actionError(tr("master.materialActions.noTargetsSelected"));
  }
  try {
    await prisma.material.updateMany({
      where: { id: { in: ids } },
      data: { isActive },
    });
    for (const id of ids) {
      await recordAudit({
        action: "UPDATE",
        tableName: "materials",
        recordId: String(id),
        after: { isActive },
      });
    }
    revalidate();
    for (const id of ids) revalidatePath(`${BASE_PATH}/${id}`);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.materialActions.statusUpdateFailed"),
        tr,
      ),
    );
  }
}

export async function deleteMaterials(ids: number[]): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) {
    return actionError(tr("master.materialActions.noTargetsSelected"));
  }
  try {
    // 参照ガード: 製品は材種参照へ移行済み（products.material_id は廃止）。
    // 発注明細・入荷・在庫は RESTRICT なので P2003 → prismaErrorMessage で止まるが、
    // 指示書（work_orders.material_id）は SET NULL で DB が止めない — ここで数える。
    const refs = await countMasterReferences("material", ids);
    if (refs.total > 0) {
      return actionError(tr("master.materialActions.referencedCannotDelete"));
    }
    await prisma.material.deleteMany({ where: { id: { in: ids } } });
    for (const id of ids) {
      await recordAudit({
        action: "DELETE",
        tableName: "materials",
        recordId: String(id),
      });
    }
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.materialActions.deleteFailed"), tr),
    );
  }
}
