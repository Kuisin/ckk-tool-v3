import { CustomerTable } from "@/components/master/customers/CustomerTable";
import { fetchCustomers } from "../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 顧客 一覧 (MS01). */
export default async function MasterCustomersPage() {
  const rows = await fetchCustomers();
  return <CustomerTable rows={rows} />;
}
