import { notFound } from "next/navigation";
import { QuoteDetail } from "@/components/sales/quotes/QuoteDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { formatQuoteNumber, parseDocKey } from "@/lib/doc-number";
import { listMemos } from "@/lib/document-memos";
import { isIssued, pdfStorageKey, storedPdfMeta } from "@/lib/document-pdf";
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

/** 見積書 詳細 (SA23). URL id = 導出文書番号 QOT-YYYYMM-NNNNN. */
export default async function SalesQuotesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("quotes");
  if (denied) return denied;
  const { id } = await params;
  const key = parseDocKey(id, "QOT");
  if (!key) notFound();

  const [quote, relatedEntries, auditEntries, memos] = await Promise.all([
    fetchQuote(key),
    fetchEntriesForQuote(key),
    fetchAuditEntries("quotes", formatQuoteNumber(key)),
    listMemos("quotes", formatQuoteNumber(key)),
  ]);
  if (!quote) notFound();

  // 保管済み PDF のメタ（発行済みのみ。未生成なら null → 初回表示時に生成）。
  const pdfMeta = isIssued(quote.status)
    ? await storedPdfMeta(pdfStorageKey.quote(quote.quoteNumber))
    : null;

  return (
    <QuoteDetail
      auditEntries={auditEntries}
      memos={memos}
      pdfMeta={pdfMeta}
      quote={quote}
      relatedEntries={relatedEntries}
    />
  );
}
