"use server";

/**
 * Server Actions — 不良種類マスタ (MS0A).
 *
 * コード + { ja, en } 名称 + 表示順のみの小さなマスタ。詳細ページを持たず、
 * 一覧のモーダルで編集する（structure.md — defect-types は list/new のみ）。
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
  localizedInput,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/master/defect-types";

const defectTypeInput = z.object({
  code: z.string().min(1, "コードを入力してください"),
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameTranslations: z.record(z.string(), z.string()).optional(),
  sortOrder: z.number().int("表示順は整数で入力してください").min(0),
  isActive: z.boolean(),
});

export type DefectTypeInput = z.infer<typeof defectTypeInput>;

function revalidate() {
  revalidatePath(BASE_PATH);
}

export async function createDefectType(
  input: DefectTypeInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = defectTypeInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
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
    return actionError(prismaErrorMessage(e, "不良種類の作成に失敗しました"));
  }
}

export async function updateDefectType(
  id: number,
  input: DefectTypeInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = defectTypeInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
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
    return actionError(prismaErrorMessage(e, "不良種類の更新に失敗しました"));
  }
}

export async function setDefectTypesActive(
  ids: number[],
  isActive: boolean,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError("対象が選択されていません");
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
    return actionError(prismaErrorMessage(e, "状態の更新に失敗しました"));
  }
}

export async function deleteDefectTypes(ids: number[]): Promise<ActionResult> {
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError("対象が選択されていません");
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
        return actionError(
          "不良記録で使用中の不良種類は削除できません（無効化してください）",
        );
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
    return actionError(prismaErrorMessage(e, "不良種類の削除に失敗しました"));
  }
}
