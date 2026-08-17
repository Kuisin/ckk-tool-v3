import { notFound } from "next/navigation";
import { BpForm } from "@/components/master/business-partners/BpForm";
import { requireAppRead } from "@/lib/authz-page";
import { fetchBillingOptions, fetchBpDetail } from "../../../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 取引先 編集 (MS21). */
export default async function MasterBusinessPartnersEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-business-partners");
  if (denied) return denied;
  const { id } = await params;
  const [record, billingOptions] = await Promise.all([
    fetchBpDetail(id),
    fetchBillingOptions(id),
  ]);
  if (!record) notFound();
  return <BpForm billingOptions={billingOptions} initial={record} />;
}
