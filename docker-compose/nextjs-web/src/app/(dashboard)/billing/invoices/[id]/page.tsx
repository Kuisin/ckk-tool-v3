import { notFound } from "next/navigation";
import { InvoiceDetail } from "@/components/billing/invoices/InvoiceDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { formatDocNumber, parseDocKey } from "@/lib/doc-number";
import { listMemos } from "@/lib/document-memos";
import { isIssued, pdfStorageKey, storedPdfMeta } from "@/lib/document-pdf";
import { fetchInvoice } from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return { title: `請求書 ${decodeURIComponent(id)} | CKK 業務管理システム` };
}

/** 請求書 詳細 (BL21). URL id = 導出文書番号 INV-YYYYMM-NNNNN. */
export default async function BillingInvoicesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("invoices");
  if (denied) return denied;
  const { id } = await params;
  const key = parseDocKey(decodeURIComponent(id), "INV");
  if (!key) notFound();

  const [invoice, auditEntries, memos] = await Promise.all([
    fetchInvoice(key),
    fetchAuditEntries("invoices", formatDocNumber("INV", key)),
    listMemos("invoices", formatDocNumber("INV", key)),
  ]);
  if (!invoice) notFound();

  // 保管済み PDF のメタ（発行済みのみ。未生成なら null → 初回表示時に生成）。
  const pdfMeta = isIssued(invoice.status)
    ? await storedPdfMeta(pdfStorageKey.invoice(invoice.invoiceNumber))
    : null;

  return (
    <InvoiceDetail
      auditEntries={auditEntries}
      invoice={invoice}
      memos={memos}
      pdfMeta={pdfMeta}
    />
  );
}
