import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { FlowApprover } from "@/components/master/approval-flows/ApproverPermissionBadge";
import { CustomValueStepsEditor } from "@/components/master/approval-flows/CustomValueStepsEditor";
import type { ApprovalMode } from "@/lib/approval-flow";
import { loadGroupApprovers } from "@/lib/approval-permissions";
import {
  APPROVAL_TARGET,
  CUSTOM_VALUE_TARGETS,
  FLOW_SETTINGS_TARGET_TYPES,
  isApprovalTargetType,
} from "@/lib/approval-targets";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import {
  type LocalizedText,
  localized,
  localizedTranslations,
} from "@/lib/format";
import { permissionLabel } from "@/lib/permission-labels";

export const dynamic = "force-dynamic";

/**
 * 独自値の追加承認 編集 (MS0B) — 書類種別 1 つぶんの「独自値があるときだけ
 * 後ろに足す段」。通常の承認フロー（../flows/[targetType]）とは別建て。
 */
export default async function CustomValueStepsPage({
  params,
}: {
  params: Promise<{ targetType: string }>;
}) {
  const denied = await requireAppRead("master-approval-groups");
  if (denied) return denied;
  const { targetType } = await params;
  if (!isApprovalTargetType(targetType)) notFound();
  // 独自値の判定を持たない書類では、段を組んでも一度も発動しない。
  const meta = CUSTOM_VALUE_TARGETS[targetType];
  if (!meta) notFound();

  const tr = await getTranslations();
  const permissionCode = APPROVAL_TARGET[targetType].approvePermission;
  const [steps, groups] = await Promise.all([
    prisma.approvalCustomValueStep.findMany({
      where: { targetType },
      orderBy: { stepNo: "asc" },
    }),
    prisma.approvalGroup.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    }),
  ]);

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

  return (
    <CustomValueStepsEditor
      approversByGroup={approversByGroup}
      description={tr(meta.descriptionKey)}
      groupOptions={groups.map((g) => ({
        value: String(g.id),
        label: localized(g.name as LocalizedText | null),
      }))}
      hasBaseFlow={FLOW_SETTINGS_TARGET_TYPES.includes(targetType)}
      initialSteps={steps.map((s) => {
        const name = s.name as LocalizedText | null;
        return {
          nameJa: name?.ja ?? "",
          nameTranslations: localizedTranslations(name),
          groupId: String(s.groupId),
          mode: s.mode as ApprovalMode,
        };
      })}
      permissionCode={permissionCode}
      permissionLabel={permissionLabel(permissionCode)}
      targetLabel={APPROVAL_TARGET[targetType].label}
      targetType={targetType}
    />
  );
}
