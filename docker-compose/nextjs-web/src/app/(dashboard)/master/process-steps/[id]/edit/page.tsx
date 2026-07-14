import { notFound } from "next/navigation";
import {
  ProcessStepForm,
  type ProcessStepFormDep,
} from "@/components/master/process-steps/ProcessStepForm";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 工程マスタ 編集 (MS27 edit). 依存行は保存時に全置換される。 */
export default async function MasterProcessStepsEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const r = await prisma.processStepCatalog.findUnique({
    where: { id },
    include: {
      useDependencies: {
        include: {
          dependsOn: { select: { id: true, code: true, name: true } },
        },
        orderBy: { dependsOnStepId: "asc" },
      },
      execDependencies: {
        include: {
          dependsOn: { select: { id: true, code: true, name: true } },
        },
        orderBy: { dependsOnStepId: "asc" },
      },
    },
  });
  if (!r) notFound();

  const name = r.name as LocalizedText | null;
  // ラベルは option-search（searchProcessStepOptions）の「名称（CODE）」形式に揃える。
  const mapDep = (d: {
    dependsOn: { id: number; code: string; name: unknown };
    relation: string;
    isNegation?: boolean;
    notes: string | null;
  }): ProcessStepFormDep => ({
    dependsOnStepId: d.dependsOn.id,
    dependsOnLabel: `${localized(d.dependsOn.name as LocalizedText | null)}（${d.dependsOn.code}）`,
    relation: d.relation,
    isNegation: d.isNegation ?? false,
    notes: d.notes ?? "",
  });

  return (
    <ProcessStepForm
      initial={{
        id: r.id,
        code: r.code,
        nameJa: name?.ja ?? "",
        nameEn: name?.en ?? "",
        category: r.category,
        executionLocation: r.executionLocation,
        isSyncCapable: r.isSyncCapable,
        isInspection: r.isInspection,
        isApprovalStep: r.isApprovalStep,
        approvalMinRank: r.approvalMinRank ?? "",
        sortOrder: r.sortOrder,
        isActive: r.isActive,
        notes: r.notes ?? "",
        useDeps: r.useDependencies.map(mapDep),
        execDeps: r.execDependencies.map(mapDep),
      }}
    />
  );
}
