import { QuoteForm } from "@/components/sales/quotes/QuoteForm";
import { requireAppRead } from "@/lib/authz-page";
import { issuingCompanyFieldForSession } from "@/lib/doc-company";
import { parseDocKey } from "@/lib/doc-number";
import { resolveDocId } from "@/lib/doc-ref";
import { loadTaxCatalog } from "@/lib/tax-categories";
import { fetchCustomerOptions } from "../../trial-estimates/data";
import {
  fetchBranchesByCustomer,
  fetchCustomerTaxCategories,
  fetchEntriesForCustomer,
  fetchProductTaxCategories,
  fetchQuote,
} from "../data";

export const dynamic = "force-dynamic";

/** クエリ文字列の見積書 id → 鍵（番号だけ・旧番号は DB を引く）。 */
async function quoteKeyFromQuery(id: string) {
  const key = parseDocKey(id, "QOT");
  if (key) return key;
  const r = await resolveDocId("quotes", id);
  return r.status === "ok" ? { docRef: r.docRef } : null;
}

/**
 * 見積書 新規作成 (SA13).
 *
 * 価格表の「見積書を作成」から `?customer=…&product=…&orderType=…&quantity=…`
 * 付きで開かれると、1行目が価格表解決済みの明細で事前入力される。
 * `?from=<見積書の id>` で既存見積書の複製（DRAFT として作成）。番号だけ・
 * 旧番号で来た場合は DB を引いて 1 件に決まるときだけ使う。
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
    /** 発行会社（自社法人 id）— 価格表から開いたとき、その価格表の会社。 */
    company?: string;
  }>;
}) {
  const denied = await requireAppRead("quotes");
  if (denied) return denied;
  const sp = await searchParams;
  const fromKey = sp.from ? await quoteKeyFromQuery(sp.from) : null;

  const [
    customerOptions,
    branchesByCustomer,
    entries,
    source,
    taxCategoryByCustomer,
    taxCatalog,
  ] = await Promise.all([
    fetchCustomerOptions(),
    fetchBranchesByCustomer(),
    fetchEntriesForCustomer(),
    fromKey ? fetchQuote(fromKey) : null,
    fetchCustomerTaxCategories(),
    loadTaxCatalog(),
  ]);
  const sessionCompany = await issuingCompanyFieldForSession();
  // 価格表は会社ごと — 価格表から開いた見積書は、その価格表の会社を初期値に
  // する（選べる会社のときだけ。選べない会社はサーバーも断る）。複製は元の会社。
  const wanted = sp.company ? Number(sp.company) : source?.ownCompanyId;
  const issuingCompany =
    wanted != null &&
    sessionCompany.selectable &&
    sessionCompany.options.some((o) => o.value === String(wanted))
      ? { ...sessionCompany, prefill: wanted }
      : sessionCompany;
  // 価格表に載っている製品だけ（フォームが選べるのはそれだけ）。
  const taxCategoryByProduct = await fetchProductTaxCategories(
    entries.map((e) => Number(e.itemId)),
  );

  const prefill = sp.customer
    ? {
        customerId: sp.customer,
        // `?product=` は価格表エントリの品目 id（items.id）。
        itemId: sp.product,
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
      issuingCompany={issuingCompany}
      mode="create"
      prefill={prefill}
      quote={duplicated}
      taxCatalog={taxCatalog}
      taxCategoryByCustomer={taxCategoryByCustomer}
      taxCategoryByProduct={taxCategoryByProduct}
    />
  );
}
