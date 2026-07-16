"use server";

/**
 * Server Actions — 工程マスタ (MS07).
 *
 * process_step_catalog（工程カタログ）と、その使用依存
 * （process_step_use_dependencies = ワークフローに含めてよい条件）・実行依存
 * （process_step_exec_dependencies = 開始してよい条件）の CRUD。
 * 依存行は保存のたびに全置換（deleteMany → createMany を $transaction で
 * アトミックに実行）する。自己依存・依存先の重複は不可。
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

const BASE_PATH = "/master/process-steps";

const relationSchema = z.enum(["AND", "OR"]);

// 使用依存の 1 行（is_negation = 排他条件 !）
const useDependencyInput = z.object({
  dependsOnStepId: z.number().int().min(1, "依存先の工程を選択してください"),
  relation: relationSchema,
  isNegation: z.boolean(),
  notes: z.string().optional(),
});

// 実行依存の 1 行（排他なし）
const execDependencyInput = z.object({
  dependsOnStepId: z.number().int().min(1, "依存先の工程を選択してください"),
  relation: relationSchema,
  notes: z.string().optional(),
});

const processStepUpdateInput = z.object({
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string().optional(),
  category: z.enum([
    "MATERIAL_PREP",
    "MACHINING",
    "COATING",
    "INSPECTION",
    "APPROVAL",
    "SHIPPING",
  ]),
  executionLocation: z.enum(["INTERNAL", "INTERNAL_OR_OUTSOURCE"]),
  isSyncCapable: z.boolean(),
  isInspection: z.boolean(),
  isApprovalStep: z.boolean(),
  approvalMinRank: z.string().optional(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  notes: z.string().optional(),
  useDependencies: z.array(useDependencyInput),
  execDependencies: z.array(execDependencyInput),
});

// 工程コードは作成後不変（識別キー）。例: CYLINDER_MACHINING
const processStepCreateInput = processStepUpdateInput.extend({
  code: z
    .string()
    .min(1, "工程コードを入力してください")
    .regex(
      /^[A-Z][A-Z0-9_]*$/,
      "工程コードは英大文字はじまりの英大文字・数字・アンダースコアで入力してください",
    ),
});

export type ProcessStepUpdateInput = z.infer<typeof processStepUpdateInput>;
export type ProcessStepCreateInput = z.infer<typeof processStepCreateInput>;

type DependencyRows = Pick<
  ProcessStepUpdateInput,
  "useDependencies" | "execDependencies"
>;

function revalidate(id?: number) {
  revalidatePath(BASE_PATH);
  if (id != null) revalidatePath(`${BASE_PATH}/${id}`);
}

/**
 * 依存行の整合性チェック（自己依存・重複・依存先の存在）。
 * selfId は編集時のみ（新規はまだ id が無いので自己依存は起こり得ない）。
 * エラー時はメッセージ、問題なければ null を返す。
 */
async function validateDependencies(
  selfId: number | null,
  deps: DependencyRows,
): Promise<string | null> {
  const groups = [
    {
      label: "使用依存",
      ids: deps.useDependencies.map((d) => d.dependsOnStepId),
    },
    {
      label: "実行依存",
      ids: deps.execDependencies.map((d) => d.dependsOnStepId),
    },
  ];
  for (const g of groups) {
    if (selfId != null && g.ids.includes(selfId)) {
      return `${g.label}に自分自身の工程は指定できません`;
    }
    if (new Set(g.ids).size !== g.ids.length) {
      return `${g.label}の依存先工程が重複しています`;
    }
  }
  const targetIds = [...new Set(groups.flatMap((g) => g.ids))];
  if (targetIds.length > 0) {
    const found = await prisma.processStepCatalog.count({
      where: { id: { in: targetIds } },
    });
    if (found !== targetIds.length) {
      return "依存先に存在しない工程が含まれています";
    }
  }
  return null;
}

/** 検査承認工程でなければ承認必要役職は保持しない（トグルと揃える）。 */
function approvalMinRankValue(v: ProcessStepUpdateInput): string | null {
  return v.isApprovalStep ? v.approvalMinRank?.trim() || null : null;
}

export async function createProcessStep(
  input: ProcessStepCreateInput,
): Promise<ActionResult<{ id: number; code: string }>> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = processStepCreateInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const depError = await validateDependencies(null, v);
    if (depError) return actionError(depError);

    const created = await prisma.$transaction(async (tx) => {
      const step = await tx.processStepCatalog.create({
        data: {
          code: v.code,
          name: localizedInput(v.nameJa, v.nameEn),
          category: v.category,
          executionLocation: v.executionLocation,
          isSyncCapable: v.isSyncCapable,
          isInspection: v.isInspection,
          isApprovalStep: v.isApprovalStep,
          approvalMinRank: approvalMinRankValue(v),
          sortOrder: v.sortOrder,
          isActive: v.isActive,
          notes: v.notes?.trim() || null,
        },
        select: { id: true, code: true },
      });
      if (v.useDependencies.length > 0) {
        await tx.processStepUseDependency.createMany({
          data: v.useDependencies.map((d) => ({
            stepId: step.id,
            dependsOnStepId: d.dependsOnStepId,
            relation: d.relation,
            isNegation: d.isNegation,
            notes: d.notes?.trim() || null,
          })),
        });
      }
      if (v.execDependencies.length > 0) {
        await tx.processStepExecDependency.createMany({
          data: v.execDependencies.map((d) => ({
            stepId: step.id,
            dependsOnStepId: d.dependsOnStepId,
            relation: d.relation,
            notes: d.notes?.trim() || null,
          })),
        });
      }
      return step;
    });
    await recordAudit({
      action: "CREATE",
      tableName: "process_step_catalog",
      recordId: String(created.id),
      after: {
        code: v.code,
        nameJa: v.nameJa,
        category: v.category,
        executionLocation: v.executionLocation,
        isSyncCapable: v.isSyncCapable,
        isInspection: v.isInspection,
        isApprovalStep: v.isApprovalStep,
        approvalMinRank: approvalMinRankValue(v),
        sortOrder: v.sortOrder,
        isActive: v.isActive,
        useDependencyCount: v.useDependencies.length,
        execDependencyCount: v.execDependencies.length,
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
      return actionError("同じ工程コードの工程が既に存在します");
    }
    return actionError(prismaErrorMessage(e, "工程の作成に失敗しました"));
  }
}

export async function updateProcessStep(
  id: number,
  input: ProcessStepUpdateInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = processStepUpdateInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const depError = await validateDependencies(id, v);
    if (depError) return actionError(depError);

    const prior = await prisma.processStepCatalog.findUnique({
      where: { id },
      select: {
        category: true,
        executionLocation: true,
        isSyncCapable: true,
        isInspection: true,
        isApprovalStep: true,
        approvalMinRank: true,
        sortOrder: true,
        isActive: true,
        notes: true,
        _count: { select: { useDependencies: true, execDependencies: true } },
      },
    });
    if (!prior) return actionError("対象の工程が見つかりません");

    // 依存行は全置換（deleteMany → createMany）でアトミックに反映する。
    await prisma.$transaction(async (tx) => {
      await tx.processStepCatalog.update({
        where: { id },
        data: {
          name: localizedInput(v.nameJa, v.nameEn),
          category: v.category,
          executionLocation: v.executionLocation,
          isSyncCapable: v.isSyncCapable,
          isInspection: v.isInspection,
          isApprovalStep: v.isApprovalStep,
          approvalMinRank: approvalMinRankValue(v),
          sortOrder: v.sortOrder,
          isActive: v.isActive,
          notes: v.notes?.trim() || null,
        },
      });
      await tx.processStepUseDependency.deleteMany({ where: { stepId: id } });
      if (v.useDependencies.length > 0) {
        await tx.processStepUseDependency.createMany({
          data: v.useDependencies.map((d) => ({
            stepId: id,
            dependsOnStepId: d.dependsOnStepId,
            relation: d.relation,
            isNegation: d.isNegation,
            notes: d.notes?.trim() || null,
          })),
        });
      }
      await tx.processStepExecDependency.deleteMany({ where: { stepId: id } });
      if (v.execDependencies.length > 0) {
        await tx.processStepExecDependency.createMany({
          data: v.execDependencies.map((d) => ({
            stepId: id,
            dependsOnStepId: d.dependsOnStepId,
            relation: d.relation,
            notes: d.notes?.trim() || null,
          })),
        });
      }
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "process_step_catalog",
      recordId: String(id),
      before: {
        category: prior.category,
        executionLocation: prior.executionLocation,
        isSyncCapable: prior.isSyncCapable,
        isInspection: prior.isInspection,
        isApprovalStep: prior.isApprovalStep,
        approvalMinRank: prior.approvalMinRank,
        sortOrder: prior.sortOrder,
        isActive: prior.isActive,
        notes: prior.notes,
        useDependencyCount: prior._count.useDependencies,
        execDependencyCount: prior._count.execDependencies,
      },
      after: {
        nameJa: v.nameJa,
        category: v.category,
        executionLocation: v.executionLocation,
        isSyncCapable: v.isSyncCapable,
        isInspection: v.isInspection,
        isApprovalStep: v.isApprovalStep,
        approvalMinRank: approvalMinRankValue(v),
        sortOrder: v.sortOrder,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
        useDependencyCount: v.useDependencies.length,
        execDependencyCount: v.execDependencies.length,
      },
    });
    revalidate(id);
    return actionOk({ id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "工程の更新に失敗しました"));
  }
}

export async function setProcessStepsActive(
  ids: number[],
  isActive: boolean,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    await prisma.processStepCatalog.updateMany({
      where: { id: { in: ids } },
      data: { isActive },
    });
    for (const id of ids) {
      await recordAudit({
        action: "UPDATE",
        tableName: "process_step_catalog",
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

export async function deleteProcessSteps(ids: number[]): Promise<ActionResult> {
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    // Guard: 削除対象「以外」の工程がこの工程を依存先にしている場合は拒否。
    // （削除対象同士の相互依存はまとめて消えるので許容。）
    const referencedBy = {
      dependsOnStepId: { in: ids },
      stepId: { notIn: ids },
    };
    const [useRefs, execRefs, templates] = await Promise.all([
      prisma.processStepUseDependency.count({ where: referencedBy }),
      prisma.processStepExecDependency.count({ where: referencedBy }),
      prisma.inspectionTemplate.count({
        where: { relatedProcessStepId: { in: ids } },
      }),
    ]);
    if (useRefs + execRefs > 0) {
      return actionError(
        "他の工程がこの工程に依存しているため削除できません。無効化を検討してください。",
      );
    }
    if (templates > 0) {
      return actionError(
        "この工程に関連する検査表テンプレートが存在するため削除できません。無効化を検討してください。",
      );
    }
    // 自身が持つ依存行（両側）を先に消してから本体を削除する。
    // （将来の work_order_steps 等の参照は P2003 → prismaErrorMessage で表面化。）
    const eitherSide = {
      OR: [{ stepId: { in: ids } }, { dependsOnStepId: { in: ids } }],
    };
    await prisma.$transaction([
      prisma.processStepUseDependency.deleteMany({ where: eitherSide }),
      prisma.processStepExecDependency.deleteMany({ where: eitherSide }),
      prisma.processStepCatalog.deleteMany({ where: { id: { in: ids } } }),
    ]);
    for (const id of ids) {
      await recordAudit({
        action: "DELETE",
        tableName: "process_step_catalog",
        recordId: String(id),
      });
    }
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "工程の削除に失敗しました"));
  }
}
