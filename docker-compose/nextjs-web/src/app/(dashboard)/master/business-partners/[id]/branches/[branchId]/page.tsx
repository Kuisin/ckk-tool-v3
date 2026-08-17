import { notFound } from "next/navigation";
import { BranchDetail } from "@/components/master/bp/BranchDetail";
import { requireAppRead } from "@/lib/authz-page";
import { fetchBranchDetail } from "../../../../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 支店 詳細（取引先配下）. */
export default async function BpBranchDetailPage({
  params,
}: {
  params: Promise<{ id: string; branchId: string }>;
}) {
  const denied = await requireAppRead("master-business-partners");
  if (denied) return denied;
  const { id, branchId } = await params;
  const record = await fetchBranchDetail(id, branchId);
  if (!record) notFound();
  return <BranchDetail record={record} />;
}
