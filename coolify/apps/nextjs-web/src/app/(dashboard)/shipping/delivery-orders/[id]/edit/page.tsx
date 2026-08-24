import { notFound, redirect } from "next/navigation";
import { DeliveryOrderForm } from "@/components/shipping/delivery-orders/DeliveryOrderForm";
import { isEditable } from "@/components/shipping/delivery-orders/model";
import { requireAppRead } from "@/lib/authz-page";
import { parseDocKey } from "@/lib/doc-number";
import { fetchPlantOptions } from "../../../../production/work-orders/data";
import { fetchDeliveryOrder } from "../../data";

export const dynamic = "force-dynamic";

/**
 * 出荷書 編集 (SH21 → edit)。
 *
 * 編集できるのは下書きのみ — それ以外は詳細へリダイレクト
 * （サーバーアクション側でも同じガードを行う）。
 */
export default async function ShippingDeliveryOrdersEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("delivery-orders");
  if (denied) return denied;
  const { id } = await params;
  const key = parseDocKey(decodeURIComponent(id), "DOR");
  if (!key) notFound();

  const [order, plantOptions] = await Promise.all([
    fetchDeliveryOrder(key),
    fetchPlantOptions(),
  ]);
  if (!order) notFound();
  if (!isEditable(order)) redirect(`/shipping/delivery-orders/${order.id}`);

  return (
    <DeliveryOrderForm mode="edit" order={order} plantOptions={plantOptions} />
  );
}
