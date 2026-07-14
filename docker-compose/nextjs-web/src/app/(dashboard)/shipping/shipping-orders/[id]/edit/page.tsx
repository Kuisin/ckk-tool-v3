import { notFound, redirect } from "next/navigation";
import { isEditable } from "@/components/shipping/shipping-orders/model";
import { ShippingOrderForm } from "@/components/shipping/shipping-orders/ShippingOrderForm";
import { parseDocKey } from "@/lib/doc-number";
import { fetchFactoryOptions } from "../../../../production/work-orders/data";
import { fetchShippingOrder } from "../../data";

export const dynamic = "force-dynamic";

/**
 * 出荷書 編集 (SH21 → edit)。
 *
 * 編集できるのは下書きのみ — それ以外は詳細へリダイレクト
 * （サーバーアクション側でも同じガードを行う）。
 */
export default async function ShippingShippingOrdersEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const key = parseDocKey(decodeURIComponent(id), "SHP");
  if (!key) notFound();

  const [order, factoryOptions] = await Promise.all([
    fetchShippingOrder(key),
    fetchFactoryOptions(),
  ]);
  if (!order) notFound();
  if (!isEditable(order)) redirect(`/shipping/shipping-orders/${order.id}`);

  return (
    <ShippingOrderForm
      factoryOptions={factoryOptions}
      mode="edit"
      order={order}
    />
  );
}
