import { notFound } from "next/navigation";
import {
  ApprovalGroupDetail,
  type ApprovalGroupDetailData,
  type GroupFlowUsage,
} from "@/components/master/approval-settings/ApprovalGroupDetail";
import { loadApproveCapabilities } from "@/lib/approval-permissions";
import {
  APPROVAL_TARGET,
  type ApprovalTargetType,
  isApprovalTargetType,
} from "@/lib/approval-targets";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 承認グループ 詳細 (MS2B). */
export default async function MasterApprovalGroupsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-approval-groups");
  if (denied) return denied;
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const [r, auditEntries, flowSteps] = await Promise.all([
    prisma.approvalGroup.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: { select: { displayName: true, username: true } },
          },
          orderBy: { user: { username: "asc" } },
        },
        delegates: {
          include: {
            delegator: { select: { displayName: true } },
            delegate: { select: { displayName: true } },
          },
          orderBy: { validFrom: "desc" },
        },
      },
    }),
    fetchAuditEntries("approval_groups", String(id)),
    // このグループが承認を任されている書類 — メンバーに要る権限はここで決まる。
    prisma.approvalFlowStep.findMany({
      where: { groupId: id },
      orderBy: [{ targetType: "asc" }, { stepNo: "asc" }],
      select: { targetType: true, stepNo: true, name: true },
    }),
  ]);
  if (!r) notFound();

  const name = r.name as LocalizedText | null;

  // 書類種別ごとに段をまとめる（同じ書類の複数段を任されることがある）。
  const usageByTarget = new Map<ApprovalTargetType, GroupFlowUsage>();
  for (const s of flowSteps) {
    if (!isApprovalTargetType(s.targetType)) continue;
    const meta = APPROVAL_TARGET[s.targetType];
    const existing = usageByTarget.get(s.targetType);
    const stepLabel = `${s.stepNo}. ${localized(s.name as LocalizedText | null)}`;
    if (existing) {
      existing.steps.push(stepLabel);
    } else {
      usageByTarget.set(s.targetType, {
        targetType: s.targetType,
        label: meta.label,
        color: meta.color,
        permissionCode: meta.approvePermission,
        steps: [stepLabel],
      });
    }
  }
  const usages = [...usageByTarget.values()];

  // メンバーが「その書類の承認権限」を持っているか。承認グループに入れただけ
  // では押せない（権限・所属・スコープの 3 つが要る）ので、ここで突き合わせる。
  // 代理人も「自分の権限」で押す（承認記録には原承認者が残るだけ）ので、
  // 代理設定の相手も同じように突き合わせる。
  const capabilities = await loadApproveCapabilities(
    [
      ...r.members.map((m) => m.userId),
      ...r.delegates.map((d) => d.delegateId),
    ],
    usages.map((u) => u.permissionCode),
  );

  const approvalsFor = (userId: string) =>
    usages.map((u) => {
      const cap = capabilities.get(userId)?.get(u.permissionCode);
      return {
        targetType: u.targetType,
        label: u.label,
        permissionCode: u.permissionCode,
        allowed: cap?.allowed ?? false,
        unrestricted: cap?.unrestricted ?? false,
        scopes: cap?.scopes ?? [],
      };
    });

  const record: ApprovalGroupDetailData = {
    id: r.id,
    nameJa: name?.ja ?? "",
    nameEn: name?.en ?? "",
    isActive: r.isActive,
    usages,
    members: r.members.map((m) => ({
      userId: m.userId,
      displayName: m.user.displayName,
      username: m.user.username,
      isActive: m.isActive,
      validFrom: m.validFrom?.toISOString() ?? null,
      validUntil: m.validUntil?.toISOString() ?? null,
      note: m.note,
      approvals: approvalsFor(m.userId),
    })),
    delegates: r.delegates.map((d) => ({
      id: d.id,
      delegatorId: d.delegatorId,
      delegatorName: d.delegator.displayName,
      delegateId: d.delegateId,
      delegateName: d.delegate.displayName,
      validFrom: d.validFrom.toISOString(),
      validUntil: d.validUntil.toISOString(),
      reason: d.reason,
      approvals: approvalsFor(d.delegateId),
    })),
  };

  return <ApprovalGroupDetail auditEntries={auditEntries} record={record} />;
}
