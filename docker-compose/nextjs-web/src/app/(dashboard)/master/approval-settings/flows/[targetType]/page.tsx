import { notFound } from "next/navigation";
import { ApprovalFlowEditor } from "@/components/master/approval-flows/ApprovalFlowEditor";
import type { FlowApprover } from "@/components/master/approval-flows/ApproverPermissionBadge";
import type { ApprovalMode } from "@/lib/approval-flow";
import { loadGroupApprovers } from "@/lib/approval-permissions";
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

  const permissionCode = APPROVAL_TARGET[targetType].approvePermission;
  const [steps, groups, permission] = await Promise.all([
    prisma.approvalFlowStep.findMany({
      where: { targetType },
      orderBy: { stepNo: "asc" },
    }),
    prisma.approvalGroup.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    }),
    prisma.permission.findUnique({
      where: { code: permissionCode },
      select: { displayName: true },
    }),
  ]);

  // 選択肢に出る全グループぶん引く — 段のグループを付け替えた瞬間に
  // 「その人たちは承認できるのか」を出せるようにするため。
  const approvers = await loadGroupApprovers(
    groups.map((g) => g.id),
    [permissionCode],
  );
  const approversByGroup: Record<string, FlowApprover[]> = {};
  for (const [groupId, members] of approvers) {
    approversByGroup[String(groupId)] = members.map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      allowed: m.capabilities[permissionCode]?.allowed ?? false,
      unrestricted: m.capabilities[permissionCode]?.unrestricted ?? false,
      scopes: m.capabilities[permissionCode]?.scopes ?? [],
    }));
  }

  const targetLabel = APPROVAL_TARGET[targetType].label;

  return (
    <ApprovalFlowEditor
      approversByGroup={approversByGroup}
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
      permissionCode={permissionCode}
      // 権限マスタが未投入でもコードだけは出す（画面が空欄になるより読める）。
      permissionLabel={
        permission
          ? localized(permission.displayName as LocalizedText | null)
          : permissionCode
      }
      targetLabel={targetLabel}
      targetType={targetType}
    />
  );
}
