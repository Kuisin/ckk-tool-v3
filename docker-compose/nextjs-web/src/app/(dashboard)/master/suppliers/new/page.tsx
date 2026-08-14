import { SupplierForm } from "@/components/master/suppliers/SupplierForm";
import { requireAppRead } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

/** 外注企業 新規作成 (MS13). */
export default async function MasterSuppliersNewPage() {
  const denied = await requireAppRead("master-suppliers");
  if (denied) return denied;
  return <SupplierForm />;
}
