import { QuoteForm } from "@/components/sales/quotes/QuoteForm";

/**
 * 見積書 新規作成 (SA12).
 *
 * 価格表の「見積書を作成」から `?customer=…&product=…&orderType=…&quantity=…`
 * 付きで開かれると、1行目が価格表解決済みの明細で事前入力される。
 */
export default async function SalesQuotesNewPage({
  searchParams,
}: {
  searchParams: Promise<{
    customer?: string;
    product?: string;
    orderType?: string;
    quantity?: string;
    discount?: string;
    delivery?: string;
  }>;
}) {
  const sp = await searchParams;
  const prefill = sp.customer
    ? {
        customerId: sp.customer,
        productId: sp.product,
        orderType: sp.orderType,
        quantity: sp.quantity ? Number(sp.quantity) : undefined,
        discountAmount: sp.discount ? Number(sp.discount) : undefined,
        deliveryDate: sp.delivery ?? null,
      }
    : undefined;
  return <QuoteForm mode="create" prefill={prefill} />;
}
