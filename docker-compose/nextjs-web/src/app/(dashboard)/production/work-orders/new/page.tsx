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
 * `?salesOrder={uuid}` で受注書をプリセレクトできる（受注書詳細からの起動用）。
 */
export default async function ProductionWorkOrdersNewPage({
  searchParams,
}: {
  searchParams: Promise<{ salesOrder?: string }>;
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

  return (
    <WorkflowBuilder
      catalogSteps={catalog.steps}
      factoryOptions={factoryOptions}
      initialSalesOrder={soRef}
      mode="create"
      supplierOptions={supplierOptions}
      templateOptions={templateOptions}
      useDeps={catalog.useDeps}
    />
  );
}
