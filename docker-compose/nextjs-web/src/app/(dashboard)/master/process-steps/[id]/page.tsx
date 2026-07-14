import { notFound } from "next/navigation";
import {
  type ProcessStepDependencyRow,
  ProcessStepDetail,
  type ProcessStepDetailData,
} from "@/components/master/process-steps/ProcessStepDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 工程マスタ 詳細 (MS27). 依存関係タブに使用依存・実行依存の 2 表を表示。 */
export default async function MasterProcessStepsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const [r, auditEntries] = await Promise.all([
    prisma.processStepCatalog.findUnique({
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
    }),
    fetchAuditEntries("process_step_catalog", String(id)),
  ]);
  if (!r) notFound();

  const name = r.name as LocalizedText | null;
  const mapDep = (d: {
    dependsOn: { id: number; code: string; name: unknown };
    relation: string;
    notes: string | null;
  }): Omit<ProcessStepDependencyRow, "isNegation"> => ({
    dependsOnStepId: d.dependsOn.id,
    dependsOnCode: d.dependsOn.code,
    dependsOnName: localized(d.dependsOn.name as LocalizedText | null),
    relation: d.relation,
    notes: d.notes ?? "",
  });

  const record: ProcessStepDetailData = {
    id: r.id,
    code: r.code,
    nameJa: name?.ja ?? "",
    nameEn: name?.en ?? "",
    category: r.category,
    executionLocation: r.executionLocation,
    isSyncCapable: r.isSyncCapable,
    isInspection: r.isInspection,
    isApprovalStep: r.isApprovalStep,
    approvalMinRank: r.approvalMinRank,
    sortOrder: r.sortOrder,
    isActive: r.isActive,
    notes: r.notes ?? "",
    useDependencies: r.useDependencies.map((d) => ({
      ...mapDep(d),
      isNegation: d.isNegation,
    })),
    execDependencies: r.execDependencies.map((d) => ({
      ...mapDep(d),
      isNegation: false,
    })),
  };

  return <ProcessStepDetail auditEntries={auditEntries} record={record} />;
}
