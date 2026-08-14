import { CustomerForm } from "@/components/master/customers/CustomerForm";
import { requireAppRead } from "@/lib/authz-page";
import { fetchCustomers } from "../../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 顧客 新規作成 (MS11). */
export default async function MasterCustomersNewPage() {
  const denied = await requireAppRead("master-customers");
  if (denied) return denied;
  const customers = await fetchCustomers();
  const billingOptions = customers.map((c) => ({
    value: c.id,
    label: `${c.bpCode}（${c.name}）`,
  }));
  return <CustomerForm billingOptions={billingOptions} />;
}
