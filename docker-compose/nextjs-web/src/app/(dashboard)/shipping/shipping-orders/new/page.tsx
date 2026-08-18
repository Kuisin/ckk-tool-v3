import { ShippingOrderForm } from "@/components/shipping/shipping-orders/ShippingOrderForm";
import { requireAppRead } from "@/lib/authz-page";
import { fetchPlantOptions } from "../../../production/work-orders/data";

export const dynamic = "force-dynamic";

/**
 * 出荷書 新規作成 (SH11).
 *
 * 注文明細を選択すると完了済み指示書（ロット）から明細が既定生成される。
 * 出荷元拠点 options は指示書ビルダーと同じ拠点マスタ参照を再利用する。
 */
export default async function ShippingShippingOrdersNewPage() {
  const denied = await requireAppRead("shipping-orders");
  if (denied) return denied;
  const plantOptions = await fetchPlantOptions();
  return <ShippingOrderForm mode="create" plantOptions={plantOptions} />;
}
