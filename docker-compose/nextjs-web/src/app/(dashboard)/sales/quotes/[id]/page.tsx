import { QuoteDetail } from "@/components/sales/quotes/QuoteDetail";

/** 見積書 詳細 (SA22). */
export default async function SalesQuotesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <QuoteDetail id={id} />;
}
