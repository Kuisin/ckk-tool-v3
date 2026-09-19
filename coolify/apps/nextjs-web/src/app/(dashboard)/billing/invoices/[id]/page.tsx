import { notFound } from "next/navigation";
import { InvoiceDetail } from "@/components/billing/invoices/InvoiceDetail";
import { appLabelForKey } from "@/lib/app-list";
import { fetchApprovalState, fetchApprovalTrail } from "@/lib/approvals";
import { fetchAuditEntries } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { loadChargeItemOptions } from "@/lib/charge-items";
import { formatDocNumber, parseDocKey } from "@/lib/doc-number";
import { listMemos } from "@/lib/document-memos";
import { isIssued, pdfStorageKey, storedPdfMeta } from "@/lib/document-pdf";
import { formatDocPageTitle } from "@/lib/page-title";
import { getServerLocale } from "@/lib/user-preferences";
import { fetchInvoice } from "../data";

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
      appLabelForKey("invoices", "請求書", locale), // i18n-ignore — ja はそのまま使う（訳の実体は appLabelForKey 内の en/zh マップ）
      decodeURIComponent(id),
    ),
  };
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

  const number = formatDocNumber("INV", key);
  const [invoice, auditEntries, memos] = await Promise.all([
    fetchInvoice(key),
    fetchAuditEntries("invoices", number),
    listMemos("invoices", number),
  ]);
  if (!invoice) notFound();

  // 保管済み PDF のメタ（発行済みのみ。未生成なら null → 初回表示時に生成）。
  const pdfMeta = isIssued(invoice.status)
    ? await storedPdfMeta(pdfStorageKey.invoice(invoice.invoiceNumber))
    : null;

  // 承認は 2 か所（§9） — DRAFT なら発行前承認、SENT なら入金前承認。
  // どちらでもなければ承認の出番が無い（ISSUED / PAID）。
  const approvalType =
    invoice.status === "DRAFT"
      ? "invoices"
      : invoice.status === "SENT"
        ? "invoice_payments"
        : null;
  const [approval, approvalTrail] = approvalType
    ? await Promise.all([
        fetchApprovalState(approvalType, number),
        fetchApprovalTrail(approvalType, number),
      ])
    : [null, []];

  // 追加費用（§9） — 料金マスタの選択肢と、下書きだけ編集できるの判定。
  const locale = await getServerLocale();
  const [chargeItems, chargeAuthz] = await Promise.all([
    loadChargeItemOptions(locale),
    checkPermission("invoice", "UPDATE"),
  ]);

  return (
    <InvoiceDetail
      approval={approval}
      approvalTrail={approvalTrail}
      auditEntries={auditEntries}
      canEditCharges={chargeAuthz.ok && invoice.status === "DRAFT"}
      chargeItems={chargeItems}
      invoice={invoice}
      memos={memos}
      pdfMeta={pdfMeta}
    />
  );
}
