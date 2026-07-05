import { QuoteForm } from "@/components/sales/quotes/QuoteForm";

/** 見積書 編集 (SA22 → edit). */
export default async function SalesQuotesEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <QuoteForm mode="edit" quoteId={id} />;
}
