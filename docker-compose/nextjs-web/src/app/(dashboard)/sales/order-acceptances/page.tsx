import { OrderAcceptanceIntakeTable } from "@/components/sales/order-acceptances/OrderAcceptanceIntakeTable";
import { fetchOrderAcceptances } from "./data";

export const dynamic = "force-dynamic";

/** 受注請書 取込状況一覧 (SA03). 監視フォルダ / 優先取込 / 手入力の進捗管理。 */
export default async function SalesOrderAcceptancesPage() {
  const rows = await fetchOrderAcceptances();
  return (
    <OrderAcceptanceIntakeTable
      intakeDirConfigured={Boolean(process.env.INTAKE_DIR)}
      rows={rows}
    />
  );
}
