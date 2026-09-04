import { DeliveryOrderForm } from "@/components/shipping/delivery-orders/DeliveryOrderForm";
import { requireAppRead } from "@/lib/authz-page";
import {
  fetchOrderLineRef,
  fetchPlantOptions,
} from "../../../production/work-orders/data";
import { fetchWorkOrderDeliverySeed } from "../data";

export const dynamic = "force-dynamic";

/**
 * 出荷書 新規作成 (SH11).
 *
 * 注文請書を選択すると、出荷できる注文明細ごとにグループが既定生成される。
 * プリセレクト:
 *   `?orderLine={uuid}`  — その注文明細 1 件だけを追加（未処理出荷書 SH03 の
 *                          「出荷書作成」からの起動用）
 *   `?acceptance={ORD-…}` — その注文請書の出荷できる注文明細すべてを追加
 *                          （注文請書詳細 SA24 の「出荷書を作成」からの起動用）
 *   `?workOrder={番号}`   — その指示書が充当している注文明細を追加し、同じ
 *                          注文請書に他にも出せる明細があれば「まとめますか」と
 *                          聞く（指示書詳細 PD22 の「次のステップ」からの起動用）
 * 出荷元拠点 options は指示書ビルダーと同じ拠点マスタ参照を再利用する。
 */
export default async function ShippingDeliveryOrdersNewPage({
  searchParams,
}: {
  searchParams: Promise<{
    orderLine?: string;
    acceptance?: string;
    workOrder?: string;
  }>;
}) {
  const denied = await requireAppRead("delivery-orders");
  if (denied) return denied;
  const sp = await searchParams;
  // 指示書番号は通し連番の int。壊れた値は「指定なし」に倒す（404 にしない —
  // 空のフォームは出せるし、そのほうが現場が先に進める）。
  const workOrderNumber = Number(sp.workOrder);
  const [plantOptions, orderLineRef, workOrderSeed] = await Promise.all([
    fetchPlantOptions(),
    sp.orderLine ? fetchOrderLineRef(sp.orderLine) : null,
    Number.isSafeInteger(workOrderNumber) && workOrderNumber > 0
      ? fetchWorkOrderDeliverySeed(workOrderNumber)
      : null,
  ]);
  return (
    <DeliveryOrderForm
      initialAcceptance={sp.acceptance ?? undefined}
      initialOrderLine={
        orderLineRef
          ? { id: orderLineRef.id, label: orderLineRef.label }
          : undefined
      }
      initialWorkOrder={workOrderSeed ?? undefined}
      mode="create"
      plantOptions={plantOptions}
    />
  );
}
