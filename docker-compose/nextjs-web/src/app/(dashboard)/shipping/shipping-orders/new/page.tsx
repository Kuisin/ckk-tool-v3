import { ShippingOrderForm } from "@/components/shipping/shipping-orders/ShippingOrderForm";
import { fetchFactoryOptions } from "../../../production/work-orders/data";

export const dynamic = "force-dynamic";

/**
 * 出荷書 新規作成 (SH11).
 *
 * 注文請書を選択すると完了済み指示書（ロット）から明細が既定生成される。
 * 出荷元工場 options は指示書ビルダーと同じ工場マスタ参照を再利用する。
 */
export default async function ShippingShippingOrdersNewPage() {
  const factoryOptions = await fetchFactoryOptions();
  return <ShippingOrderForm factoryOptions={factoryOptions} mode="create" />;
}
