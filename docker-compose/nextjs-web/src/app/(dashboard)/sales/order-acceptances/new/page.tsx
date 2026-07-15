import { OrderAcceptanceCreateForm } from "@/components/sales/order-acceptances/OrderAcceptanceCreateForm";

/** 受注請書 手入力作成 (SA13). AI 取込を使わない MANUAL ルート。 */
export default function SalesOrderAcceptancesNewPage() {
  return <OrderAcceptanceCreateForm />;
}
