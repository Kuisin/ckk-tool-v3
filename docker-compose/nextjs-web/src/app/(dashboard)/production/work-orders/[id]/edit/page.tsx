import { notFound, redirect } from "next/navigation";
import { WorkflowBuilder } from "@/components/production/work-orders/WorkflowBuilder";
import { loadCatalog } from "@/lib/workflow";
import {
  fetchFactoryOptions,
  fetchInspectionTemplateOptions,
  fetchSupplierOptions,
  fetchWorkOrder,
} from "../../data";

export const dynamic = "force-dynamic";

/** 指示書 編集 (PD22 → edit). DRAFT のみ — それ以外は詳細へ戻す。 */
export default async function ProductionWorkOrdersEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workOrderNumber = Number(id);
  if (!Number.isInteger(workOrderNumber) || workOrderNumber < 1) notFound();

  const workOrder = await fetchWorkOrder(workOrderNumber);
  if (!workOrder) notFound();
  if (workOrder.status !== "DRAFT") {
    redirect(`/production/work-orders/${workOrderNumber}`);
  }

  const [catalog, factoryOptions, templateOptions, supplierOptions] =
    await Promise.all([
      loadCatalog(),
      fetchFactoryOptions(),
      fetchInspectionTemplateOptions(),
      fetchSupplierOptions(),
    ]);

  return (
    <WorkflowBuilder
      catalogSteps={catalog.steps}
      factoryOptions={factoryOptions}
      mode="edit"
      supplierOptions={supplierOptions}
      templateOptions={templateOptions}
      useDeps={catalog.useDeps}
      workOrder={workOrder}
    />
  );
}
