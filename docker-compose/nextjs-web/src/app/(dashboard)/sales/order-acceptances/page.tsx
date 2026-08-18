import { OrderAcceptanceIntakeTable } from "@/components/sales/order-acceptances/OrderAcceptanceIntakeTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchOrderAcceptances } from "./data";

export const dynamic = "force-dynamic";

/** 受注請書 取込状況一覧 (SA04). 監視フォルダ / 優先取込 / 手入力の進捗管理。 */
export default async function OrderLineAcceptancesPage() {
  const denied = await requireAppRead("order-acceptances");
  if (denied) return denied;
  const rows = await fetchOrderAcceptances();
  return (
    <OrderAcceptanceIntakeTable
      intakeDirConfigured={Boolean(process.env.INTAKE_DIR)}
      rows={rows}
    />
  );
}
