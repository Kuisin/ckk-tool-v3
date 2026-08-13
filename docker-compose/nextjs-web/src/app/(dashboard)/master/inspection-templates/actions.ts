"use server";

/**
 * Server Actions — 検査表テンプレート (MS08).
 *
 * テンプレート本体の CRUD と、検査項目（inspection_template_items）の
 * インライン追加・編集・削除（design.md §13.4 — 項目に個別ページは持たない）。
 * 項目操作の監査はテンプレート行（recordId = String(templateId)）に記録する。
 *
 * バージョン管理: 同一 code に複数バージョン（各バージョンが完全な行 + 項目）。
 * 指示書に割当済み or 検査記録があるバージョンは **ロック** — 名称・関連工程・
 * 項目の変更は拒否し、`createInspectionTemplateVersion` で新バージョンを
 * コピー作成してから編集する（記録は使用したバージョンに固定される）。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { Prisma, prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/master/inspection-templates";

const LOCKED_MESSAGE =
  "このバージョンは指示書または検査記録で使用中のため変更できません。新バージョンを作成してください";

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

// ── 検査項目（型別バリデーション） ───────────────────────────────────────────

const selectOptionInput = z.object({
  value: z.string().min(1),
  labelJa: z.string().min(1, "選択肢の表示名（日本語）を入力してください"),
  labelEn: z.string().optional(),
});

const templateItemInput = z
  .object({
    itemNameJa: z.string().min(1, "項目名（日本語）を入力してください"),
    itemNameEn: z.string().optional(),
    inputType: z.enum(["BOOLEAN", "NUMBER", "SELECT_SINGLE", "SELECT_MULTI"]),
    // NUMBER
    unit: z.string().optional(),
    toleranceMin: z.number().nullable(),
    toleranceMax: z.number().nullable(),
    goalNumber: z.number().nullable(),
    // BOOLEAN
    acceptBool: z.boolean().nullable(),
    goalBool: z.boolean().nullable(),
    // SELECT_*
    options: z.array(selectOptionInput),
    acceptOptions: z.array(z.string()),
    goalOptions: z.array(z.string()),
    // 抜取
    samplingMode: z.enum(["ALL", "PERCENT", "COUNT"]),
    samplingValue: z.number().nullable(),
    isRequired: z.boolean(),
    sortOrder: z.number().int(),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    if (v.inputType === "NUMBER") {
      if (
        v.toleranceMin != null &&
        v.toleranceMax != null &&
        v.toleranceMin > v.toleranceMax
      ) {
        issue("toleranceMax", "合格範囲の上限は下限以上にしてください");
      }
    }
    if (v.inputType === "SELECT_SINGLE" || v.inputType === "SELECT_MULTI") {
      if (v.options.length === 0) {
        issue("options", "選択肢を 1 つ以上登録してください");
      }
      const values = v.options.map((o) => o.value);
      if (new Set(values).size !== values.length) {
        issue("options", "選択肢が重複しています");
      }
      const valueSet = new Set(values);
      if (!v.acceptOptions.every((a) => valueSet.has(a))) {
        issue("acceptOptions", "合格選択肢は登録した選択肢から選んでください");
      }
      if (!v.goalOptions.every((g) => valueSet.has(g))) {
        issue("goalOptions", "目標は登録した選択肢から選んでください");
      }
      if (v.inputType === "SELECT_SINGLE" && v.goalOptions.length > 1) {
        issue("goalOptions", "単一選択の目標は 1 つまでです");
      }
    }
    if (v.samplingMode === "PERCENT") {
      if (v.samplingValue == null || v.samplingValue <= 0) {
        issue("samplingValue", "抜取の割合(%)を入力してください");
      } else if (v.samplingValue > 100) {
        issue("samplingValue", "抜取の割合は 100% 以下にしてください");
      }
    }
    if (v.samplingMode === "COUNT") {
      if (
        v.samplingValue == null ||
        v.samplingValue < 1 ||
        !Number.isInteger(v.samplingValue)
      ) {
        issue("samplingValue", "抜取の本数（1 以上の整数）を入力してください");
      }
    }
  });

export type InspectionTemplateItemInput = z.infer<typeof templateItemInput>;

/** 入力を inputType に応じた DB カラム値へ正規化（無関係な型の値は null に落とす）。 */
function itemData(v: InspectionTemplateItemInput) {
  const isNumber = v.inputType === "NUMBER";
  const isBool = v.inputType === "BOOLEAN";
  const isSelect =
    v.inputType === "SELECT_SINGLE" || v.inputType === "SELECT_MULTI";
  const goalValue = isNumber
    ? v.goalNumber
    : isBool
      ? v.goalBool
      : v.goalOptions.length === 0
        ? null
        : v.inputType === "SELECT_SINGLE"
          ? v.goalOptions[0]
          : v.goalOptions;
  return {
    itemName: localizedInput(v.itemNameJa, v.itemNameEn),
    inputType: v.inputType,
    unit: isNumber ? v.unit?.trim() || null : null,
    toleranceMin: isNumber ? v.toleranceMin : null,
    toleranceMax: isNumber ? v.toleranceMax : null,
    options: isSelect
      ? v.options.map((o) => ({
          value: o.value,
          label: localizedInput(o.labelJa, o.labelEn),
        }))
      : undefined,
    acceptBool: isBool ? v.acceptBool : null,
    acceptOptions:
      isSelect && v.acceptOptions.length > 0 ? v.acceptOptions : undefined,
    goalValue: goalValue ?? undefined,
    samplingMode: v.samplingMode,
    samplingValue: v.samplingMode === "ALL" ? null : v.samplingValue,
    isRequired: v.isRequired,
    sortOrder: v.sortOrder,
  };
}

// ── バージョンロック ─────────────────────────────────────────────────────────

/** 指示書に割当済み or 検査記録があるバージョンは定義変更不可。 */
export async function isTemplateLocked(templateId: number): Promise<boolean> {
  const [linkCount, recordCount] = await Promise.all([
    prisma.workOrderInspectionTemplate.count({
      where: { inspectionTemplateId: templateId },
    }),
    prisma.inspectionRecord.count({ where: { templateId } }),
  ]);
  return linkCount > 0 || recordCount > 0;
}

function revalidate(id?: number) {
  revalidatePath(BASE_PATH);
  if (id != null) revalidatePath(`${BASE_PATH}/${id}`);
}

export async function createInspectionTemplate(
  input: InspectionTemplateCreateInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
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
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
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
    if (!prior) return actionError("対象のテンプレートが見つかりません");
    // ロック中は状態（有効/無効）の切替のみ許可
    const priorName = prior.name as LocalizedText | null;
    const definitionChanged =
      (priorName?.ja ?? "") !== v.nameJa ||
      (priorName?.en ?? "") !== (v.nameEn ?? "") ||
      prior.relatedProcessStepId !== v.relatedProcessStepId;
    if (definitionChanged && (await isTemplateLocked(id))) {
      return actionError(LOCKED_MESSAGE);
    }
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
      before: {
        nameJa: localized(priorName),
        relatedProcessStepId: prior.relatedProcessStepId,
        isActive: prior.isActive,
      },
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

/**
 * 新バージョンを作成 — テンプレート行 + 全項目を version = (同 code の最大 + 1)
 * でコピーし、新しい行の id を返す。元バージョンはそのまま（無効化は手動 —
 * 新旧バージョンの併用を許容する）。
 */
export async function createInspectionTemplateVersion(
  id: number,
): Promise<ActionResult<{ id: number; version: number }>> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const source = await prisma.inspectionTemplate.findUnique({
      where: { id },
      include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
    });
    if (!source) return actionError("対象のテンプレートが見つかりません");
    const created = await prisma.$transaction(async (tx) => {
      const max = await tx.inspectionTemplate.aggregate({
        where: { code: source.code },
        _max: { version: true },
      });
      const version = (max._max.version ?? source.version) + 1;
      return tx.inspectionTemplate.create({
        data: {
          code: source.code,
          version,
          name: source.name as object,
          relatedProcessStepId: source.relatedProcessStepId,
          isActive: true,
          items: {
            create: source.items.map((item) => ({
              itemName: item.itemName as object,
              inputType: item.inputType,
              unit: item.unit,
              toleranceMin: item.toleranceMin,
              toleranceMax: item.toleranceMax,
              options: item.options ?? undefined,
              acceptBool: item.acceptBool,
              acceptOptions: item.acceptOptions ?? undefined,
              goalValue: item.goalValue ?? undefined,
              samplingMode: item.samplingMode,
              samplingValue: item.samplingValue,
              isRequired: item.isRequired,
              sortOrder: item.sortOrder,
            })),
          },
        },
        select: { id: true, version: true },
      });
    });
    await recordAudit({
      action: "CREATE",
      tableName: "inspection_templates",
      recordId: String(created.id),
      after: {
        note: `${source.code} v${created.version} を v${source.version} からコピー作成`,
      },
    });
    revalidate(created.id);
    revalidatePath(`${BASE_PATH}/${id}`);
    return actionOk(created);
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, "新バージョンの作成に失敗しました"),
    );
  }
}

export async function setInspectionTemplatesActive(
  ids: number[],
  isActive: boolean,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
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
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    // 検査項目は onDelete: Cascade で一括削除。指示書リンク・検査記録が
    // 参照しているバージョンは P2003 で拒否される（= ロック中は消えない）。
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
  // 検査項目の増減はテンプレート本体の編集扱い（監査も UPDATE で記録）。
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = templateItemInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  if (await isTemplateLocked(templateId)) return actionError(LOCKED_MESSAGE);
  const v = parsed.data;
  try {
    const created = await prisma.inspectionTemplateItem.create({
      data: { templateId, ...itemData(v) },
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
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
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
    if (await isTemplateLocked(prior.templateId)) {
      return actionError(LOCKED_MESSAGE);
    }
    // Prisma は Json カラムに undefined を渡すと「変更なし」になるため、
    // 型切替で無関係になった JSON 値は DbNull で明示的にクリアする。
    const data = itemData(v);
    await prisma.inspectionTemplateItem.update({
      where: { id: itemId },
      data: {
        ...data,
        options: data.options ?? Prisma.DbNull,
        acceptOptions: data.acceptOptions ?? Prisma.DbNull,
        goalValue: data.goalValue ?? Prisma.DbNull,
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
  // 検査項目の増減はテンプレート本体の編集扱い（監査も UPDATE で記録）。
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.inspectionTemplateItem.findUnique({
      where: { id: itemId },
      select: { templateId: true, itemName: true },
    });
    if (!prior) return actionError("対象の検査項目が見つかりません");
    if (await isTemplateLocked(prior.templateId)) {
      return actionError(LOCKED_MESSAGE);
    }
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
