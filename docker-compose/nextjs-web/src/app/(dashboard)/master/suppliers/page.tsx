import { SupplierTable } from "@/components/master/suppliers/SupplierTable";
import { fetchSuppliers } from "../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 外注企業 一覧 (MS06). */
export default async function MasterSuppliersPage() {
  const rows = await fetchSuppliers();
  return <SupplierTable rows={rows} />;
}
