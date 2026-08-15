import { OrderAcceptanceCreateForm } from "@/components/sales/order-acceptances/OrderAcceptanceCreateForm";
import { requireAppRead } from "@/lib/authz-page";

/** 受注請書 手入力作成 (SA14). AI 取込を使わない MANUAL ルート。 */
export default async function SalesOrderAcceptancesNewPage() {
  const denied = await requireAppRead("order-acceptances");
  if (denied) return denied;
  return <OrderAcceptanceCreateForm />;
}
