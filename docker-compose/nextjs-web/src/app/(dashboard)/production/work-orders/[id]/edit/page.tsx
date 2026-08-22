import { notFound, redirect } from "next/navigation";
import { WorkflowBuilder } from "@/components/production/work-orders/WorkflowBuilder";
import { requireAppRead } from "@/lib/authz-page";
import { loadCatalog } from "@/lib/workflow";
import {
  fetchEmployeeOptions,
  fetchInspectionTemplateOptions,
  fetchPlantOptions,
  fetchStorageLocationOptions,
  fetchSupplierOptions,
  fetchWorkOrder,
  resolveWorkOrderIdParam,
} from "../../data";

export const dynamic = "force-dynamic";

/** 指示書 編集 (PD22 → edit). DRAFT のみ — それ以外は詳細へ戻す。 */
export default async function ProductionWorkOrdersEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("work-orders");
  if (denied) return denied;
  const { id } = await params;
  const workOrderNumber = await resolveWorkOrderIdParam(id);
  if (workOrderNumber == null) notFound();

  const workOrder = await fetchWorkOrder(workOrderNumber);
  if (!workOrder) notFound();
  if (workOrder.status !== "DRAFT") {
    redirect(`/production/work-orders/${workOrderNumber}`);
  }

  const [
    catalog,
    plantOptions,
    templateOptions,
    supplierOptions,
    storageLocationOptions,
    employeeOptions,
  ] = await Promise.all([
    loadCatalog(),
    fetchPlantOptions(),
    fetchInspectionTemplateOptions(),
    fetchSupplierOptions(),
    fetchStorageLocationOptions(),
    fetchEmployeeOptions(),
  ]);

  return (
    <WorkflowBuilder
      catalogSteps={catalog.steps}
      employeeOptions={employeeOptions}
      mode="edit"
      plantOptions={plantOptions}
      storageLocationOptions={storageLocationOptions}
      supplierOptions={supplierOptions}
      templateOptions={templateOptions}
      useDeps={catalog.useDeps}
      workOrder={workOrder}
    />
  );
}
