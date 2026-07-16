"use server";

/**
 * Server Actions — 採番構成 (MS0C).
 *
 * 材種/素材コードの構成要素マスタ（メーカー / メーカー材種 / 形状 / 種類 /
 * 黒皮・研磨 / 直径 / 全長）の追加と有効・無効切替。コードは合成 id
 * （材種・素材コード）に埋め込まれるため削除は提供しない。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { diameterCodeFromMm, lengthCodeFromMm } from "@/lib/material-code";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  prismaErrorMessage,
} from "@/lib/server-action";

const PAGE_PATH = "/master/material-numbering";

const name = {
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string().optional(),
};

const dup = (e: unknown, fallback: string) => {
  const code =
    typeof e === "object" && e !== null && "code" in e
      ? String((e as { code: unknown }).code)
      : undefined;
  if (code === "P2002") return actionError("同じコードが既に存在します");
  return actionError(prismaErrorMessage(e, fallback));
};

async function audit(table: string, recordId: string, after: object) {
  await recordAudit({ action: "CREATE", tableName: table, recordId, after });
  revalidatePath(PAGE_PATH);
}

// ── 追加 ────────────────────────────────────────────────────────────────────

const manufacturerInput = z.object({
  code: z.string().regex(/^[A-Z]$/, "コードは英大文字1文字です"),
  ...name,
});

export async function createManufacturer(
  input: z.infer<typeof manufacturerInput>,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const p = manufacturerInput.safeParse(input);
  if (!p.success)
    return actionError(p.error.issues[0]?.message ?? "入力が不正です");
  try {
    await prisma.materialManufacturer.create({
      data: {
        code: p.data.code,
        name: localizedInput(p.data.nameJa, p.data.nameEn),
      },
    });
    await audit("material_manufacturers", p.data.code, {
      nameJa: p.data.nameJa,
    });
    return actionOk();
  } catch (e) {
    return dup(e, "メーカーの追加に失敗しました");
  }
}

const gradeInput = z.object({
  manufacturerCode: z.string().regex(/^[A-Z]$/, "メーカーを選択してください"),
  code: z.string().regex(/^[0-9]{2}$/, "コードは数字2桁です"),
  ...name,
});

export async function createGrade(
  input: z.infer<typeof gradeInput>,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const p = gradeInput.safeParse(input);
  if (!p.success)
    return actionError(p.error.issues[0]?.message ?? "入力が不正です");
  try {
    await prisma.materialManufacturerGrade.create({
      data: {
        manufacturerCode: p.data.manufacturerCode,
        code: p.data.code,
        name: localizedInput(p.data.nameJa, p.data.nameEn),
      },
    });
    await audit(
      "material_manufacturer_grades",
      `${p.data.manufacturerCode}${p.data.code}`,
      { nameJa: p.data.nameJa },
    );
    return actionOk();
  } catch (e) {
    return dup(e, "メーカー材種の追加に失敗しました");
  }
}

const shapeInput = z.object({
  code: z.string().regex(/^[A-Z]$/, "コードは英大文字1文字です"),
  ...name,
});

export async function createShape(
  input: z.infer<typeof shapeInput>,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const p = shapeInput.safeParse(input);
  if (!p.success)
    return actionError(p.error.issues[0]?.message ?? "入力が不正です");
  try {
    await prisma.materialShape.create({
      data: {
        code: p.data.code,
        name: localizedInput(p.data.nameJa, p.data.nameEn),
      },
    });
    await audit("material_shapes", p.data.code, { nameJa: p.data.nameJa });
    return actionOk();
  } catch (e) {
    return dup(e, "形状の追加に失敗しました");
  }
}

const kindInput = z.object({
  shapeCode: z.string().regex(/^[A-Z]$/, "形状を選択してください"),
  code: z.string().regex(/^[A-Z0-9]{2}$/, "コードは英数字2桁です"),
  ...name,
});

export async function createKind(
  input: z.infer<typeof kindInput>,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const p = kindInput.safeParse(input);
  if (!p.success)
    return actionError(p.error.issues[0]?.message ?? "入力が不正です");
  try {
    await prisma.materialKind.create({
      data: {
        shapeCode: p.data.shapeCode,
        code: p.data.code,
        name: localizedInput(p.data.nameJa, p.data.nameEn),
      },
    });
    await audit("material_kinds", `${p.data.shapeCode}/${p.data.code}`, {
      nameJa: p.data.nameJa,
    });
    return actionOk();
  } catch (e) {
    return dup(e, "種類の追加に失敗しました");
  }
}

const finishInput = z.object({
  code: z.string().regex(/^[A-Z]$/, "コードは英大文字1文字です"),
  ...name,
});

export async function createSurfaceFinish(
  input: z.infer<typeof finishInput>,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const p = finishInput.safeParse(input);
  if (!p.success)
    return actionError(p.error.issues[0]?.message ?? "入力が不正です");
  try {
    await prisma.materialSurfaceFinish.create({
      data: {
        code: p.data.code,
        name: localizedInput(p.data.nameJa, p.data.nameEn),
      },
    });
    await audit("material_surface_finishes", p.data.code, {
      nameJa: p.data.nameJa,
    });
    return actionOk();
  } catch (e) {
    return dup(e, "黒皮・研磨区分の追加に失敗しました");
  }
}

const diameterInput = z.object({
  diameterMm: z
    .number({ message: "直径を入力してください" })
    .min(0.1, "直径は 0.1〜99.9mm です")
    .max(99.9, "直径は 0.1〜99.9mm です"),
});

export async function createDiameter(
  input: z.infer<typeof diameterInput>,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const p = diameterInput.safeParse(input);
  if (!p.success)
    return actionError(p.error.issues[0]?.message ?? "入力が不正です");
  try {
    const code = diameterCodeFromMm(p.data.diameterMm);
    await prisma.materialDiameter.create({
      data: {
        code,
        diameterMm: p.data.diameterMm,
        displayName: {
          ja: `φ${p.data.diameterMm}`,
          en: `φ${p.data.diameterMm}`,
        },
      },
    });
    await audit("material_diameters", code, { diameterMm: p.data.diameterMm });
    return actionOk();
  } catch (e) {
    return dup(e, "直径の追加に失敗しました");
  }
}

const lengthInput = z.object({
  lengthMm: z
    .number({ message: "全長を入力してください" })
    .min(1, "全長は 1〜999mm です")
    .max(999, "全長は 1〜999mm です"),
  customLabel: z.string().optional(),
});

export async function createLengthVariant(
  input: z.infer<typeof lengthInput>,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const p = lengthInput.safeParse(input);
  if (!p.success)
    return actionError(p.error.issues[0]?.message ?? "入力が不正です");
  try {
    const mm = Math.round(p.data.lengthMm);
    const code = lengthCodeFromMm(mm);
    await prisma.materialLengthVariant.create({
      data: {
        code,
        lengthMm: mm,
        customLabel: p.data.customLabel?.trim() || null,
        displayName: { ja: `${mm}mm`, en: `${mm}mm` },
      },
    });
    await audit("material_length_variants", code, {
      lengthMm: mm,
      customLabel: p.data.customLabel?.trim() || null,
    });
    return actionOk();
  } catch (e) {
    return dup(e, "全長の追加に失敗しました");
  }
}

// ── 有効・無効切替 ──────────────────────────────────────────────────────────

export type ComponentTableKind =
  | "manufacturer"
  | "grade"
  | "shape"
  | "kind"
  | "finish"
  | "diameter"
  | "length";

const setActiveInput = z.object({
  kind: z.enum([
    "manufacturer",
    "grade",
    "shape",
    "kind",
    "finish",
    "diameter",
    "length",
  ]),
  code: z.string().min(1),
  /** grade は manufacturerCode、kind は shapeCode。 */
  parentCode: z.string().optional(),
  isActive: z.boolean(),
});

const AUDIT_TABLE: Record<ComponentTableKind, string> = {
  manufacturer: "material_manufacturers",
  grade: "material_manufacturer_grades",
  shape: "material_shapes",
  kind: "material_kinds",
  finish: "material_surface_finishes",
  diameter: "material_diameters",
  length: "material_length_variants",
};

export async function setComponentActive(
  input: z.infer<typeof setActiveInput>,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const p = setActiveInput.safeParse(input);
  if (!p.success)
    return actionError(p.error.issues[0]?.message ?? "入力が不正です");
  const { kind, code, parentCode, isActive } = p.data;
  try {
    switch (kind) {
      case "manufacturer":
        await prisma.materialManufacturer.update({
          where: { code },
          data: { isActive },
        });
        break;
      case "grade":
        if (!parentCode) return actionError("メーカーコードが必要です");
        await prisma.materialManufacturerGrade.update({
          where: {
            manufacturerCode_code: { manufacturerCode: parentCode, code },
          },
          data: { isActive },
        });
        break;
      case "shape":
        await prisma.materialShape.update({
          where: { code },
          data: { isActive },
        });
        break;
      case "kind":
        if (!parentCode) return actionError("形状コードが必要です");
        await prisma.materialKind.update({
          where: { shapeCode_code: { shapeCode: parentCode, code } },
          data: { isActive },
        });
        break;
      case "finish":
        await prisma.materialSurfaceFinish.update({
          where: { code },
          data: { isActive },
        });
        break;
      case "diameter":
        await prisma.materialDiameter.update({
          where: { code },
          data: { isActive },
        });
        break;
      case "length":
        await prisma.materialLengthVariant.update({
          where: { code },
          data: { isActive },
        });
        break;
    }
    await recordAudit({
      action: "UPDATE",
      tableName: AUDIT_TABLE[kind],
      recordId: parentCode ? `${parentCode}/${code}` : code,
      after: { isActive },
    });
    revalidatePath(PAGE_PATH);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "状態の更新に失敗しました"));
  }
}
