import { QuoteForm } from "@/components/sales/quotes/QuoteForm";
import { parseDocKey } from "@/lib/doc-number";
import { fetchCustomerOptions } from "../../trial-estimates/data";
import {
  fetchBranchesByCustomer,
  fetchEntriesForCustomer,
  fetchQuote,
} from "../data";

export const dynamic = "force-dynamic";

/**
 * 見積書 新規作成 (SA12).
 *
 * 価格表の「見積書を作成」から `?customer=…&product=…&orderType=…&quantity=…`
 * 付きで開かれると、1行目が価格表解決済みの明細で事前入力される。
 * `?from=QOT-…` で既存見積書の複製（DRAFT として作成）。
 */
export default async function SalesQuotesNewPage({
  searchParams,
}: {
  searchParams: Promise<{
    customer?: string;
    product?: string;
    orderType?: string;
    quantity?: string;
    delivery?: string;
    from?: string;
  }>;
}) {
  const sp = await searchParams;
  const fromKey = sp.from ? parseDocKey(sp.from, "QOT") : null;

  const [customerOptions, branchesByCustomer, entries, source] =
    await Promise.all([
      fetchCustomerOptions(),
      fetchBranchesByCustomer(),
      fetchEntriesForCustomer(),
      fromKey ? fetchQuote(fromKey) : null,
    ]);

  const prefill = sp.customer
    ? {
        customerId: sp.customer,
        productId: sp.product,
        orderType: sp.orderType,
        quantity: sp.quantity ? Number(sp.quantity) : undefined,
        deliveryDate: sp.delivery ?? null,
      }
    : undefined;

  // 複製: 元の内容を DRAFT の新規フォームに流し込む（番号は保存時に採番）。
  const duplicated = source ? { ...source, status: "DRAFT" as const } : null;

  return (
    <QuoteForm
      branchesByCustomer={branchesByCustomer}
      customerOptions={customerOptions}
      entries={entries}
      mode="create"
      prefill={prefill}
      quote={duplicated}
    />
  );
}
