import { OrderAcceptanceCreateForm } from "@/components/sales/order-acceptances/OrderAcceptanceCreateForm";
import { requireAppRead } from "@/lib/authz-page";
import { fetchWorkLocationOptions } from "@/lib/work-locations";
import { fetchPlantOptions } from "../data";

/** 注文請書 手入力作成 (SA14). AI 取込を使わない MANUAL ルート。 */
export default async function OrderLineAcceptancesNewPage() {
  const denied = await requireAppRead("order-acceptances");
  if (denied) return denied;
  const [plantOptions, workLocationOptions] = await Promise.all([
    fetchPlantOptions(),
    fetchWorkLocationOptions(),
  ]);
  return (
    <OrderAcceptanceCreateForm
      plantOptions={plantOptions}
      workLocationOptions={workLocationOptions}
    />
  );
}
