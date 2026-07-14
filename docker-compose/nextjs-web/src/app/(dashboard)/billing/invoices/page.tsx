import { InvoiceTable } from "@/components/billing/invoices/InvoiceTable";
import { fetchInvoices } from "./data";

export const dynamic = "force-dynamic";

/** 請求書 一覧 (BL01). */
export default async function BillingInvoicesPage() {
  const rows = await fetchInvoices();
  return <InvoiceTable rows={rows} />;
}
