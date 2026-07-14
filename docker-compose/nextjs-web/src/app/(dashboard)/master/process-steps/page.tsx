import {
  type ProcessStepRow,
  ProcessStepTable,
} from "@/components/master/process-steps/ProcessStepTable";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 工程マスタ 一覧 (MS07). */
export default async function MasterProcessStepsPage() {
  const records = await prisma.processStepCatalog.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  const rows: ProcessStepRow[] = records.map((r) => ({
    id: r.id,
    code: r.code,
    name: localized(r.name as LocalizedText | null),
    category: r.category,
    executionLocation: r.executionLocation,
    isSyncCapable: r.isSyncCapable,
    isInspection: r.isInspection,
    isApprovalStep: r.isApprovalStep,
    sortOrder: r.sortOrder,
    isActive: r.isActive,
  }));

  return <ProcessStepTable rows={rows} />;
}
