import { notFound } from "next/navigation";
import { SupplierDetail } from "@/components/master/suppliers/SupplierDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { fetchSupplierDetail } from "../../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 外注企業 詳細 (MS26). */
export default async function MasterSuppliersDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await fetchSupplierDetail(id);
  if (!record) notFound();
  const auditEntries = await fetchAuditEntries("business_partners", id);
  return <SupplierDetail auditEntries={auditEntries} record={record} />;
}
