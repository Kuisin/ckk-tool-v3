import { WorkflowBuilder } from "@/components/production/work-orders/WorkflowBuilder";
import { loadCatalog } from "@/lib/workflow";
import {
  fetchFactoryOptions,
  fetchInspectionTemplateOptions,
  fetchSalesOrderRef,
  fetchSupplierOptions,
} from "../data";

export const dynamic = "force-dynamic";

/**
 * 指示書 新規作成 (PD12).
 *
 * `?salesOrder={uuid}` で注文請書をプリセレクトできる（注文請書詳細からの起動用）。
 */
export default async function ProductionWorkOrdersNewPage({
  searchParams,
}: {
  searchParams: Promise<{ salesOrder?: string; type?: string; qty?: string }>;
}) {
  const sp = await searchParams;
  const [catalog, factoryOptions, templateOptions, supplierOptions, soRef] =
    await Promise.all([
      loadCatalog(),
      fetchFactoryOptions(),
      fetchInspectionTemplateOptions(),
      fetchSupplierOptions(),
      sp.salesOrder ? fetchSalesOrderRef(sp.salesOrder) : null,
    ]);

  const initialType =
    sp.type === "FROM_STOCK" || sp.type === "MANUFACTURE" ? sp.type : null;
  const initialQty = Number(sp.qty) > 0 ? Number(sp.qty) : null;

  return (
    <WorkflowBuilder
      catalogSteps={catalog.steps}
      factoryOptions={factoryOptions}
      initialQuantity={initialQty}
      initialSalesOrder={soRef}
      initialType={initialType}
      mode="create"
      supplierOptions={supplierOptions}
      templateOptions={templateOptions}
      useDeps={catalog.useDeps}
    />
  );
}
