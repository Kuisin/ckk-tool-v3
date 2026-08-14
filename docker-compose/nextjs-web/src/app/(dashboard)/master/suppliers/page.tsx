import { SupplierTable } from "@/components/master/suppliers/SupplierTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchSuppliers } from "../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 外注企業 一覧 (MS06). */
export default async function MasterSuppliersPage() {
  const denied = await requireAppRead("master-suppliers");
  if (denied) return denied;
  const rows = await fetchSuppliers();
  return <SupplierTable rows={rows} />;
}
