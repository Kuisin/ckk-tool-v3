import { notFound } from "next/navigation";
import { CustomerDetail } from "@/components/master/customers/CustomerDetail";
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
  return <CustomerDetail record={record} />;
}
