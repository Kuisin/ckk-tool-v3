import { notFound } from "next/navigation";
import { BranchForm } from "@/components/master/bp/BranchForm";
import { requireAppRead } from "@/lib/authz-page";
import { fetchBranchDetail } from "../../../../../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 支店 編集（取引先配下）. */
export default async function BpBranchEditPage({
  params,
}: {
  params: Promise<{ id: string; branchId: string }>;
}) {
  const denied = await requireAppRead("master-business-partners");
  if (denied) return denied;
  const { id, branchId } = await params;
  const record = await fetchBranchDetail(id, branchId);
  if (!record) notFound();
  return (
    <BranchForm
      initial={record}
      parentBpCode={record.parentBpCode}
      parentId={record.parentId}
      parentName={record.parentName}
    />
  );
}
