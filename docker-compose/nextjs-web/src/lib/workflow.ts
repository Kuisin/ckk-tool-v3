/**
 * workflow.ts — 製造ワークフローの Prisma ラッパ。server-only.
 *
 * 純ロジックは lib/workflow-core.ts（構成検証・依存解決）。ここはカタログの
 * ロードと形変換のみ。実行系（startStep/completeStep 等）は PR 3 で追加。
 */

import { prisma } from "./db";
import { type LocalizedText, localized } from "./format";
import type { CatalogStep, ExecDep, UseDep } from "./workflow-core";

export interface WorkflowCatalog {
  steps: CatalogStep[];
  useDeps: UseDep[];
  execDeps: ExecDep[];
}

/** 工程カタログ + 依存の全ロード（ビルダー・検証用）。 */
export async function loadCatalog(): Promise<WorkflowCatalog> {
  const [steps, useDeps, execDeps] = await Promise.all([
    prisma.processStepCatalog.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.processStepUseDependency.findMany(),
    prisma.processStepExecDependency.findMany(),
  ]);
  return {
    steps: steps.map((s) => ({
      id: s.id,
      code: s.code,
      nameJa: localized(s.name as LocalizedText | null),
      category: s.category,
      executionLocation: s.executionLocation,
      isSyncCapable: s.isSyncCapable,
      isInspection: s.isInspection,
      isApprovalStep: s.isApprovalStep,
      sortOrder: s.sortOrder,
    })),
    useDeps: useDeps.map((d) => ({
      stepId: d.stepId,
      dependsOnStepId: d.dependsOnStepId,
      relation: d.relation,
      isNegation: d.isNegation,
    })),
    execDeps: execDeps.map((d) => ({
      stepId: d.stepId,
      dependsOnStepId: d.dependsOnStepId,
      relation: d.relation,
    })),
  };
}
