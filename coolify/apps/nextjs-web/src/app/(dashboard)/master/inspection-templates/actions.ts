"use server";

/**
 * Server Actions — 検査表テンプレート (MS09).
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
import {
  type LocalizedText,
  localized,
  localizedTranslations,
} from "@/lib/format";
import { discardTemplateImageFile } from "@/lib/inspection-template-image";
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
const templateFields = z.object({
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameTranslations: z.record(z.string(), z.string()).optional(),
  relatedProcessStepId: z.number().int().positive().nullable(),
  // 対象製品。null = どの製品にも使える（汎用）。
  productId: z.number().int().positive().nullable(),
  // ナビゲーション用グループ（任意）。
  groupId: z.number().int().positive().nullable(),
  // 検査対象（シート単位）: 全数 / 割合(%) / 本数
  samplingMode: z.enum(["ALL", "PERCENT", "COUNT"]),
  samplingValue: z.number().nullable(),
  // 記録方式（シート単位）: 実測値（製品ごと） / 合格数のみ
  recordStyle: z.enum(["VALUES", "COUNTS"]),
  // 印刷レイアウト（寸法測定表 / 外観・工程チェック表）
  layoutStyle: z.enum(["DIMENSIONAL", "CHECKLIST"]),
  // VALUES のサンプル呼称（製品1,2,3… / 初品・中間品・最終品）
  sampleNaming: z.enum(["GENERIC", "INITIAL_MID_FINAL"]),
  // 検査承認（検収）の宛先 — グループかカスタム（この検査表だけの承認者・
  // 複数可）のどちらか一方。両方未設定 = 誰でも承認できる（従来どおり）。
  approvalGroupId: z.number().int().positive().nullable(),
  approverUserIds: z.array(z.string()).max(50).default([]),
  isActive: z.boolean(),
});

/** 検査対象の値検証（PERCENT は 0–100、COUNT は 1 以上の整数）。 */
function refineSampling(
  v: { samplingMode: string; samplingValue: number | null },
  ctx: z.RefinementCtx,
) {
  const issue = (message: string) =>
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["samplingValue"],
      message,
    });
  if (v.samplingMode === "PERCENT") {
    if (v.samplingValue == null || v.samplingValue <= 0) {
      issue("検査対象の割合(%)を入力してください");
    } else if (v.samplingValue > 100) {
      issue("検査対象の割合は 100% 以下にしてください");
    }
  }
  if (v.samplingMode === "COUNT") {
    if (
      v.samplingValue == null ||
      v.samplingValue < 1 ||
      !Number.isInteger(v.samplingValue)
    ) {
      issue("検査対象の本数（1 以上の整数）を入力してください");
    }
  }
}

/** 検査承認の宛先検証（グループとカスタムは同時に設定しない — CM02 フォームの
 * 承認フロー段と同じ約束。両方未設定は「誰でも承認できる」として許可）。 */
function refineApprovalTarget(
  v: { approvalGroupId: number | null; approverUserIds: string[] },
  ctx: z.RefinementCtx,
) {
  if (v.approvalGroupId != null && v.approverUserIds.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["approverUserIds"],
      message:
        "承認グループとカスタム承認者は同時に設定できません（どちらか一方にしてください）",
    });
  }
}

const templateUpdateInput = templateFields
  .superRefine(refineSampling)
  .superRefine(refineApprovalTarget);

const templateCreateInput = templateFields
  .extend({
    code: z
      .string()
      .min(1, "コードを入力してください")
      .regex(
        /^[A-Za-z0-9_-]+$/,
        "コードは英数字・ハイフン・アンダースコアで入力してください",
      ),
  })
  .superRefine(refineSampling)
  .superRefine(refineApprovalTarget);

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
    inputType: z.enum([
      "BOOLEAN",
      "NUMBER",
      "SELECT_SINGLE",
      "SELECT_MULTI",
      "TEXT",
    ]),
    // NUMBER
    unit: z.string().optional(),
    toleranceMin: z.number().nullable(),
    toleranceMax: z.number().nullable(),
    goalNumber: z.number().nullable(),
    // NUMBER — 旧帳票の基本値・公差Top/Bottom（入力補助。指定時は
    // toleranceMin/Max を目標値からの差分で自動計算する）
    nominalValue: z.number().nullable(),
    toleranceTopDelta: z.number().nullable(),
    toleranceBottomDelta: z.number().nullable(),
    // BOOLEAN
    acceptBool: z.boolean().nullable(),
    goalBool: z.boolean().nullable(),
    // SELECT_*
    options: z.array(selectOptionInput),
    acceptOptions: z.array(z.string()),
    goalOptions: z.array(z.string()),
    allowManualOverride: z.boolean(),
    isRequired: z.boolean(),
    sortOrder: z.number().int(),
    // 旧 FileMaker 帳票との整合（表示のみ）
    section: z.enum(["MEASUREMENT", "SHAPE"]),
    department: z.enum(["MANUFACTURING", "QUALITY_ASSURANCE"]).nullable(),
    measurementEquipment: z.string().optional(),
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
      if (
        v.toleranceTopDelta != null &&
        v.toleranceBottomDelta != null &&
        v.toleranceTopDelta < v.toleranceBottomDelta
      ) {
        issue("toleranceTopDelta", "公差 Top は Bottom 以上にしてください");
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
  // 基本値/目標値/公差Top/Bottom（旧帳票の入力補助）が揃っていれば、
  // toleranceMin/Max（唯一の合否根拠）を目標値からの差分で自動計算する。
  // 揃っていなければ従来どおり toleranceMin/Max を直接の入力値として扱う。
  const autoRange =
    isNumber &&
    v.goalNumber != null &&
    v.toleranceTopDelta != null &&
    v.toleranceBottomDelta != null
      ? {
          min: v.goalNumber + v.toleranceBottomDelta,
          max: v.goalNumber + v.toleranceTopDelta,
        }
      : null;
  const toleranceMin = isNumber ? (autoRange?.min ?? v.toleranceMin) : null;
  const toleranceMax = isNumber ? (autoRange?.max ?? v.toleranceMax) : null;
  return {
    itemName: localizedInput(v.itemNameJa, v.itemNameEn),
    inputType: v.inputType,
    unit: isNumber ? v.unit?.trim() || null : null,
    toleranceMin,
    toleranceMax,
    nominalValue: isNumber ? v.nominalValue : null,
    toleranceTopDelta: isNumber ? v.toleranceTopDelta : null,
    toleranceBottomDelta: isNumber ? v.toleranceBottomDelta : null,
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
    allowManualOverride: v.allowManualOverride,
    isRequired: v.isRequired,
    sortOrder: v.sortOrder,
    section: v.section,
    department: v.department,
    measurementEquipment: v.measurementEquipment?.trim() || null,
  };
}

// ── バージョンロック ─────────────────────────────────────────────────────────

/** 指示書に割当済み or 検査記録があるバージョンは定義変更不可。 */
export async function isTemplateLocked(templateId: number): Promise<boolean> {
  const [linkCount, recordCount] = await Promise.all([
    prisma.workOrderStepInspectionTemplate.count({
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
        name: localizedInput(v.nameJa, undefined, v.nameTranslations),
        relatedProcessStepId: v.relatedProcessStepId,
        productId: v.productId,
        groupId: v.groupId,
        samplingMode: v.samplingMode,
        samplingValue: v.samplingMode === "ALL" ? null : v.samplingValue,
        recordStyle: v.recordStyle,
        layoutStyle: v.layoutStyle,
        sampleNaming: v.sampleNaming,
        approvalGroupId: v.approvalGroupId,
        approvers:
          v.approverUserIds.length > 0
            ? {
                create: v.approverUserIds.map((userId, i) => ({
                  userId,
                  sortOrder: i,
                })),
              }
            : undefined,
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
        productId: v.productId,
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
      select: {
        name: true,
        relatedProcessStepId: true,
        productId: true,
        samplingMode: true,
        samplingValue: true,
        recordStyle: true,
        layoutStyle: true,
        sampleNaming: true,
        isActive: true,
      },
    });
    if (!prior) return actionError("対象のテンプレートが見つかりません");
    // ロック中は状態（有効/無効）の切替のみ許可
    const priorName = prior.name as LocalizedText | null;
    const priorSamplingValue =
      prior.samplingValue == null ? null : Number(prior.samplingValue);
    const nameChanged =
      (priorName?.ja ?? "") !== v.nameJa ||
      JSON.stringify(localizedTranslations(priorName)) !==
        JSON.stringify(v.nameTranslations ?? {});
    const definitionChanged =
      nameChanged ||
      prior.relatedProcessStepId !== v.relatedProcessStepId ||
      prior.samplingMode !== v.samplingMode ||
      prior.recordStyle !== v.recordStyle ||
      prior.layoutStyle !== v.layoutStyle ||
      prior.sampleNaming !== v.sampleNaming ||
      priorSamplingValue !==
        (v.samplingMode === "ALL" ? null : v.samplingValue);
    if (definitionChanged && (await isTemplateLocked(id))) {
      return actionError(LOCKED_MESSAGE);
    }
    await prisma.inspectionTemplate.update({
      where: { id },
      data: {
        name: localizedInput(v.nameJa, undefined, v.nameTranslations),
        relatedProcessStepId: v.relatedProcessStepId,
        samplingMode: v.samplingMode,
        samplingValue: v.samplingMode === "ALL" ? null : v.samplingValue,
        recordStyle: v.recordStyle,
        layoutStyle: v.layoutStyle,
        sampleNaming: v.sampleNaming,
        // ロック中でも変更可（対象製品・グループ・誰が検収できるかの入れ替えは
        // 測定定義に触れない — isActive と同じ扱い）。
        productId: v.productId,
        groupId: v.groupId,
        approvalGroupId: v.approvalGroupId,
        approvers: {
          deleteMany: {},
          create: v.approverUserIds.map((userId, i) => ({
            userId,
            sortOrder: i,
          })),
        },
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
        productId: prior.productId,
        isActive: prior.isActive,
      },
      after: {
        nameJa: v.nameJa,
        relatedProcessStepId: v.relatedProcessStepId,
        productId: v.productId,
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
      include: {
        items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
        approvers: { orderBy: { sortOrder: "asc" } },
      },
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
          productId: source.productId,
          groupId: source.groupId,
          // 参考画像は複写しない — files 行は 1 テンプレート 1 枚の前提で
          // 削除時に実体ごと消すため、複写すると旧バージョン側の削除で
          // 新バージョンの画像まで消える（共有ミュータブル資源の罠）。
          // 要る場合は新バージョン側で改めてアップロードする。
          samplingMode: source.samplingMode,
          samplingValue: source.samplingValue,
          recordStyle: source.recordStyle,
          layoutStyle: source.layoutStyle,
          sampleNaming: source.sampleNaming,
          approvalGroupId: source.approvalGroupId,
          approvers: {
            create: source.approvers.map((a) => ({
              userId: a.userId,
              sortOrder: a.sortOrder,
            })),
          },
          isActive: true,
          items: {
            create: source.items.map((item) => ({
              itemName: item.itemName as object,
              inputType: item.inputType,
              unit: item.unit,
              toleranceMin: item.toleranceMin,
              toleranceMax: item.toleranceMax,
              nominalValue: item.nominalValue,
              toleranceTopDelta: item.toleranceTopDelta,
              toleranceBottomDelta: item.toleranceBottomDelta,
              options: item.options ?? undefined,
              acceptBool: item.acceptBool,
              acceptOptions: item.acceptOptions ?? undefined,
              goalValue: item.goalValue ?? undefined,
              allowManualOverride: item.allowManualOverride,
              isRequired: item.isRequired,
              sortOrder: item.sortOrder,
              section: item.section,
              department: item.department,
              measurementEquipment: item.measurementEquipment,
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

/**
 * 検査承認グループの変更のみ（ロック中でも可 — 測定定義に触れないため。
 * isActive の切替と同じ扱い）。既存の updateInspectionTemplate は
 * ロック中の版へは丸ごと拒否するので、ロック後に承認グループだけ入れ替える
 * ための専用アクションを別に持つ。
 */
export async function setInspectionTemplateApprovers(
  id: number,
  approvalGroupId: number | null,
  approverUserIds: string[],
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (approvalGroupId != null && approverUserIds.length > 0) {
    return actionError(
      "承認グループとカスタム承認者は同時に設定できません（どちらか一方にしてください）",
    );
  }
  try {
    await prisma.inspectionTemplate.update({
      where: { id },
      data: {
        approvalGroupId,
        approvers: {
          deleteMany: {},
          create: approverUserIds.map((userId, i) => ({
            userId,
            sortOrder: i,
          })),
        },
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "inspection_templates",
      recordId: String(id),
      after: { note: "検査承認の宛先を変更" },
    });
    revalidate(id);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "承認の宛先の変更に失敗しました"));
  }
}

export async function deleteInspectionTemplates(
  ids: number[],
): Promise<ActionResult> {
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    // 参考画像の実体は onDelete: SetNull では消えない（files 行は残る）ため、
    // テンプレート削除前に対象を控えておき、削除できた分だけ掃除する。
    const withImage = await prisma.inspectionTemplate.findMany({
      where: { id: { in: ids }, imageFileId: { not: null } },
      select: { id: true, imageFileId: true },
    });
    // 検査項目は onDelete: Cascade で一括削除。指示書リンク・検査記録が
    // 参照しているバージョンは P2003 で拒否される（= ロック中は消えない）。
    await prisma.inspectionTemplate.deleteMany({ where: { id: { in: ids } } });
    for (const t of withImage) {
      if (t.imageFileId) await discardTemplateImageFile(t.imageFileId);
    }
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

// ── 検査表グループ（ナビゲーション用。判定・PDF には無関係） ─────────────────

const groupInput = z.object({
  nameJa: z.string().min(1, "グループ名（日本語）を入力してください"),
  nameTranslations: z.record(z.string(), z.string()).optional(),
  isActive: z.boolean(),
});

export type InspectionTemplateGroupInput = z.infer<typeof groupInput>;

export interface InspectionTemplateGroupRow {
  id: number;
  nameJa: string;
  nameEn: string;
  sortOrder: number;
  isActive: boolean;
  templateCount: number;
}

export async function fetchInspectionTemplateGroups(): Promise<
  InspectionTemplateGroupRow[]
> {
  const rows = await prisma.inspectionTemplateGroup.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: { _count: { select: { templates: true } } },
  });
  return rows.map((r) => {
    const name = r.name as LocalizedText | null;
    return {
      id: r.id,
      nameJa: name?.ja ?? "",
      nameEn: name?.en ?? "",
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      templateCount: r._count.templates,
    };
  });
}

function revalidateGroups() {
  revalidatePath(BASE_PATH);
}

export async function createInspectionTemplateGroup(
  input: InspectionTemplateGroupInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = groupInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const max = await prisma.inspectionTemplateGroup.aggregate({
      _max: { sortOrder: true },
    });
    const created = await prisma.inspectionTemplateGroup.create({
      data: {
        name: localizedInput(v.nameJa, undefined, v.nameTranslations),
        sortOrder: (max._max.sortOrder ?? 0) + 10,
        isActive: v.isActive,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "inspection_template_groups",
      recordId: String(created.id),
      after: { nameJa: v.nameJa, isActive: v.isActive },
    });
    revalidateGroups();
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "グループの作成に失敗しました"));
  }
}

export async function updateInspectionTemplateGroup(
  id: number,
  input: InspectionTemplateGroupInput,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = groupInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const prior = await prisma.inspectionTemplateGroup.findUnique({
      where: { id },
      select: { name: true, isActive: true },
    });
    if (!prior) return actionError("対象のグループが見つかりません");
    await prisma.inspectionTemplateGroup.update({
      where: { id },
      data: {
        name: localizedInput(v.nameJa, undefined, v.nameTranslations),
        isActive: v.isActive,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "inspection_template_groups",
      recordId: String(id),
      before: { nameJa: localized(prior.name as LocalizedText | null) },
      after: { nameJa: v.nameJa, isActive: v.isActive },
    });
    revalidateGroups();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "グループの更新に失敗しました"));
  }
}

/** 表示順の入れ替え（並び替え UI が新しい順序の全 id を渡す）。 */
export async function reorderInspectionTemplateGroups(
  orderedIds: number[],
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    await prisma.$transaction(
      orderedIds.map((id, i) =>
        prisma.inspectionTemplateGroup.update({
          where: { id },
          data: { sortOrder: (i + 1) * 10 },
        }),
      ),
    );
    revalidateGroups();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "並び順の更新に失敗しました"));
  }
}

export async function deleteInspectionTemplateGroup(
  id: number,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const count = await prisma.inspectionTemplate.count({
      where: { groupId: id },
    });
    if (count > 0) {
      return actionError(
        "このグループに属する検査表テンプレートがあるため削除できません。先に各テンプレートのグループを外してください",
      );
    }
    await prisma.inspectionTemplateGroup.delete({ where: { id } });
    await recordAudit({
      action: "DELETE",
      tableName: "inspection_template_groups",
      recordId: String(id),
    });
    revalidateGroups();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "グループの削除に失敗しました"));
  }
}
