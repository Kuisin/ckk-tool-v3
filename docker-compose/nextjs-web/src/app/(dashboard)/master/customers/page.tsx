import { CustomerTable } from "@/components/master/customers/CustomerTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchCustomers } from "../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 顧客 一覧 (MS01). */
export default async function MasterCustomersPage() {
  const denied = await requireAppRead("master-customers");
  if (denied) return denied;
  const rows = await fetchCustomers();
  return <CustomerTable rows={rows} />;
}
