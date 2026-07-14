import { notFound } from "next/navigation";
import { CustomerForm } from "@/components/master/customers/CustomerForm";
import { fetchCustomerDetail, fetchCustomers } from "../../../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 顧客 編集 (MS21). */
export default async function MasterCustomersEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [record, customers] = await Promise.all([
    fetchCustomerDetail(id),
    fetchCustomers(),
  ]);
  if (!record) notFound();

  const billingOptions = customers
    .filter((c) => c.id !== id)
    .map((c) => ({ value: c.id, label: `${c.bpCode}（${c.name}）` }));

  return (
    <CustomerForm
      billingOptions={billingOptions}
      initial={{ base: record, attrs: record.attrs }}
    />
  );
}
