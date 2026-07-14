import { notFound } from "next/navigation";
import { CustomerDetail } from "@/components/master/customers/CustomerDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { fetchCustomerDetail } from "../../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 顧客 詳細 (MS21). */
export default async function MasterCustomersDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await fetchCustomerDetail(id);
  if (!record) notFound();
  const auditEntries = await fetchAuditEntries("business_partners", id);
  return <CustomerDetail auditEntries={auditEntries} record={record} />;
}
