import { fetchBillingOptions } from "@/app/(dashboard)/master/_shared/bp-data";
import { DesignRequestForm } from "@/components/sales/design-requests/DesignRequestForm";
import { requireAppRead } from "@/lib/authz-page";
import {
  fetchEmployeeOptions,
  fetchOrderLineCustomerBpId,
  fetchOrderLineDeliveryDate,
  fetchOrderLineRef,
  fetchProductItemRef,
  fetchQuoteRef,
  fetchRecentQuoteOptions,
} from "../data";

export const dynamic = "force-dynamic";

/**
 * 設計依頼書 新規作成 (SA16)。
 *
 * 保存時に依頼番号 DSG-FFFF-NNNNN が採番される（DB が払い出す）。保存後は
 * 詳細ページへ遷移。
 *
 * 見積書 / 注文明細 / 製品からの起票をクエリで受ける:
 *   `?quote=<見積書の id>` — 見積書詳細から（トリガー = 見積時。番号だけ・旧番号も可）
 *   `?orderLine=<uuid>`       — 注文明細詳細から（トリガー = 受注時）
 *   `?item=<items.id>`        — 見積明細の単価未解決から（品目 id）
 * **id はここで実在を確かめてラベル付きの ref に解決してから**フォームへ渡す
 * （生のクエリ文字列をクライアントへ流さない — 存在しない番号でトリガーだけ
 * 固定される事故を防ぐ）。
 */
export default async function SalesDesignRequestsNewPage({
  searchParams,
}: {
  searchParams: Promise<{
    quote?: string;
    orderLine?: string;
    item?: string;
  }>;
}) {
  const denied = await requireAppRead("design-requests");
  if (denied) return denied;
  const sp = await searchParams;

  const [
    quoteOptions,
    assigneeOptions,
    quoteRef,
    orderLineRef,
    productRef,
    customerOptions,
    orderLineCustomer,
    orderLineDeliveryDate,
  ] = await Promise.all([
    // 見積書リンク用 — 直近の見積書をサーバーで読み込んで Select に渡す。
    fetchRecentQuoteOptions(),
    fetchEmployeeOptions(),
    sp.quote ? fetchQuoteRef(sp.quote) : null,
    sp.orderLine ? fetchOrderLineRef(sp.orderLine) : null,
    sp.item ? fetchProductItemRef(sp.item) : null,
    // 版が載る系列（受注元）の候補。
    fetchBillingOptions(),
    sp.orderLine ? fetchOrderLineCustomerBpId(sp.orderLine) : null,
    // 受注時トリガーは、その明細の納期を希望納期の既定にする。
    sp.orderLine ? fetchOrderLineDeliveryDate(sp.orderLine) : null,
  ]);

  // 見積・受注から起票したときは、その書類の顧客を受注元の既定にする。
  const initialCustomerBpId = quoteRef?.customerBpId ?? orderLineCustomer;

  return (
    <DesignRequestForm
      assigneeOptions={assigneeOptions}
      customerOptions={customerOptions}
      initialCustomerBpId={initialCustomerBpId}
      initialDesiredAt={orderLineDeliveryDate}
      initialOrderLine={
        orderLineRef
          ? { value: orderLineRef.id, label: orderLineRef.label }
          : null
      }
      initialProduct={productRef}
      initialQuote={quoteRef}
      mode="create"
      quoteOptions={quoteOptions}
    />
  );
}
