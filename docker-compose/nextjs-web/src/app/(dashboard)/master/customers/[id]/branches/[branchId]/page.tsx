import { notFound } from "next/navigation";
import { BranchDetail } from "@/components/master/customers/BranchDetail";
import { requireAppRead } from "@/lib/authz-page";
import { fetchBranchDetail } from "../../../../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 支店 詳細（顧客配下）. */
export default async function CustomerBranchDetailPage({
  params,
}: {
  params: Promise<{ id: string; branchId: string }>;
}) {
  const denied = await requireAppRead("master-customers");
  if (denied) return denied;
  const { id, branchId } = await params;
  const record = await fetchBranchDetail(id, branchId);
  if (!record) notFound();
  return <BranchDetail record={record} />;
}
