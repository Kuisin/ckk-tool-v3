import { SalesOrderForm } from "@/components/production/sales-orders/SalesOrderForm";
import { fetchBranchesByCustomer } from "../../../sales/quotes/data";

export const dynamic = "force-dynamic";

/**
 * 注文請書 新規作成 (PD11) — 一括作成。
 *
 * 1回の保存で採番（yearMonth, seq）を1つ取り、明細行ごとに branch = 1..N の
 * 注文請書 ORD-YYYYMM-NNNNN-NN を作成する。保存後は先頭行（-01）の詳細へ。
 */
export default async function ProductionSalesOrdersNewPage() {
  // 支店 options — quotes と同じ親子 BP（parent_id）参照を再利用する。
  const branchesByCustomer = await fetchBranchesByCustomer();
  return (
    <SalesOrderForm branchesByCustomer={branchesByCustomer} mode="create" />
  );
}
