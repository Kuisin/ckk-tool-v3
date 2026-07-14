"use server";

/**
 * Server Actions — 検査表テンプレート (MS08).
 *
 * テンプレート本体の CRUD と、検査項目（inspection_template_items）の
 * インライン追加・編集・削除（design.md §13.4 — 項目に個別ページは持たない）。
 * 項目操作の監査はテンプレート行（recordId = String(templateId)）に記録する。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/master/inspection-templates";

// 編集可能フィールド（code は識別子 — 作成後不変）
const templateUpdateInput = z.object({
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string().optional(),
  relatedProcessStepId: z.number().int().positive().nullable(),
  isActive: z.boolean(),
});

const templateCreateInput = templateUpdateInput.extend({
  code: z
    .string()
    .min(1, "コードを入力してください")
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "コードは英数字・ハイフン・アンダースコアで入力してください",
    ),
});

export type InspectionTemplateUpdateInput = z.infer<typeof templateUpdateInput>;
export type InspectionTemplateCreateInput = z.infer<typeof templateCreateInput>;

// 検査項目（許容値は min ≦ max）
const templateItemInput = z
  .object({
    itemNameJa: z.string().min(1, "項目名（日本語）を入力してください"),
    itemNameEn: z.string().optional(),
    unit: z.string().optional(),
    toleranceMin: z.number().nullable(),
    toleranceMax: z.number().nullable(),
    isRequired: z.boolean(),
    sortOrder: z.number().int(),
  })
  .superRefine((v, ctx) => {
    if (
      v.toleranceMin != null &&
      v.toleranceMax != null &&
      v.toleranceMin > v.toleranceMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toleranceMax"],
        message: "許容値の上限は下限以上にしてください",
      });
    }
  });

export type InspectionTemplateItemInput = z.infer<typeof templateItemInput>;

function revalidate(id?: number) {
  revalidatePath(BASE_PATH);
  if (id != null) revalidatePath(`${BASE_PATH}/${id}`);
}

export async function createInspectionTemplate(
  input: InspectionTemplateCreateInput,
): Promise<ActionResult<{ id: number }>> {
  const parsed = templateCreateInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const created = await prisma.inspectionTemplate.create({
      data: {
        code: v.code.trim(),
        name: localizedInput(v.nameJa, v.nameEn),
        relatedProcessStepId: v.relatedProcessStepId,
        isActive: v.isActive,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "inspection_templates",
      recordId: String(created.id),
      after: {
        code: v.code.trim(),
        nameJa: v.nameJa,
        relatedProcessStepId: v.relatedProcessStepId,
        isActive: v.isActive,
      },
    });
    revalidate(created.id);
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, "検査表テンプレートの作成に失敗しました"),
    );
  }
}

export async function updateInspectionTemplate(
  id: number,
  input: InspectionTemplateUpdateInput,
): Promise<ActionResult<{ id: number }>> {
  const parsed = templateUpdateInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const prior = await prisma.inspectionTemplate.findUnique({
      where: { id },
      select: { name: true, relatedProcessStepId: true, isActive: true },
    });
    await prisma.inspectionTemplate.update({
      where: { id },
      data: {
        name: localizedInput(v.nameJa, v.nameEn),
        relatedProcessStepId: v.relatedProcessStepId,
        isActive: v.isActive,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "inspection_templates",
      recordId: String(id),
      before: prior
        ? {
            nameJa: localized(prior.name as LocalizedText | null),
            relatedProcessStepId: prior.relatedProcessStepId,
            isActive: prior.isActive,
          }
        : undefined,
      after: {
        nameJa: v.nameJa,
        relatedProcessStepId: v.relatedProcessStepId,
        isActive: v.isActive,
      },
    });
    revalidate(id);
    return actionOk({ id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, "検査表テンプレートの更新に失敗しました"),
    );
  }
}

export async function setInspectionTemplatesActive(
  ids: number[],
  isActive: boolean,
): Promise<ActionResult> {
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    await prisma.inspectionTemplate.updateMany({
      where: { id: { in: ids } },
      data: { isActive },
    });
    for (const id of ids) {
      await recordAudit({
        action: "UPDATE",
        tableName: "inspection_templates",
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

export async function deleteInspectionTemplates(
  ids: number[],
): Promise<ActionResult> {
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    // 検査項目は onDelete: Cascade で一括削除。将来 検査記録（inspection_records）
    // や指示書がテンプレートを参照するようになると P2003 で拒否される。
    await prisma.inspectionTemplate.deleteMany({ where: { id: { in: ids } } });
    for (const id of ids) {
      await recordAudit({
        action: "DELETE",
        tableName: "inspection_templates",
        recordId: String(id),
      });
    }
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, "検査表テンプレートの削除に失敗しました"),
    );
  }
}

// ── 検査項目（テンプレート詳細のインライン編集） ─────────────────────────────

export async function addTemplateItem(
  templateId: number,
  input: InspectionTemplateItemInput,
): Promise<ActionResult<{ id: number }>> {
  const parsed = templateItemInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const created = await prisma.inspectionTemplateItem.create({
      data: {
        templateId,
        itemName: localizedInput(v.itemNameJa, v.itemNameEn),
        unit: v.unit?.trim() || null,
        toleranceMin: v.toleranceMin,
        toleranceMax: v.toleranceMax,
        isRequired: v.isRequired,
        sortOrder: v.sortOrder,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "inspection_templates",
      recordId: String(templateId),
      after: { note: `検査項目「${v.itemNameJa}」を追加` },
    });
    revalidate(templateId);
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "検査項目の追加に失敗しました"));
  }
}

export async function updateTemplateItem(
  itemId: number,
  input: InspectionTemplateItemInput,
): Promise<ActionResult<{ id: number }>> {
  const parsed = templateItemInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const prior = await prisma.inspectionTemplateItem.findUnique({
      where: { id: itemId },
      select: { templateId: true },
    });
    if (!prior) return actionError("対象の検査項目が見つかりません");
    await prisma.inspectionTemplateItem.update({
      where: { id: itemId },
      data: {
        itemName: localizedInput(v.itemNameJa, v.itemNameEn),
        unit: v.unit?.trim() || null,
        toleranceMin: v.toleranceMin,
        toleranceMax: v.toleranceMax,
        isRequired: v.isRequired,
        sortOrder: v.sortOrder,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "inspection_templates",
      recordId: String(prior.templateId),
      after: { note: `検査項目「${v.itemNameJa}」を更新` },
    });
    revalidate(prior.templateId);
    return actionOk({ id: itemId });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "検査項目の更新に失敗しました"));
  }
}

export async function deleteTemplateItem(
  itemId: number,
): Promise<ActionResult> {
  try {
    const prior = await prisma.inspectionTemplateItem.findUnique({
      where: { id: itemId },
      select: { templateId: true, itemName: true },
    });
    if (!prior) return actionError("対象の検査項目が見つかりません");
    await prisma.inspectionTemplateItem.delete({ where: { id: itemId } });
    await recordAudit({
      action: "UPDATE",
      tableName: "inspection_templates",
      recordId: String(prior.templateId),
      after: {
        note: `検査項目「${localized(prior.itemName as LocalizedText | null)}」を削除`,
      },
    });
    revalidate(prior.templateId);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "検査項目の削除に失敗しました"));
  }
}
