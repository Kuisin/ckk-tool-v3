"use server";

/**
 * Server Actions — 不良種類マスタ (MS0A).
 *
 * コード + { ja, en } 名称 + 表示順のみの小さなマスタ。詳細ページを持たず、
 * 一覧のモーダルで編集する（structure.md — defect-types は list/new のみ）。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/master/defect-types";

function defectTypeInputSchema(
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
  return z.object({
    code: z.string().min(1, tr("common.codeRequired")),
    nameJa: z.string().min(1, tr("common.nameJaRequired")),
    nameTranslations: z.record(z.string(), z.string()).optional(),
    sortOrder: z
      .number()
      .int(tr("master.processSteps.sortOrderInteger"))
      .min(0),
    isActive: z.boolean(),
  });
}

export type DefectTypeInput = z.infer<ReturnType<typeof defectTypeInputSchema>>;

function revalidate() {
  revalidatePath(BASE_PATH);
}

export async function createDefectType(
  input: DefectTypeInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = defectTypeInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const created = await prisma.defectType.create({
      data: {
        code: v.code.trim(),
        name: localizedInput(v.nameJa, undefined, v.nameTranslations),
        sortOrder: v.sortOrder,
        isActive: v.isActive,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "defect_types",
      recordId: String(created.id),
      after: {
        code: v.code.trim(),
        nameJa: v.nameJa,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
      },
    });
    revalidate();
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.defectTypeActions.createFailed"), tr),
    );
  }
}

export async function updateDefectType(
  id: number,
  input: DefectTypeInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = defectTypeInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const prior = await prisma.defectType.findUnique({
      where: { id },
      select: { sortOrder: true, isActive: true },
    });
    // code は識別子のため更新対象に含めない（編集モーダルでも disabled）。
    await prisma.defectType.update({
      where: { id },
      data: {
        name: localizedInput(v.nameJa, undefined, v.nameTranslations),
        sortOrder: v.sortOrder,
        isActive: v.isActive,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "defect_types",
      recordId: String(id),
      before: prior ?? undefined,
      after: { nameJa: v.nameJa, sortOrder: v.sortOrder, isActive: v.isActive },
    });
    revalidate();
    return actionOk({ id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.defectTypeActions.updateFailed"), tr),
    );
  }
}

export async function setDefectTypesActive(
  ids: number[],
  isActive: boolean,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError(tr("common.noTargetSelected"));
  try {
    await prisma.defectType.updateMany({
      where: { id: { in: ids } },
      data: { isActive },
    });
    for (const id of ids) {
      await recordAudit({
        action: "UPDATE",
        tableName: "defect_types",
        recordId: String(id),
        after: { isActive },
      });
    }
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("common.statusUpdateFailed"), tr),
    );
  }
}

export async function deleteDefectTypes(ids: number[]): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError(tr("common.noTargetSelected"));
  try {
    // Guard: 工程完了の不良内訳（work_order_steps.defect_reasons JSON）が
    // 参照している種類は消させない（FK ではないので DB は守ってくれない）。
    // defect_records の FK 違反は P2003 として prismaErrorMessage が変換する。
    for (const id of ids) {
      const used = await prisma.$queryRaw<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM app.work_order_steps
          WHERE defect_reasons @> ${JSON.stringify([{ defectTypeId: id }])}::jsonb
        ) AS "exists"`;
      if (used[0]?.exists) {
        return actionError(tr("master.defectTypeActions.inUseCannotDelete"));
      }
    }
    await prisma.defectType.deleteMany({ where: { id: { in: ids } } });
    for (const id of ids) {
      await recordAudit({
        action: "DELETE",
        tableName: "defect_types",
        recordId: String(id),
      });
    }
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.defectTypeActions.deleteFailed"), tr),
    );
  }
}
