"use server";

/**
 * Server Actions — 工程マスタ (MS08).
 *
 * process_step_catalog（工程カタログ）と、その使用依存
 * （process_step_use_dependencies = ワークフローに含めてよい条件）・実行依存
 * （process_step_exec_dependencies = 開始してよい条件）の CRUD。
 * 依存行は保存のたびに全置換（deleteMany → createMany を $transaction で
 * アトミックに実行）する。自己依存・依存先の重複は不可。
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
import { readWorkLocationTypes } from "@/lib/work-locations";

type Tr = Awaited<ReturnType<typeof getTranslations>>;

const BASE_PATH = "/master/process-steps";

const relationSchema = z.enum(["AND", "OR"]);

// 使用依存の 1 行（is_negation = 排他条件 !）
function usageDependencyInputSchema(tr: Tr) {
  return z.object({
    dependsOnStepId: z
      .number()
      .int()
      .min(1, tr("master.processStepsActions.selectDependencyStep")),
    relation: relationSchema,
    isNegation: z.boolean(),
    notes: z.string().optional(),
  });
}

// 実行依存の 1 行（排他なし）
function execDependencyInputSchema(tr: Tr) {
  return z.object({
    dependsOnStepId: z
      .number()
      .int()
      .min(1, tr("master.processStepsActions.selectDependencyStep")),
    relation: relationSchema,
    notes: z.string().optional(),
  });
}

function processStepUpdateInputSchema(tr: Tr) {
  return z.object({
    nameJa: z.string().min(1, tr("common.enterNameInJapanese")),
    nameTranslations: z.record(z.string(), z.string()).optional(),
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
    isFinalInspection: z.boolean(),
    approvalMinRank: z.string().optional(),
    quantityTracking: z.enum(["NONE", "FLOW", "INSPECTION"]),
    // 実行時のロット/伝票コード入力の既定（工程リスト/指示書で上書き可）
    lotInputMode: z.enum(["REQUIRED", "OPTIONAL", "NONE"]).default("NONE"),
    // 既定作業時間 (h) — 任意。ルート/指示書ビルダーの初期値
    defaultWorkHours: z.number().positive().max(9999.99).nullable(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    notes: z.string().optional(),
    useDependencies: z.array(usageDependencyInputSchema(tr)),
    execDependencies: z.array(execDependencyInputSchema(tr)),
    // 許可作業場所（種別キー + 個別 id）。両方空 = 無制限。保存時は全置換。
    allowedLocationTypeKeys: z.array(z.string().min(1)).max(50),
    allowedLocationIds: z.array(z.number().int().positive()).max(500),
  });
}

// 工程コードは作成後不変（識別キー）。例: CYLINDER_MACHINING
function processStepCreateInputSchema(tr: Tr) {
  return processStepUpdateInputSchema(tr).extend({
    code: z
      .string()
      .min(1, tr("master.processStepsActions.enterCode"))
      .regex(
        /^[A-Z][A-Z0-9_]*$/,
        tr("master.processStepsActions.codePatternHint"),
      ),
  });
}

export type ProcessStepUpdateInput = z.infer<
  ReturnType<typeof processStepUpdateInputSchema>
>;
export type ProcessStepCreateInput = z.infer<
  ReturnType<typeof processStepCreateInputSchema>
>;

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
  tr: Tr,
  selfId: number | null,
  deps: DependencyRows,
): Promise<string | null> {
  const groups = [
    {
      label: tr("master.processStepsActions.dependencyGroupUse"),
      ids: deps.useDependencies.map((d) => d.dependsOnStepId),
    },
    {
      label: tr("master.processStepsActions.dependencyGroupExec"),
      ids: deps.execDependencies.map((d) => d.dependsOnStepId),
    },
  ];
  for (const g of groups) {
    if (selfId != null && g.ids.includes(selfId)) {
      return tr("master.processStepsActions.selfDependencyNotAllowed", {
        group: g.label,
      });
    }
    if (new Set(g.ids).size !== g.ids.length) {
      return tr("master.processStepsActions.duplicateDependencyTarget", {
        group: g.label,
      });
    }
  }
  const targetIds = [...new Set(groups.flatMap((g) => g.ids))];
  if (targetIds.length > 0) {
    const found = await prisma.processStepCatalog.count({
      where: { id: { in: targetIds } },
    });
    if (found !== targetIds.length) {
      return tr("master.processStepsActions.unknownDependencyTarget");
    }
  }
  return null;
}

/**
 * 許可作業場所の整合性チェック（種別キーの存在・場所 id の存在）。
 * エラー時はメッセージ、問題なければ正規化済み（重複除去）の値を返す。
 */
async function validateAllowedLocations(
  tr: Tr,
  v: {
    allowedLocationTypeKeys: string[];
    allowedLocationIds: number[];
  },
): Promise<
  { error: string } | { error: null; typeKeys: string[]; locationIds: number[] }
> {
  const typeKeys = [...new Set(v.allowedLocationTypeKeys)];
  const locationIds = [...new Set(v.allowedLocationIds)];
  if (typeKeys.length > 0) {
    const known = new Set((await readWorkLocationTypes()).map((t) => t.key));
    const unknown = typeKeys.filter((k) => !known.has(k));
    if (unknown.length > 0) {
      return {
        error: tr("master.processStepsActions.unknownWorkLocationType", {
          keys: unknown.join(", "),
        }),
      };
    }
  }
  if (locationIds.length > 0) {
    const found = await prisma.workLocation.count({
      where: { id: { in: locationIds } },
    });
    if (found !== locationIds.length) {
      return {
        error: tr("master.processStepsActions.unknownAllowedLocation"),
      };
    }
  }
  return { error: null, typeKeys, locationIds };
}

/** 許可作業場所リンク行（全置換用の createMany データ）。 */
function allowedLocationRows(
  processStepId: number,
  typeKeys: string[],
  locationIds: number[],
) {
  return [
    ...typeKeys.map((typeKey) => ({ processStepId, typeKey })),
    ...locationIds.map((workLocationId) => ({ processStepId, workLocationId })),
  ];
}

/** 検査承認工程でなければ承認必要役職は保持しない（トグルと揃える）。 */
function approvalMinRankValue(v: ProcessStepUpdateInput): string | null {
  return v.isApprovalStep ? v.approvalMinRank?.trim() || null : null;
}

export async function createProcessStep(
  input: ProcessStepCreateInput,
): Promise<ActionResult<{ id: number; code: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = processStepCreateInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const depError = await validateDependencies(tr, null, v);
    if (depError) return actionError(depError);
    const allowed = await validateAllowedLocations(tr, v);
    if (allowed.error != null) return actionError(allowed.error);

    const created = await prisma.$transaction(async (tx) => {
      const step = await tx.processStepCatalog.create({
        data: {
          code: v.code,
          name: localizedInput(v.nameJa, undefined, v.nameTranslations),
          category: v.category,
          executionLocation: v.executionLocation,
          isSyncCapable: v.isSyncCapable,
          isInspection: v.isInspection,
          isApprovalStep: v.isApprovalStep,
          isFinalInspection: v.isFinalInspection,
          approvalMinRank: approvalMinRankValue(v),
          quantityTracking: v.quantityTracking,
          lotInputMode: v.lotInputMode,
          defaultWorkHours: v.defaultWorkHours,
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
      const locationRows = allowedLocationRows(
        step.id,
        allowed.typeKeys,
        allowed.locationIds,
      );
      if (locationRows.length > 0) {
        await tx.processStepWorkLocation.createMany({ data: locationRows });
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
        isFinalInspection: v.isFinalInspection,
        approvalMinRank: approvalMinRankValue(v),
        quantityTracking: v.quantityTracking,
        lotInputMode: v.lotInputMode,
        defaultWorkHours: v.defaultWorkHours,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
        useDependencyCount: v.useDependencies.length,
        execDependencyCount: v.execDependencies.length,
        allowedLocationTypeKeys: allowed.typeKeys,
        allowedLocationIdCount: allowed.locationIds.length,
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
      return actionError(tr("master.processStepsActions.duplicateCode"));
    }
    return actionError(
      prismaErrorMessage(e, tr("master.processStepsActions.createFailed"), tr),
    );
  }
}

export async function updateProcessStep(
  id: number,
  input: ProcessStepUpdateInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = processStepUpdateInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const depError = await validateDependencies(tr, id, v);
    if (depError) return actionError(depError);
    const allowed = await validateAllowedLocations(tr, v);
    if (allowed.error != null) return actionError(allowed.error);

    const prior = await prisma.processStepCatalog.findUnique({
      where: { id },
      select: {
        category: true,
        executionLocation: true,
        isSyncCapable: true,
        isInspection: true,
        isApprovalStep: true,
        isFinalInspection: true,
        approvalMinRank: true,
        quantityTracking: true,
        lotInputMode: true,
        defaultWorkHours: true,
        sortOrder: true,
        isActive: true,
        notes: true,
        _count: {
          select: {
            useDependencies: true,
            execDependencies: true,
            allowedWorkLocations: true,
          },
        },
      },
    });
    if (!prior)
      return actionError(tr("master.processStepsActions.stepNotFound"));

    // 依存行は全置換（deleteMany → createMany）でアトミックに反映する。
    await prisma.$transaction(async (tx) => {
      await tx.processStepCatalog.update({
        where: { id },
        data: {
          name: localizedInput(v.nameJa, undefined, v.nameTranslations),
          category: v.category,
          executionLocation: v.executionLocation,
          isSyncCapable: v.isSyncCapable,
          isInspection: v.isInspection,
          isApprovalStep: v.isApprovalStep,
          isFinalInspection: v.isFinalInspection,
          approvalMinRank: approvalMinRankValue(v),
          quantityTracking: v.quantityTracking,
          lotInputMode: v.lotInputMode,
          defaultWorkHours: v.defaultWorkHours,
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
      await tx.processStepWorkLocation.deleteMany({
        where: { processStepId: id },
      });
      const locationRows = allowedLocationRows(
        id,
        allowed.typeKeys,
        allowed.locationIds,
      );
      if (locationRows.length > 0) {
        await tx.processStepWorkLocation.createMany({ data: locationRows });
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
        isFinalInspection: prior.isFinalInspection,
        approvalMinRank: prior.approvalMinRank,
        quantityTracking: prior.quantityTracking,
        lotInputMode: prior.lotInputMode,
        defaultWorkHours:
          prior.defaultWorkHours == null
            ? null
            : Number(prior.defaultWorkHours),
        sortOrder: prior.sortOrder,
        isActive: prior.isActive,
        notes: prior.notes,
        useDependencyCount: prior._count.useDependencies,
        execDependencyCount: prior._count.execDependencies,
        allowedLocationCount: prior._count.allowedWorkLocations,
      },
      after: {
        nameJa: v.nameJa,
        category: v.category,
        executionLocation: v.executionLocation,
        isSyncCapable: v.isSyncCapable,
        isInspection: v.isInspection,
        isApprovalStep: v.isApprovalStep,
        isFinalInspection: v.isFinalInspection,
        approvalMinRank: approvalMinRankValue(v),
        quantityTracking: v.quantityTracking,
        lotInputMode: v.lotInputMode,
        defaultWorkHours: v.defaultWorkHours,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
        useDependencyCount: v.useDependencies.length,
        execDependencyCount: v.execDependencies.length,
        allowedLocationTypeKeys: allowed.typeKeys,
        allowedLocationIdCount: allowed.locationIds.length,
      },
    });
    revalidate(id);
    return actionOk({ id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.processStepsActions.updateFailed"), tr),
    );
  }
}

export async function setProcessStepsActive(
  ids: number[],
  isActive: boolean,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError(tr("common.noTargetSelected"));
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
    return actionError(
      prismaErrorMessage(e, tr("common.statusUpdateFailed"), tr),
    );
  }
}

export async function deleteProcessSteps(ids: number[]): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError(tr("common.noTargetSelected"));
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
        tr("master.processStepsActions.referencedByOtherStepsCannotDelete"),
      );
    }
    if (templates > 0) {
      return actionError(
        tr("master.processStepsActions.referencedByTemplateCannotDelete"),
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
    return actionError(
      prismaErrorMessage(e, tr("master.processStepsActions.deleteFailed"), tr),
    );
  }
}
