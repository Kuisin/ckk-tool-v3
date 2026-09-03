import { notFound, redirect } from "next/navigation";
import { isEditable } from "@/components/sales/quotes/model";
import { QuoteForm } from "@/components/sales/quotes/QuoteForm";
import { requireAppRead } from "@/lib/authz-page";
import { parseDocKey } from "@/lib/doc-number";
import { fetchCustomerOptions } from "../../../trial-estimates/data";
import {
  fetchBranchesByCustomer,
  fetchEntriesForCustomer,
  fetchQuote,
} from "../../data";

export const dynamic = "force-dynamic";

/**
 * 見積書 編集 (SA23 → edit).
 *
 * 編集できるのは下書き（DRAFT）のみ — それ以外は詳細へリダイレクト
 * （サーバーアクション側でも同じガードを行う）。直したくなったら複製する。
 */
export default async function SalesQuotesEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("quotes");
  if (denied) return denied;
  const { id } = await params;
  const key = parseDocKey(id, "QOT");
  if (!key) notFound();

  const [quote, customerOptions, branchesByCustomer, entries] =
    await Promise.all([
      fetchQuote(key),
      fetchCustomerOptions(),
      fetchBranchesByCustomer(),
      fetchEntriesForCustomer(),
    ]);
  if (!quote) notFound();
  if (!isEditable(quote)) {
    redirect(`/sales/quotes/${quote.quoteNumber}`);
  }

  return (
    <QuoteForm
      branchesByCustomer={branchesByCustomer}
      customerOptions={customerOptions}
      entries={entries}
      mode="edit"
      quote={quote}
    />
  );
}
