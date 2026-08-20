import { ShippingOrderForm } from "@/components/shipping/shipping-orders/ShippingOrderForm";
import { requireAppRead } from "@/lib/authz-page";
import {
  fetchOrderLineRef,
  fetchPlantOptions,
} from "../../../production/work-orders/data";

export const dynamic = "force-dynamic";

/**
 * 出荷書 新規作成 (SH11).
 *
 * 注文明細を選択すると完了済み指示書（ロット）から明細が既定生成される。
 * `?orderLine={uuid}` でその注文明細をプリセレクトできる（未処理出荷書 SH03 の
 * 「出荷書作成」からの起動用）。出荷元拠点 options は指示書ビルダーと同じ
 * 拠点マスタ参照を再利用する。
 */
export default async function ShippingShippingOrdersNewPage({
  searchParams,
}: {
  searchParams: Promise<{ orderLine?: string }>;
}) {
  const denied = await requireAppRead("shipping-orders");
  if (denied) return denied;
  const sp = await searchParams;
  const [plantOptions, orderLineRef] = await Promise.all([
    fetchPlantOptions(),
    sp.orderLine ? fetchOrderLineRef(sp.orderLine) : null,
  ]);
  return (
    <ShippingOrderForm
      initialOrderLine={
        orderLineRef
          ? { id: orderLineRef.id, label: orderLineRef.label }
          : undefined
      }
      mode="create"
      plantOptions={plantOptions}
    />
  );
}
