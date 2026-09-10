import {
  fetchPlantOptions,
  fetchSupplierOptions,
} from "@/app/(dashboard)/production/work-orders/data";
import { RouteEditorForm } from "@/components/master/products/RouteEditorForm";
import { requireAppRead } from "@/lib/authz-page";
import { loadCatalog } from "@/lib/workflow";

export const dynamic = "force-dynamic";

/** 準備工程リスト 新規作成（共通 — 製品も受注元も持たない）。 */
export default async function MasterPrepRouteNewPage() {
  const denied = await requireAppRead("master-process-steps");
  if (denied) return denied;
  const [catalog, plantOptions, supplierOptions] = await Promise.all([
    loadCatalog(),
    fetchPlantOptions(),
    fetchSupplierOptions(),
  ]);
  return (
    <RouteEditorForm
      catalogSteps={catalog.steps}
      kind="PREP"
      mode="create"
      plantOptions={plantOptions}
      supplierOptions={supplierOptions}
      useDeps={catalog.useDeps}
    />
  );
}
