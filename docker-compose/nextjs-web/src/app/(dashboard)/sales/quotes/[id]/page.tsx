import { notFound } from "next/navigation";
import { QuoteDetail } from "@/components/sales/quotes/QuoteDetail";
import { parseDocKey } from "@/lib/doc-number";
import { fetchEntriesForQuote, fetchQuote } from "../data";

export const dynamic = "force-dynamic";

/** 見積書 詳細 (SA22). URL id = 導出文書番号 QOT-YYYYMM-NNNNN. */
export default async function SalesQuotesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const key = parseDocKey(id, "QOT");
  if (!key) notFound();

  const [quote, relatedEntries] = await Promise.all([
    fetchQuote(key),
    fetchEntriesForQuote(key),
  ]);
  if (!quote) notFound();

  return <QuoteDetail quote={quote} relatedEntries={relatedEntries} />;
}
