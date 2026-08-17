import { notFound } from "next/navigation";
import { BpDetail } from "@/components/master/business-partners/BpDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { fetchBpDetail } from "../../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 取引先 詳細 (MS21). */
export default async function MasterBusinessPartnersDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-business-partners");
  if (denied) return denied;
  const { id } = await params;
  const record = await fetchBpDetail(id);
  if (!record) notFound();
  const auditEntries = await fetchAuditEntries("business_partners", id);
  return <BpDetail auditEntries={auditEntries} record={record} />;
}
