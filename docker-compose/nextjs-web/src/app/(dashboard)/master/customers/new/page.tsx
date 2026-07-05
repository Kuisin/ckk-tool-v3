import { CustomerForm } from "@/components/master/customers/CustomerForm";
import { fetchCustomers } from "../../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 顧客 新規作成 (MS11). */
export default async function MasterCustomersNewPage() {
  const customers = await fetchCustomers();
  const billingOptions = customers.map((c) => ({
    value: c.id,
    label: `${c.bpCode}（${c.name}）`,
  }));
  return <CustomerForm billingOptions={billingOptions} />;
}
