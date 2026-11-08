import { WorkflowBuilder } from "@/components/production/work-orders/WorkflowBuilder";
import { requireAppRead } from "@/lib/authz-page";
import {
  fetchAllowedWorkLocationMap,
  fetchWorkLocationOptions,
} from "@/lib/work-locations";
import { workOrderTypeForLine } from "@/lib/work-order-alloc-core";
import { loadCatalog } from "@/lib/workflow";
import {
  fetchEmployeeOptions,
  fetchInspectionTemplateOptions,
  fetchOrderLineRef,
  fetchPlantOptions,
  fetchStorageLocationOptions,
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
  const [
    catalog,
    plantOptions,
    templateOptions,
    supplierOptions,
    storageLocationOptions,
    employeeOptions,
    workLocationOptions,
    allowedWorkLocations,
    soRef,
  ] = await Promise.all([
    loadCatalog(),
    fetchPlantOptions(),
    fetchInspectionTemplateOptions(),
    fetchSupplierOptions(),
    fetchStorageLocationOptions(),
    fetchEmployeeOptions(),
    fetchWorkLocationOptions(),
    fetchAllowedWorkLocationMap(),
    sp.orderLine ? fetchOrderLineRef(sp.orderLine) : null,
  ]);

  // **種別は注文明細が決める。** URL の `type` は在庫分 / 製造分 の希望を
  // 伝えるだけで、再研磨かどうかは明細の注文種別から導く
  // （workOrderTypeForLine が唯一の定義元）。呼び出し側が `&type=REGRIND` を
  // 付け忘れても再研磨の指示書になるし、明細と食い違う type を URL に書いても
  // 明細が勝つ。
  const preferred =
    sp.type === "FROM_STOCK" || sp.type === "MANUFACTURE" ? sp.type : null;
  const initialType = soRef
    ? workOrderTypeForLine(soRef.orderType, preferred)
    : preferred;
  const initialQty = Number(sp.qty) > 0 ? Number(sp.qty) : null;

  return (
    <WorkflowBuilder
      allowedWorkLocations={allowedWorkLocations}
      catalogSteps={catalog.steps}
      employeeOptions={employeeOptions}
      initialOrderLine={soRef}
      initialQuantity={initialQty}
      initialType={initialType}
      mode="create"
      plantOptions={plantOptions}
      storageLocationOptions={storageLocationOptions}
      supplierOptions={supplierOptions}
      templateOptions={templateOptions}
      useDeps={catalog.useDeps}
      workLocationOptions={workLocationOptions}
    />
  );
}
