import { notFound } from "next/navigation";
import { QuoteDetail } from "@/components/sales/quotes/QuoteDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { formatQuoteNumber, parseDocKey } from "@/lib/doc-number";
import { fetchEntriesForQuote, fetchQuote } from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return { title: `見積書 ${decodeURIComponent(id)} | CKK 業務管理システム` };
}

/** 見積書 詳細 (SA22). URL id = 導出文書番号 QOT-YYYYMM-NNNNN. */
export default async function SalesQuotesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const key = parseDocKey(id, "QOT");
  if (!key) notFound();

  const [quote, relatedEntries, auditEntries] = await Promise.all([
    fetchQuote(key),
    fetchEntriesForQuote(key),
    fetchAuditEntries("quotes", formatQuoteNumber(key)),
  ]);
  if (!quote) notFound();

  return (
    <QuoteDetail
      auditEntries={auditEntries}
      quote={quote}
      relatedEntries={relatedEntries}
    />
  );
}
