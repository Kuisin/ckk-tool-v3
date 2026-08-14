import { notFound } from "next/navigation";
import { BranchForm } from "@/components/master/customers/BranchForm";
import { requireAppRead } from "@/lib/authz-page";
import { fetchBranchDetail } from "../../../../../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 支店 編集（顧客配下）. */
export default async function CustomerBranchEditPage({
  params,
}: {
  params: Promise<{ id: string; branchId: string }>;
}) {
  const denied = await requireAppRead("master-customers");
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
