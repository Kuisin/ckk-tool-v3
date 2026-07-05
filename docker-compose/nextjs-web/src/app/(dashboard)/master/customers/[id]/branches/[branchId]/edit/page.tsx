import { notFound } from "next/navigation";
import { BranchForm } from "@/components/master/customers/BranchForm";
import { fetchBranchDetail } from "../../../../../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 支店 編集（顧客配下）. */
export default async function CustomerBranchEditPage({
  params,
}: {
  params: Promise<{ id: string; branchId: string }>;
}) {
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
