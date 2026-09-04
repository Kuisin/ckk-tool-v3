import { notFound } from "next/navigation";
import {
  type ProcessStepDependencyRow,
  ProcessStepDetail,
  type ProcessStepDetailData,
} from "@/components/master/process-steps/ProcessStepDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { readWorkLocationTypes, typeLabelOf } from "@/lib/work-locations";

export const dynamic = "force-dynamic";

/** 工程マスタ 詳細 (MS28). 依存関係タブに使用依存・実行依存の 2 表を表示。 */
export default async function MasterProcessStepsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-process-steps");
  if (denied) return denied;
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const [r, auditEntries, types] = await Promise.all([
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
        allowedWorkLocations: {
          include: {
            workLocation: {
              select: { name: true, group: { select: { name: true } } },
            },
          },
          orderBy: { id: "asc" },
        },
      },
    }),
    fetchAuditEntries("process_step_catalog", String(id)),
    readWorkLocationTypes(),
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
    isFinalInspection: r.isFinalInspection,
    approvalMinRank: r.approvalMinRank,
    quantityTracking: r.quantityTracking,
    lotInputMode: r.lotInputMode,
    defaultWorkHours:
      r.defaultWorkHours == null ? null : Number(r.defaultWorkHours),
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
    allowedLocationTypeLabels: r.allowedWorkLocations
      .map((l) => l.typeKey)
      .filter((k): k is string => k != null)
      .map((k) => typeLabelOf(types, k)),
    allowedLocationLabels: r.allowedWorkLocations
      .map((l) => l.workLocation)
      .filter((w): w is NonNullable<typeof w> => w != null)
      .map(
        (w) =>
          `${localized(w.group.name as LocalizedText | null)} / ${localized(w.name as LocalizedText | null)}`,
      ),
  };

  return <ProcessStepDetail auditEntries={auditEntries} record={record} />;
}
