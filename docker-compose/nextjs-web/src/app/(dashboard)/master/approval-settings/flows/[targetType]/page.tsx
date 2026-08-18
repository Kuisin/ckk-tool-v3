import { notFound } from "next/navigation";
import { ApprovalFlowEditor } from "@/components/master/approval-flows/ApprovalFlowEditor";
import type { ApprovalMode } from "@/lib/approval-flow";
import { APPROVAL_TARGET, isApprovalTargetType } from "@/lib/approval-targets";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 承認フロー 編集 — 書類種別 1 つぶんの承認ステップを並べる (MS0B)。 */
export default async function ApprovalFlowEditPage({
  params,
}: {
  params: Promise<{ targetType: string }>;
}) {
  const denied = await requireAppRead("master-approval-groups");
  if (denied) return denied;
  const { targetType } = await params;
  if (!isApprovalTargetType(targetType)) notFound();

  const [steps, groups] = await Promise.all([
    prisma.approvalFlowStep.findMany({
      where: { targetType },
      orderBy: { stepNo: "asc" },
    }),
    prisma.approvalGroup.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const targetLabel = APPROVAL_TARGET[targetType].label;

  return (
    <ApprovalFlowEditor
      groupOptions={groups.map((g) => ({
        value: String(g.id),
        label: localized(g.name as LocalizedText | null),
      }))}
      initialSteps={steps.map((s) => {
        const name = s.name as LocalizedText | null;
        return {
          nameJa: name?.ja ?? "",
          nameEn: name?.en ?? "",
          groupId: String(s.groupId),
          mode: s.mode as ApprovalMode,
        };
      })}
      targetLabel={targetLabel}
      targetType={targetType}
    />
  );
}
