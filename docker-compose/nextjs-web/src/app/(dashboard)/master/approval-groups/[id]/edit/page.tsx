import { notFound } from "next/navigation";
import { ApprovalGroupForm } from "@/components/master/approval-groups/ApprovalGroupForm";
import { prisma } from "@/lib/db";
import type { LocalizedText } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 承認グループ 編集 (MS2A edit) — 種別はロック、属性のみ編集可. */
export default async function MasterApprovalGroupsEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const r = await prisma.approvalGroup.findUnique({ where: { id } });
  if (!r) notFound();

  const name = r.name as LocalizedText | null;

  return (
    <ApprovalGroupForm
      initial={{
        id: r.id,
        type: r.type,
        nameJa: name?.ja ?? "",
        nameEn: name?.en ?? "",
        isActive: r.isActive,
      }}
    />
  );
}
