import { notFound } from "next/navigation";
import {
  ProcessStepForm,
  type ProcessStepFormDep,
} from "@/components/master/process-steps/ProcessStepForm";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import {
  type LocalizedText,
  localized,
  localizedTranslations,
} from "@/lib/format";
import {
  fetchWorkLocationOptions,
  readWorkLocationTypes,
} from "@/lib/work-locations";

export const dynamic = "force-dynamic";

/** 工程マスタ 編集 (MS28 edit). 依存行は保存時に全置換される。 */
export default async function MasterProcessStepsEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-process-steps");
  if (denied) return denied;
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const [r, types, workLocationOptions] = await Promise.all([
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
        allowedWorkLocations: { orderBy: { id: "asc" } },
      },
    }),
    readWorkLocationTypes(),
    fetchWorkLocationOptions(),
  ]);
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
        nameTranslations: localizedTranslations(name),
        category: r.category,
        executionLocation: r.executionLocation,
        isSyncCapable: r.isSyncCapable,
        isInspection: r.isInspection,
        isApprovalStep: r.isApprovalStep,
        approvalMinRank: r.approvalMinRank ?? "",
        quantityTracking: r.quantityTracking,
        lotInputMode: r.lotInputMode,
        defaultWorkHours:
          r.defaultWorkHours == null ? null : Number(r.defaultWorkHours),
        sortOrder: r.sortOrder,
        isActive: r.isActive,
        notes: r.notes ?? "",
        useDeps: r.useDependencies.map(mapDep),
        execDeps: r.execDependencies.map(mapDep),
        allowedTypeKeys: r.allowedWorkLocations
          .map((l) => l.typeKey)
          .filter((k): k is string => k != null),
        allowedLocationIds: r.allowedWorkLocations
          .map((l) => l.workLocationId)
          .filter((v): v is number => v != null)
          .map(String),
      }}
      workLocationOptions={workLocationOptions}
      workLocationTypeOptions={types.map((t) => ({
        value: t.key,
        label: t.label.ja || t.key,
      }))}
    />
  );
}
