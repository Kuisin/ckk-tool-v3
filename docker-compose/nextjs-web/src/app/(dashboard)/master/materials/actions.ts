"use server";

/**
 * Server Actions — 素材マスタ (MS05).
 *
 * 内部 id は連番、素材コード（表示・変更不可）は構成（材種 × 黒皮研磨 × 径 ×
 * 全長）から自動で組み立てる (採番表 ver1.2 / _specs/tables.md)。径・全長の
 * 構成行（material_diameters / material_length_variants）は無ければ自動登録。
 * 種類（kind）は親材種の形状に属するものだけ許可。材種はレガシー未変換
 * （code なし）を親にできない。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
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
const materialUpdateInput = z.object({
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string().optional(),
  unit: z.string().min(1, "単位を選択してください"),
  manufacturerModel: z.string().optional(),
  nominalDiameterMm: z.number().min(0).nullable(),
  isActive: z.boolean(),
  notes: z.string().optional(),
});

const materialCreateInput = materialUpdateInput.extend({
  materialTypeId: z.number().int().min(1, "材種を選択してください"),
  surfaceFinishCode: z.string().length(1, "黒皮・研磨を選択してください"),
  diameterMm: z
    .number()
    .min(0.1, "直径は 0.1〜99.9mm で入力してください")
    .max(99.9, "直径は 0.1〜99.9mm で入力してください"),
  lengthMm: z
    .number()
    .min(1, "全長は 1〜999mm で入力してください")
    .max(999, "全長は 1〜999mm で入力してください"),
  kindCode: z.string().length(2, "種類を選択してください"),
});

export type MaterialUpdateInput = z.infer<typeof materialUpdateInput>;
export type MaterialCreateInput = z.infer<typeof materialCreateInput>;

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
  try {
    const t = await prisma.materialType.findUnique({
      where: { id: materialTypeId },
    });
    if (!t) return actionError("材種が見つかりません");
    if (!t.code || !t.shapeCode) {
      return actionError(
        "未変換（レガシー）の材種では素材コードを構成できません",
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
    return actionError(prismaErrorMessage(e, "材種の取得に失敗しました"));
  }
}

export async function createMaterial(
  input: MaterialCreateInput,
): Promise<ActionResult<{ id: number; code: string }>> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = materialCreateInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
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
        "未変換（レガシー）の材種では素材を作成できません。変換済の材種を選択してください。",
      );
    }
    if (!finish || !finish.isActive) {
      return actionError("黒皮・研磨の区分が不正です");
    }
    const kind = await prisma.materialKind.findUnique({
      where: {
        shapeCode_code: { shapeCode: type.shapeCode, code: v.kindCode },
      },
    });
    if (!kind || !kind.isActive) {
      return actionError("種類がこの材種の形状に存在しません");
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
          name: localizedInput(v.nameJa, v.nameEn),
          unit: v.unit,
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
      return actionError(
        "同一構成（材種 × 黒皮研磨 × 直径 × 全長）の素材が既に存在します",
      );
    }
    return actionError(prismaErrorMessage(e, "素材の作成に失敗しました"));
  }
}

export async function updateMaterial(
  id: number,
  input: MaterialUpdateInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = materialUpdateInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const prior = await prisma.material.findUnique({
      where: { id },
      select: {
        unit: true,
        manufacturerModel: true,
        nominalDiameterMm: true,
        isActive: true,
        notes: true,
      },
    });
    await prisma.material.update({
      where: { id },
      data: {
        name: localizedInput(v.nameJa, v.nameEn),
        unit: v.unit,
        manufacturerModel: v.manufacturerModel?.trim() || null,
        nominalDiameterMm: v.nominalDiameterMm,
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
            isActive: prior.isActive,
            notes: prior.notes,
          }
        : undefined,
      after: {
        nameJa: v.nameJa,
        unit: v.unit,
        manufacturerModel: v.manufacturerModel?.trim() || null,
        nominalDiameterMm: v.nominalDiameterMm,
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
  ids: number[],
  isActive: boolean,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
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

export async function deleteMaterials(ids: number[]): Promise<ActionResult> {
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    // 参照ガード: 製品は材種参照へ移行済み（products.material_id は廃止）。
    // 指示書・発注明細・入荷・在庫などの実参照は P2003 → prismaErrorMessage。
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
    return actionError(prismaErrorMessage(e, "素材の削除に失敗しました"));
  }
}
