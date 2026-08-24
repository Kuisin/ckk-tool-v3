import { InvoiceTable } from "@/components/billing/invoices/InvoiceTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchInvoices } from "./data";

export const dynamic = "force-dynamic";

/** 請求書 一覧 (BL01). */
export default async function BillingInvoicesPage() {
  const denied = await requireAppRead("invoices");
  if (denied) return denied;
  const rows = await fetchInvoices();
  return <InvoiceTable rows={rows} />;
}
