import { WorkflowBuilder } from "@/components/production/work-orders/WorkflowBuilder";
import { requireAppRead } from "@/lib/authz-page";
import { loadCatalog } from "@/lib/workflow";
import {
  fetchInspectionTemplateOptions,
  fetchOrderLineRef,
  fetchPlantOptions,
  fetchSupplierOptions,
} from "../data";

export const dynamic = "force-dynamic";

/**
 * 指示書 新規作成 (PD12).
 *
 * `?orderLine={uuid}` で注文明細をプリセレクトできる（注文明細詳細からの起動用）。
 */
export default async function ProductionWorkOrdersNewPage({
  searchParams,
}: {
  searchParams: Promise<{ orderLine?: string; type?: string; qty?: string }>;
}) {
  const denied = await requireAppRead("work-orders");
  if (denied) return denied;
  const sp = await searchParams;
  const [catalog, plantOptions, templateOptions, supplierOptions, soRef] =
    await Promise.all([
      loadCatalog(),
      fetchPlantOptions(),
      fetchInspectionTemplateOptions(),
      fetchSupplierOptions(),
      sp.orderLine ? fetchOrderLineRef(sp.orderLine) : null,
    ]);

  const initialType =
    sp.type === "FROM_STOCK" || sp.type === "MANUFACTURE" ? sp.type : null;
  const initialQty = Number(sp.qty) > 0 ? Number(sp.qty) : null;

  return (
    <WorkflowBuilder
      catalogSteps={catalog.steps}
      initialOrderLine={soRef}
      initialQuantity={initialQty}
      initialType={initialType}
      mode="create"
      plantOptions={plantOptions}
      supplierOptions={supplierOptions}
      templateOptions={templateOptions}
      useDeps={catalog.useDeps}
    />
  );
}
