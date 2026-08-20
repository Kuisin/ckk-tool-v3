import type { FlowOverviewRow } from "@/components/master/approval-flows/ApprovalFlowOverview";
import { ApprovalSettingsView } from "@/components/master/approval-flows/ApprovalSettingsView";
import type { ApprovalGroupRow } from "@/components/master/approval-settings/ApprovalGroupTable";
import { loadGroupApprovers } from "@/lib/approval-approvers";
import { effectiveMemberWhere } from "@/lib/approval-membership";
import { APPROVAL_TARGET_TYPES } from "@/lib/approval-targets";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 承認設定 一覧 (MS0B) — 承認フロー + 承認グループ。 */
export default async function MasterApprovalSettingsPage() {
  const denied = await requireAppRead("master-approval-groups");
  if (denied) return denied;

  const now = new Date();
  const [flowSteps, groupRecords] = await Promise.all([
    prisma.approvalFlowStep.findMany({
      include: { group: { select: { name: true } } },
      orderBy: [{ targetType: "asc" }, { stepNo: "asc" }],
    }),
    prisma.approvalGroup.findMany({
      include: {
        // メンバー数は「今この瞬間に承認できる人」— 期間外の期間限定メンバーは
        // 数えない（一覧の数字と実際に押せる人がずれると調査が長引く）。
        _count: { select: { members: { where: effectiveMemberWhere(now) } } },
      },
      orderBy: { id: "asc" },
    }),
  ]);

  // 段ごとに「今その段を承認できる人」— 承認の可否は承認グループの所属だけで
  // 決まるので、この一覧がそのまま押せる人の一覧になる。
  const approversByGroup = await loadGroupApprovers(
    flowSteps.map((s) => s.groupId),
    now,
  );

  const flows: FlowOverviewRow[] = APPROVAL_TARGET_TYPES.map((targetType) => ({
    targetType,
    steps: flowSteps
      .filter((s) => s.targetType === targetType)
      .map((s) => ({
        stepNo: s.stepNo,
        label: localized(s.name as LocalizedText | null),
        groupLabel: localized(s.group.name as LocalizedText | null),
        mode: s.mode as "ANY" | "ALL",
        approvers: (approversByGroup.get(s.groupId) ?? []).map((a) => ({
          userId: a.userId,
          displayName: a.displayName,
        })),
      })),
  }));

  const groups: ApprovalGroupRow[] = groupRecords.map((r) => ({
    id: r.id,
    name: localized(r.name as LocalizedText | null),
    memberCount: r._count.members,
    isActive: r.isActive,
  }));

  return <ApprovalSettingsView flows={flows} groups={groups} />;
}
