import { QuoteTable } from "@/components/sales/quotes/QuoteTable";
import { fetchCustomerOptions } from "../trial-estimates/data";
import { fetchQuotes } from "./data";

export const dynamic = "force-dynamic";

/** 見積書 一覧 (SA02). */
export default async function SalesQuotesPage() {
  const [rows, customerOptions] = await Promise.all([
    fetchQuotes(),
    fetchCustomerOptions(),
  ]);
  return <QuoteTable customerOptions={customerOptions} rows={rows} />;
}
