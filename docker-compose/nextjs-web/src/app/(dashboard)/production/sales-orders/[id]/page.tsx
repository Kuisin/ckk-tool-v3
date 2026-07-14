import { notFound } from "next/navigation";
import { SalesOrderDetail } from "@/components/production/sales-orders/SalesOrderDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { formatSalesOrderNumber, parseSalesOrderKey } from "@/lib/doc-number";
import { fetchSalesOrder } from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return { title: `受注書 ${decodeURIComponent(id)} | CKK 業務管理システム` };
}

/** 受注書 詳細 (PD21). URL id = 導出文書番号 ORD-YYYYMM-NNNNN-NN. */
export default async function ProductionSalesOrdersDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const key = parseSalesOrderKey(decodeURIComponent(id));
  if (!key) notFound();

  const [order, auditEntries] = await Promise.all([
    fetchSalesOrder(key),
    fetchAuditEntries("sales_orders", formatSalesOrderNumber(key)),
  ]);
  if (!order) notFound();

  return <SalesOrderDetail auditEntries={auditEntries} order={order} />;
}
