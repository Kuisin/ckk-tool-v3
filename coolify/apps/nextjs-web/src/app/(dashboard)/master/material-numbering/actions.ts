"use server";

/**
 * Server Actions — 採番構成 (MS07).
 *
 * 材種/素材コードの構成要素マスタ（メーカー / メーカー材種 / 形状 / 種類 /
 * 黒皮・研磨 / 直径 / 全長）の追加と有効・無効切替。コードは合成 id
 * （材種・素材コード）に埋め込まれるため削除は提供しない。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
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

type Tr = Awaited<ReturnType<typeof getTranslations>>;

function nameFields(tr: Tr) {
  return {
    nameJa: z.string().min(1, tr("common.nameJaRequired")),
    nameEn: z.string().optional(),
  };
}

const dup = (e: unknown, fallback: string, tr: Tr) => {
  const code =
    typeof e === "object" && e !== null && "code" in e
      ? String((e as { code: unknown }).code)
      : undefined;
  if (code === "P2002")
    return actionError(tr("master.materialNumberingActions.duplicateCode"));
  return actionError(prismaErrorMessage(e, fallback, tr));
};

async function audit(table: string, recordId: string, after: object) {
  await recordAudit({ action: "CREATE", tableName: table, recordId, after });
  revalidatePath(PAGE_PATH);
}

// ── 追加 ────────────────────────────────────────────────────────────────────

function manufacturerInputSchema(tr: Tr) {
  return z.object({
    code: z
      .string()
      .regex(
        /^[A-Z]$/,
        tr("master.materialNumberingActions.codeSingleUppercase"),
      ),
    ...nameFields(tr),
  });
}

export async function createManufacturer(
  input: z.infer<ReturnType<typeof manufacturerInputSchema>>,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const p = manufacturerInputSchema(tr).safeParse(input);
  if (!p.success)
    return actionError(p.error.issues[0]?.message ?? tr("common.invalidInput"));
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
    return dup(
      e,
      tr("master.materialNumberingActions.manufacturerAddFailed"),
      tr,
    );
  }
}

function gradeInputSchema(tr: Tr) {
  return z.object({
    manufacturerCode: z
      .string()
      .regex(/^[A-Z]$/, tr("master.materialTypeForm.selectAManufacturer2")),
    code: z
      .string()
      .regex(/^[0-9]{2}$/, tr("master.materialNumberingActions.codeTwoDigits")),
    ...nameFields(tr),
  });
}

export async function createGrade(
  input: z.infer<ReturnType<typeof gradeInputSchema>>,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const p = gradeInputSchema(tr).safeParse(input);
  if (!p.success)
    return actionError(p.error.issues[0]?.message ?? tr("common.invalidInput"));
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
    return dup(e, tr("master.materialNumberingActions.gradeAddFailed"), tr);
  }
}

function shapeInputSchema(tr: Tr) {
  return z.object({
    code: z
      .string()
      .regex(
        /^[A-Z]$/,
        tr("master.materialNumberingActions.codeSingleUppercase"),
      ),
    ...nameFields(tr),
  });
}

export async function createShape(
  input: z.infer<ReturnType<typeof shapeInputSchema>>,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const p = shapeInputSchema(tr).safeParse(input);
  if (!p.success)
    return actionError(p.error.issues[0]?.message ?? tr("common.invalidInput"));
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
    return dup(e, tr("master.materialNumberingActions.shapeAddFailed"), tr);
  }
}

function kindInputSchema(tr: Tr) {
  return z.object({
    shapeCode: z
      .string()
      .regex(/^[A-Z]$/, tr("master.materialTypeForm.selectAShape2")),
    code: z
      .string()
      .regex(
        /^[A-Z0-9]{2}$/,
        tr("master.materialNumberingActions.codeAlnumTwoDigits"),
      ),
    ...nameFields(tr),
  });
}

export async function createKind(
  input: z.infer<ReturnType<typeof kindInputSchema>>,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const p = kindInputSchema(tr).safeParse(input);
  if (!p.success)
    return actionError(p.error.issues[0]?.message ?? tr("common.invalidInput"));
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
    return dup(e, tr("master.materialNumberingActions.kindAddFailed"), tr);
  }
}

function finishInputSchema(tr: Tr) {
  return z.object({
    code: z
      .string()
      .regex(
        /^[A-Z]$/,
        tr("master.materialNumberingActions.codeSingleUppercase"),
      ),
    ...nameFields(tr),
  });
}

export async function createSurfaceFinish(
  input: z.infer<ReturnType<typeof finishInputSchema>>,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const p = finishInputSchema(tr).safeParse(input);
  if (!p.success)
    return actionError(p.error.issues[0]?.message ?? tr("common.invalidInput"));
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
    return dup(
      e,
      tr("master.materialNumberingActions.surfaceFinishAddFailed"),
      tr,
    );
  }
}

function diameterInputSchema(tr: Tr) {
  return z.object({
    diameterMm: z
      .number({ message: tr("master.materialForm.diameterRequired") })
      .min(0.1, tr("master.materialNumberingActions.diameterRangeInvalid"))
      .max(99.9, tr("master.materialNumberingActions.diameterRangeInvalid")),
  });
}

export async function createDiameter(
  input: z.infer<ReturnType<typeof diameterInputSchema>>,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const p = diameterInputSchema(tr).safeParse(input);
  if (!p.success)
    return actionError(p.error.issues[0]?.message ?? tr("common.invalidInput"));
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
    return dup(e, tr("master.materialNumberingActions.diameterAddFailed"), tr);
  }
}

function lengthInputSchema(tr: Tr) {
  return z.object({
    lengthMm: z
      .number({ message: tr("master.materialForm.lengthRequired") })
      .min(1, tr("master.materialNumberingActions.lengthRangeInvalid"))
      .max(999, tr("master.materialNumberingActions.lengthRangeInvalid")),
    customLabel: z.string().optional(),
  });
}

export async function createLengthVariant(
  input: z.infer<ReturnType<typeof lengthInputSchema>>,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const p = lengthInputSchema(tr).safeParse(input);
  if (!p.success)
    return actionError(p.error.issues[0]?.message ?? tr("common.invalidInput"));
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
    return dup(e, tr("master.materialNumberingActions.lengthAddFailed"), tr);
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
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const p = setActiveInput.safeParse(input);
  if (!p.success)
    return actionError(p.error.issues[0]?.message ?? tr("common.invalidInput"));
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
        if (!parentCode)
          return actionError(
            tr("master.materialNumberingActions.manufacturerCodeRequired"),
          );
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
        if (!parentCode)
          return actionError(
            tr("master.materialNumberingActions.shapeCodeRequired"),
          );
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
    return actionError(
      prismaErrorMessage(e, tr("common.statusUpdateFailed"), tr),
    );
  }
}
