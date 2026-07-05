import { notFound } from "next/navigation";
import { QuoteForm } from "@/components/sales/quotes/QuoteForm";
import { parseDocKey } from "@/lib/doc-number";
import {
  fetchCustomerOptions,
  fetchProductOptions,
} from "../../../trial-estimates/data";
import {
  fetchBranchesByCustomer,
  fetchEntriesForCustomer,
  fetchQuote,
} from "../../data";

export const dynamic = "force-dynamic";

/** 見積書 編集 (SA22 → edit). */
export default async function SalesQuotesEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const key = parseDocKey(id, "QOT");
  if (!key) notFound();

  const [quote, customerOptions, productOptions, branchesByCustomer, entries] =
    await Promise.all([
      fetchQuote(key),
      fetchCustomerOptions(),
      fetchProductOptions(),
      fetchBranchesByCustomer(),
      fetchEntriesForCustomer(),
    ]);
  if (!quote) notFound();

  return (
    <QuoteForm
      branchesByCustomer={branchesByCustomer}
      customerOptions={customerOptions}
      entries={entries}
      mode="edit"
      productOptions={productOptions}
      quote={quote}
    />
  );
}
