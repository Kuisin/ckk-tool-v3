import { notFound } from "next/navigation";
import { SupplierForm } from "@/components/master/suppliers/SupplierForm";
import { fetchSupplierDetail } from "../../../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 外注企業 編集 (MS26). */
export default async function MasterSuppliersEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await fetchSupplierDetail(id);
  if (!record) notFound();
  return <SupplierForm initial={{ base: record, attrs: record.attrs }} />;
}
