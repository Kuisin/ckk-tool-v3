import { notFound, redirect } from "next/navigation";
import { isEditable } from "@/components/production/sales-orders/model";
import { SalesOrderForm } from "@/components/production/sales-orders/SalesOrderForm";
import { parseSalesOrderKey } from "@/lib/doc-number";
import { fetchBranchesByCustomer } from "../../../../sales/quotes/data";
import { fetchSalesOrder } from "../../data";

export const dynamic = "force-dynamic";

/**
 * 注文請書 編集 (PD21 → edit)。
 *
 * 編集できるのは「下書きかつ未ロック」のみ — それ以外は詳細へリダイレクト
 * （サーバーアクション側でも同じガードを行う）。
 */
export default async function ProductionSalesOrdersEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const key = parseSalesOrderKey(decodeURIComponent(id));
  if (!key) notFound();

  const [order, branchesByCustomer] = await Promise.all([
    fetchSalesOrder(key),
    fetchBranchesByCustomer(),
  ]);
  if (!order) notFound();
  if (!isEditable(order)) redirect(`/production/sales-orders/${order.id}`);

  return (
    <SalesOrderForm
      branchesByCustomer={branchesByCustomer}
      mode="edit"
      order={order}
    />
  );
}
