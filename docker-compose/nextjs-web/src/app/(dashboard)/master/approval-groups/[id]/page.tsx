import { notFound } from "next/navigation";
import {
  ApprovalGroupDetail,
  type ApprovalGroupDetailData,
} from "@/components/master/approval-groups/ApprovalGroupDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { prisma } from "@/lib/db";
import type { LocalizedText } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 承認グループ 詳細 (MS2A). */
export default async function MasterApprovalGroupsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const [r, auditEntries] = await Promise.all([
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
  ]);
  if (!r) notFound();

  const name = r.name as LocalizedText | null;

  const record: ApprovalGroupDetailData = {
    id: r.id,
    type: r.type,
    nameJa: name?.ja ?? "",
    nameEn: name?.en ?? "",
    isActive: r.isActive,
    members: r.members.map((m) => ({
      userId: m.userId,
      displayName: m.user.displayName,
      username: m.user.username,
      isActive: m.isActive,
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
    })),
  };

  return <ApprovalGroupDetail auditEntries={auditEntries} record={record} />;
}
