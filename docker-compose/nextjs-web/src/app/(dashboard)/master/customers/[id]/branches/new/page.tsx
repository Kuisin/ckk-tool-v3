import { notFound } from "next/navigation";
import { BranchForm } from "@/components/master/customers/BranchForm";
import { fetchCustomerDetail } from "../../../../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 支店 新規作成（顧客配下）. */
export default async function CustomerBranchNewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const parent = await fetchCustomerDetail(id);
  if (!parent) notFound();
  return (
    <BranchForm
      parentBpCode={parent.bpCode}
      parentId={parent.id}
      parentName={parent.nameJa}
    />
  );
}
