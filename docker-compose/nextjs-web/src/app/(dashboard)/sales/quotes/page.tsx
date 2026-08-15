import { QuoteTable } from "@/components/sales/quotes/QuoteTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchCustomerOptions } from "../trial-estimates/data";
import { fetchQuotes } from "./data";

export const dynamic = "force-dynamic";

/** 見積書 一覧 (SA03). */
export default async function SalesQuotesPage() {
  const denied = await requireAppRead("quotes");
  if (denied) return denied;
  const [rows, customerOptions] = await Promise.all([
    fetchQuotes(),
    fetchCustomerOptions(),
  ]);
  return <QuoteTable customerOptions={customerOptions} rows={rows} />;
}
