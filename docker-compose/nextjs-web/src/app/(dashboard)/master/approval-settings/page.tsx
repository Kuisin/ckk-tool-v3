import type { FlowOverviewRow } from "@/components/master/approval-flows/ApprovalFlowOverview";
import { ApprovalSettingsView } from "@/components/master/approval-flows/ApprovalSettingsView";
import type { ApprovalGroupRow } from "@/components/master/approval-settings/ApprovalGroupTable";
import { effectiveMemberWhere } from "@/lib/approval-membership";
import { loadGroupApprovers } from "@/lib/approval-permissions";
import { APPROVAL_TARGET, APPROVAL_TARGET_TYPES } from "@/lib/approval-targets";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 承認設定 一覧 (MS0B) — 承認フロー + 承認グループ。 */
export default async function MasterApprovalSettingsPage() {
  const denied = await requireAppRead("master-approval-groups");
  if (denied) return denied;

  const now = new Date();
  const permissionCodes = [
    ...new Set(
      APPROVAL_TARGET_TYPES.map((t) => APPROVAL_TARGET[t].approvePermission),
    ),
  ];
  const [flowSteps, groupRecords, permissions] = await Promise.all([
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
    prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
      select: { code: true, displayName: true },
    }),
  ]);

  // 段のメンバーが承認権限を持っているか — グループに入れただけでは承認できない
  // ので、設定画面のここで突き合わせる。
  const approversByGroup = await loadGroupApprovers(
    flowSteps.map((s) => s.groupId),
    permissionCodes,
    now,
  );
  const permissionLabels = new Map(
    permissions.map((p) => [
      p.code,
      localized(p.displayName as LocalizedText | null),
    ]),
  );

  const flows: FlowOverviewRow[] = APPROVAL_TARGET_TYPES.map((targetType) => {
    const code = APPROVAL_TARGET[targetType].approvePermission;
    return {
      targetType,
      permissionCode: code,
      // 権限マスタが未投入でもコードだけは出す（画面が空欄になるより読める）。
      permissionLabel: permissionLabels.get(code) || code,
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
            allowed: a.capabilities[code]?.allowed ?? false,
            unrestricted: a.capabilities[code]?.unrestricted ?? false,
            scopes: a.capabilities[code]?.scopes ?? [],
          })),
        })),
    };
  });

  const groups: ApprovalGroupRow[] = groupRecords.map((r) => ({
    id: r.id,
    name: localized(r.name as LocalizedText | null),
    memberCount: r._count.members,
    isActive: r.isActive,
  }));

  return <ApprovalSettingsView flows={flows} groups={groups} />;
}
