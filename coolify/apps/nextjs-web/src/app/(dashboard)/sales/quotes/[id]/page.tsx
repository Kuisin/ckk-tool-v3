import { notFound } from "next/navigation";
import { QuoteDetail } from "@/components/sales/quotes/QuoteDetail";
import { appLabelForKey } from "@/lib/app-list";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { docNo } from "@/lib/doc-number";
import { docKeyFromParam } from "@/lib/doc-param";
import { listMemos } from "@/lib/document-memos";
import { isIssued, pdfStorageKey, storedPdfMeta } from "@/lib/document-pdf";
import { formatDocPageTitle } from "@/lib/page-title";
import { getServerLocale } from "@/lib/user-preferences";
import { fetchDesignRequestsForQuote } from "../../design-requests/data";
import { fetchOrderAcceptancesForQuote } from "../../order-acceptances/data";
import { fetchEntriesForQuote, fetchQuote } from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getServerLocale();
  return {
    title: formatDocPageTitle(
      appLabelForKey("quotes", "見積書", locale), // i18n-ignore — ja はそのまま使う（訳の実体は appLabelForKey 内の en/zh マップ）
      docNo(decodeURIComponent(id)),
    ),
  };
}

/** 見積書 詳細 (SA23). URL id = 法人コード付きの番号（CKK~QOT-2026-00001）。 */
export default async function SalesQuotesDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await requireAppRead("quotes");
  if (denied) return denied;
  const { id } = await params;
  const key = await docKeyFromParam(
    "quotes",
    "QOT",
    id,
    "/sales/quotes",
    "",
    searchParams,
  );

  const [
    quote,
    relatedEntries,
    auditEntries,
    memos,
    designRequests,
    acceptances,
  ] = await Promise.all([
    fetchQuote(key),
    fetchEntriesForQuote(key),
    fetchAuditEntries("quotes", key.docRef),
    listMemos("quotes", key.docRef),
    // §10 設計依頼は見積と並行する側枝 — 関連タブに逆リンクを出す。
    fetchDesignRequestsForQuote(key),
    // 手続き状況の「次の書類へ」— この見積から起きた注文請書。
    fetchOrderAcceptancesForQuote(key),
  ]);
  if (!quote) notFound();

  // 保管済み PDF のメタ（発行済みのみ。未生成なら null → 初回表示時に生成）。
  const pdfMeta = isIssued(quote.status)
    ? await storedPdfMeta(pdfStorageKey.quote(quote.quoteNumber))
    : null;

  return (
    <QuoteDetail
      acceptances={acceptances}
      auditEntries={auditEntries}
      designRequests={designRequests}
      memos={memos}
      pdfMeta={pdfMeta}
      quote={quote}
      relatedEntries={relatedEntries}
    />
  );
}
