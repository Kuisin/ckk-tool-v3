import { notFound } from "next/navigation";
import { ShippingOrderDetail } from "@/components/shipping/shipping-orders/ShippingOrderDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { formatDocNumber, parseDocKey } from "@/lib/doc-number";
import { fetchShippingOrder } from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return { title: `出荷書 ${decodeURIComponent(id)} | CKK 業務管理システム` };
}

/** 出荷書 詳細 (SH21). URL id = 導出文書番号 SHP-YYYYMM-NNNNN. */
export default async function ShippingShippingOrdersDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const key = parseDocKey(decodeURIComponent(id), "SHP");
  if (!key) notFound();

  const [order, auditEntries] = await Promise.all([
    fetchShippingOrder(key),
    fetchAuditEntries("shipping_orders", formatDocNumber("SHP", key)),
  ]);
  if (!order) notFound();

  return <ShippingOrderDetail auditEntries={auditEntries} order={order} />;
}
