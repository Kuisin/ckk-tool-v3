import {
  type ApprovalGroupRow,
  ApprovalGroupTable,
} from "@/components/master/approval-groups/ApprovalGroupTable";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 承認グループ 一覧 (MS0A). */
export default async function MasterApprovalGroupsPage() {
  const records = await prisma.approvalGroup.findMany({
    include: {
      _count: { select: { members: { where: { isActive: true } } } },
    },
    orderBy: { id: "asc" },
  });

  const rows: ApprovalGroupRow[] = records.map((r) => ({
    id: r.id,
    name: localized(r.name as LocalizedText | null),
    type: r.type,
    memberCount: r._count.members,
    isActive: r.isActive,
  }));

  return <ApprovalGroupTable rows={rows} />;
}
