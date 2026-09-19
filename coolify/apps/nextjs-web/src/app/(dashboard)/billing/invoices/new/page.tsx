import { ManualInvoiceForm } from "@/components/billing/invoices/ManualInvoiceForm";
import { requireAppRead } from "@/lib/authz-page";
import { fetchCustomerOptions } from "../../../sales/trial-estimates/data";

export const dynamic = "force-dynamic";

/**
 * 手動請求 新規作成 (BL11).
 *
 * 締日を待たず、選んだ出荷から臨時の請求書を起こす（§9）。作成の実際の
 * 権限ゲートは createManualInvoice（invoice:CREATE）— ここは閲覧の入口だけ。
 */
export default async function BillingInvoicesNewPage() {
  const denied = await requireAppRead("invoices");
  if (denied) return denied;
  const customerOptions = await fetchCustomerOptions();
  return <ManualInvoiceForm customerOptions={customerOptions} />;
}
